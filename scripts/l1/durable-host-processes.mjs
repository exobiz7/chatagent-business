import { fileURLToPath } from "node:url";
import {spawn,spawnSync} from "node:child_process";
import {existsSync,mkdirSync,lstatSync,readFileSync,writeFileSync,openSync,closeSync,readSync,statSync,accessSync,constants as C} from "node:fs";
import {isAbsolute,join} from "node:path";
import {randomUUID,randomBytes,createHash} from "node:crypto";
import {setTimeout as delay} from "node:timers/promises";

const MAX_RUNNING=4,MAX_READ=16384,MAX_OUTPUT=1024*1024;
const digest=value=>createHash("sha256").update(JSON.stringify(value)).digest("hex");
const TERMINAL=new Set(["EXITED","FAILED","TERMINATED"]);
const safeDir=dir=>{
 const st=lstatSync(dir);
 if(!st.isDirectory()||st.isSymbolicLink()||(st.mode&0o077)!==0||
   (typeof process.getuid==="function"&&st.uid!==process.getuid()))throw Error("UNSAFE_JOB_DIR");
};
const safeFile=file=>{
 const st=lstatSync(file);
 if(!st.isFile()||st.isSymbolicLink()||(st.mode&0o077)!==0||
   (typeof process.getuid==="function"&&st.uid!==process.getuid()))throw Error("UNSAFE_JOB_FILE");
};
const procIdentity=pid=>{
 if(!Number.isInteger(pid)||pid<=0)return null;
 const r=spawnSync("/bin/ps",["-p",String(pid),"-o","lstart="],{encoding:"utf8",timeout:1500});
 const c=spawnSync("/bin/ps",["-p",String(pid),"-o","command="],{encoding:"utf8",timeout:1500});
 const st=spawnSync("/bin/ps",["-p",String(pid),"-o","stat="],{encoding:"utf8",timeout:1500});
 return r.status===0&&c.status===0&&st.status===0&&!st.stdout.trim().startsWith("Z")
  ?{start:r.stdout.trim(),command:c.stdout.trim()}:null;
};

export class DurableHostProcesses {
 constructor(broker,{runnerPath=fileURLToPath(new URL("./durable-process-runner.mjs",import.meta.url))}={}){
  this.broker=broker;
  this.dir=join(broker.dir,"jobs");
  if(!existsSync(this.dir))mkdirSync(this.dir,{mode:0o700});
  safeDir(this.dir);
  this.runnerPath=runnerPath;
 }
 itemFor(id){
  if(typeof id!=="string"||!/^[0-9a-f-]{36}$/i.test(id))throw Error("PROCESS_NOT_OWNED");
  const a=(this.broker.state.actions??[]).find(x=>x.processId===id);
  if(!a)throw Error("PROCESS_NOT_OWNED");
  if(a.stage!=="ISSUED"&&a.stage!=="EXITED"&&a.stage!=="FAILED"&&a.stage!=="TERMINATED")
   throw Error("RECOVERY_REQUIRED");
  return a;
 }
 jobDir(id){return join(this.dir,id);}
 manifest(a){
  if(!a.processId||!a.nonceDigest)return null;
  const dir=this.jobDir(a.processId);
  if(!existsSync(dir))return null; // RESERVED before any runner was started.
  safeDir(dir);
  const f=join(dir,"manifest.json");
  if(!existsSync(f))return null;
  safeFile(f);
  let m;
  try{m=JSON.parse(readFileSync(f,"utf8"));}
  catch{throw Error("RECOVERY_REQUIRED");}
  if(m.version!==1||m.processId!==a.processId||
    digest(m.nonce)!==a.nonceDigest||
    !["STARTING","RUNNING","TERMINATION_PENDING","EXITED","FAILED","TERMINATED","RECOVERY_REQUIRED"].includes(m.state))
    throw Error("RECOVERY_REQUIRED");
  if(!a.runnerPid){
   // Reconcile a crash AFTER launch but BEFORE HMAC-sealed PID binding.
   // Only a live supervisor with the expected unique job directory qualifies.
   const observed=procIdentity(m.runnerPid);
   if(!observed||observed.start!==m.runnerStartToken||
      !observed.command.includes("durable-process-runner.mjs")||
      !observed.command.includes(dir))return null;
   this.broker.bindAction(a.key,{processId:a.processId,runnerPid:m.runnerPid,
      runnerStartToken:m.runnerStartToken,nonceDigest:a.nonceDigest});
  }else if(m.runnerPid!==a.runnerPid||m.runnerStartToken!==a.runnerStartToken){
   throw Error("RECOVERY_REQUIRED");
  }
  return m;
 }
 sync(a){
  const m=this.manifest(a);
  if(!m)return {processId:a.processId,state:"RECOVERY_REQUIRED",startedAt:a.at,endedAt:null,
    exitCode:null,signal:null,bytesCaptured:0,truncated:false};
  let state=m.state;
  if(!TERMINAL.has(state)&&!this.runnerVerified(a)){
   // Unknown process ownership is fail-closed; never infer successful termination.
   state="RECOVERY_REQUIRED";
  }
  if(TERMINAL.has(state)&&a.stage==="ISSUED"){
   this.broker.markActionTerminal(a.key,state);
  }
  // The runner appends/fsyncs output while active; the terminal manifest is
  // immutable per transition and may lag intermediate streamed output.
  const log=join(this.jobDir(a.processId),"output.log");
  safeFile(log);
  const bytes=Math.min(MAX_OUTPUT,statSync(log).size);
  return {processId:a.processId,state,startedAt:m.startedAt,endedAt:m.endedAt,
   exitCode:m.exitCode,signal:m.signal,bytesCaptured:bytes,truncated:m.truncated};
 }
 runnerVerified(a){
  const p=procIdentity(a.runnerPid);
  return p!==null&&p.start===a.runnerStartToken&&
   p.command.includes("durable-process-runner.mjs")&&
   p.command.includes(this.jobDir(a.processId));
 }
 running(){
  // Unbound ISSUED slots are reserved capacity until manual reconciliation.
  return (this.broker.state.actions??[]).filter(a=>a.stage==="ISSUED")
   .filter(a=>!a.processId||!TERMINAL.has(this.sync(a).state)).length;
 }
 async start({executable,argv=[],cwd,timeoutMs=300000,idempotencyKey}){
  if(typeof executable!=="string"||!isAbsolute(executable)||executable.length>4096||
    !Array.isArray(argv)||argv.length>48||
    argv.some(x=>typeof x!=="string"||x.length>8192||x.includes("\0"))||
    typeof cwd!=="string"||!isAbsolute(cwd)||cwd.length>4096||
    !Number.isInteger(timeoutMs)||timeoutMs<100||timeoutMs>3600000||
    typeof idempotencyKey!=="string"||!/^[0-9a-fA-F-]{36}$/.test(idempotencyKey))
    throw Error("INVALID_EXECUTION");
  const input={executable,argv,cwd,timeoutMs},fingerprint=digest(input);
  const previous=(this.broker.state.actions??[]).find(x=>x.key===idempotencyKey);
  if(previous){
   if(previous.digest!==fingerprint)throw Error("IDEMPOTENCY_KEY_CONFLICT");
   if(!previous.processId)throw Error("ACTION_RECONCILIATION_REQUIRED");
   return this.sync(previous); // Never re-execute the same effect.
  }
  const decision=this.broker.accessDecision("host_exec",executable);
  if(!decision.allowed)throw Error(decision.reason);
  if(!this.broker.accessDecision("read",cwd).allowed)throw Error("ACCESS_REQUIRED");
  if(this.running()>=MAX_RUNNING)throw Error("PROCESS_LIMIT");
  if(!statSync(cwd).isDirectory())throw Error("INVALID_CWD");
  const st=statSync(executable);
  if(!st.isFile())throw Error("INVALID_EXECUTABLE");
  accessSync(executable,C.X_OK);

  const id=randomUUID(),nonce=randomBytes(32).toString("hex"),job=this.jobDir(id);
  // Persist the intended process identity in the first sealed action record.
  // If no runner ever starts, the key stays RESERVED/ISSUED: never replay.
  this.broker.reserveAction(idempotencyKey,fingerprint,{processId:id,nonceDigest:digest(nonce)});
  mkdirSync(job,{mode:0o700});safeDir(job);
  const config=join(job,"config.json");
  writeFileSync(config,JSON.stringify({...input,processId:id,nonce})+"\n",{encoding:"utf8",mode:0o600,flag:"wx"});
  let child;
  try{
   child=spawn(process.execPath,[this.runnerPath,job],{
    detached:true,stdio:"ignore",cwd,env:{
     PATH:process.env.PATH??"/usr/bin:/bin:/usr/sbin:/sbin",
     HOME:process.env.HOME??"",TMPDIR:process.env.TMPDIR??"/tmp",LANG:process.env.LANG??"en_US.UTF-8"
    }
   });
   child.on("error",()=>{/* sealed ISSUED fence prevents blind restart */});
   child.unref();
  }catch{throw Error("ACTION_RECONCILIATION_REQUIRED");}
  const pid=child.pid,identity=procIdentity(pid);
  if(!identity||!identity.command.includes("durable-process-runner.mjs")||
      !identity.command.includes(job))throw Error("ACTION_RECONCILIATION_REQUIRED");
  this.broker.bindAction(idempotencyKey,{processId:id,runnerPid:pid,
   runnerStartToken:identity.start,nonceDigest:digest(nonce)});
  const a=this.itemFor(id);
  for(let i=0;i<40;i++){
   const m=this.manifest(a);
   if(m)return this.sync(a);
   await delay(25);
  }
  throw Error("ACTION_RECONCILIATION_REQUIRED");
 }
 status({processId}){return this.sync(this.itemFor(processId));}
 read({processId,cursor=0,maxBytes=MAX_READ}){
  const a=this.itemFor(processId),status=this.sync(a);
  if(!Number.isSafeInteger(cursor)||cursor<0||!Number.isInteger(maxBytes)||maxBytes<1||maxBytes>MAX_READ)
   throw Error("INVALID_READ_BOUNDS");
  if(cursor>status.bytesCaptured)throw Error("INVALID_CURSOR");
  const end=Math.min(cursor+maxBytes,status.bytesCaptured);
  const f=join(this.jobDir(processId),"output.log");
  safeFile(f);
  const fd=openSync(f,C.O_RDONLY|C.O_NOFOLLOW);
  const chunk=Buffer.alloc(end-cursor);
  try{let at=0;while(at<chunk.length){const n=readSync(fd,chunk,at,chunk.length-at,cursor+at);
    if(n<=0)throw Error("RECOVERY_REQUIRED");at+=n;}}
  finally{closeSync(fd);}
  return {...status,cursor:end,content:chunk.toString("utf8"),hasMore:end<status.bytesCaptured};
 }
 input({processId}){this.itemFor(processId);throw Error("DURABLE_STDIN_UNAVAILABLE");}
 stop({processId}){
  const a=this.itemFor(processId),s=this.sync(a);
  if(!["RUNNING","STARTING","TERMINATION_PENDING"].includes(s.state))return s;
  if(!this.runnerVerified(a))throw Error("RECOVERY_REQUIRED");
  // Signal only the independently identified broker-owned supervisor, not an arbitrary PID or PGID.
  process.kill(a.runnerPid,"SIGTERM");
  return {...s,state:"TERMINATION_PENDING"};
 }
 stopAll(){
  for(const a of this.broker.state.actions??[]){
   if(!a.processId||a.stage!=="ISSUED")continue;
   try{this.stop({processId:a.processId});}
   catch{/* recovery remains sealed for review, never target unknown PIDs */}
  }
 }
}
