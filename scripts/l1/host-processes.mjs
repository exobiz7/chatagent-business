import { spawn } from "node:child_process";
import { promises as fs, constants as C } from "node:fs";
import { isAbsolute } from "node:path";
import { randomUUID, createHash } from "node:crypto";

const OUTPUT_LIMIT=1024*1024;
const MAX_READ=16384;
const MAX_RUNNING=4;
const digest=value=>createHash("sha256").update(JSON.stringify(value)).digest("hex");
export class HostProcesses {
 constructor(broker){this.broker=broker;this.items=new Map();this.keys=new Map();}
 running(){return [...this.items.values()].filter(x=>x.state==="RUNNING").length;}
 async start({executable,argv=[],cwd,timeoutMs=300000,idempotencyKey}){
  if(typeof executable!=="string"||!isAbsolute(executable)||executable.length>4096||
     !Array.isArray(argv)||argv.length>48||argv.some(x=>typeof x!=="string"||x.length>8192||x.includes("\0"))||
     typeof cwd!=="string"||!isAbsolute(cwd)||cwd.length>4096||
     !Number.isInteger(timeoutMs)||timeoutMs<100||timeoutMs>3600000||
     typeof idempotencyKey!=="string"||!/^[0-9a-fA-F-]{36}$/.test(idempotencyKey))
     throw Error("INVALID_EXECUTION");
  const decision=this.broker.accessDecision("host_exec",executable);
  if(!decision.allowed)throw Error(decision.reason);
  if(!this.broker.accessDecision("read",cwd).allowed)throw Error("ACCESS_REQUIRED");
  const input={executable,argv,cwd,timeoutMs};
  const fingerprint=digest(input);
  const previous=this.keys.get(idempotencyKey);
  if(previous){
   if(previous.fingerprint!==fingerprint)throw Error("IDEMPOTENCY_KEY_CONFLICT");
   return this.status({processId:previous.processId});
  }
  if(this.running()>=MAX_RUNNING)throw Error("PROCESS_LIMIT");
  const st=await fs.stat(cwd);
  if(!st.isDirectory())throw Error("INVALID_CWD");
  await fs.access(executable,C.X_OK);
  // Persist the action key BEFORE an external process could have side effects.
  this.broker.reserveAction(idempotencyKey,fingerprint);
  const id=randomUUID();
  const item={id,executable,cwd,fingerprint,actionKey:idempotencyKey,startedAt:Date.now(),endedAt:null,
    state:"RUNNING",exitCode:null,signal:null,truncated:false,output:Buffer.alloc(0),process:null,timeout:null};
  const env={PATH:process.env.PATH??"/usr/bin:/bin:/usr/sbin:/sbin",HOME:process.env.HOME??"",
    TMPDIR:process.env.TMPDIR??"/tmp",LANG:process.env.LANG??"en_US.UTF-8"};
  // Explicit owner-delegated ordinary-user process. Never claim shell path confinement.
  // Each broker-owned job receives an independent POSIX process group/session.
  // Signal ONLY this recorded group; unrelated RDC/M16 processes are never targets.
  const child=spawn(executable,argv,{cwd,env,stdio:["pipe","pipe","pipe"],shell:false,detached:true});
  item.process=child;
  item.groupPid=Number.isInteger(child.pid)?child.pid:null;
  const append=(label,chunk)=>{
   if(item.output.length>=OUTPUT_LIMIT){item.truncated=true;return;}
   const data=Buffer.concat([Buffer.from(label),chunk]);
   if(data.length>OUTPUT_LIMIT-item.output.length)item.truncated=true;
   item.output=Buffer.concat([item.output,data.subarray(0,OUTPUT_LIMIT-item.output.length)]);
  };
  child.stdout.on("data",chunk=>append("[stdout] ",chunk));
  child.stderr.on("data",chunk=>append("[stderr] ",chunk));
  let journalCompleted=false;
  const finalize=terminal=>{
    if(journalCompleted)return;
    journalCompleted=true;
    try{this.broker.markActionTerminal(idempotencyKey,terminal);}
    catch{item.state="RECOVERY_REQUIRED";append("[journal-error] ",Buffer.from("RECONCILIATION_REQUIRED"));}
  };
  child.on("error",e=>{append("[spawn-error] ",Buffer.from(e.code??"SPAWN_ERROR"));item.state="FAILED";item.endedAt=Date.now();finalize("FAILED");});
  child.on("exit",(code,signal)=>{
   item.endedAt=Date.now();item.exitCode=code;item.signal=signal;
   if(item.state==="RUNNING"||item.state==="TERMINATION_PENDING")item.state=signal?"TERMINATED":code===0?"EXITED":"FAILED";
   if(item.timeout){clearTimeout(item.timeout);item.timeout=null;}
   // A launcher that exits must not leave child jobs in its owned process group.
   // PGID is held by surviving members until exit, preventing an unrelated reuse.
   if(Number.isInteger(item.groupPid)&&item.groupPid>0){
    try{process.kill(-item.groupPid,"SIGTERM");}
    catch(e){if(e.code!=="ESRCH")append("[group-cleanup] ",Buffer.from("MANUAL_REVIEW_REQUIRED"));}
   }
   finalize(item.state==="RECOVERY_REQUIRED"?"FAILED":item.state);
  });
  item.timeout=setTimeout(()=>{if(item.state==="RUNNING")this.stop({processId:id});},timeoutMs);
  item.timeout.unref?.();
  this.items.set(id,item);this.keys.set(idempotencyKey,{fingerprint,processId:id});
  return this.status({processId:id});
 }
 status({processId}){
  const p=this.items.get(processId);if(!p)throw Error("PROCESS_NOT_OWNED");
  return {processId:p.id,state:p.state,startedAt:p.startedAt,endedAt:p.endedAt,
    exitCode:p.exitCode,signal:p.signal,bytesCaptured:p.output.length,truncated:p.truncated};
 }
 read({processId,cursor=0,maxBytes=MAX_READ}){
  const p=this.items.get(processId);if(!p)throw Error("PROCESS_NOT_OWNED");
  if(!Number.isSafeInteger(cursor)||cursor<0||!Number.isInteger(maxBytes)||maxBytes<1||maxBytes>MAX_READ)
   throw Error("INVALID_READ_BOUNDS");
  if(cursor>p.output.length)throw Error("INVALID_CURSOR");
  const end=Math.min(cursor+maxBytes,p.output.length);
  return {...this.status({processId}),cursor:end,content:p.output.subarray(cursor,end).toString("utf8"),
    hasMore:end<p.output.length};
 }
 input({processId,content}){
  const p=this.items.get(processId);if(!p||p.state!=="RUNNING")throw Error("PROCESS_NOT_RUNNING");
  if(typeof content!=="string"||Buffer.byteLength(content)>16384)throw Error("INPUT_LIMIT");
  if(!p.process.stdin.writable)throw Error("PROCESS_STDIN_CLOSED");
  p.process.stdin.write(content);
  return {processId,accepted:true};
 }
 stop({processId}){
  const p=this.items.get(processId);if(!p)throw Error("PROCESS_NOT_OWNED");
  if(p.state==="RUNNING"||p.state==="TERMINATION_PENDING"){
   p.state="TERMINATION_PENDING";
   const ownedGroup=p.groupPid;
   const signalGroup=signal=>{
    if(!Number.isInteger(ownedGroup)||ownedGroup<1)return false;
    try{process.kill(-ownedGroup,signal);return true;}
    catch(e){if(e.code==="ESRCH")return false;throw e;}
   };
   signalGroup("SIGTERM");
   const escalation=setTimeout(()=>{
    if(p.state==="TERMINATION_PENDING")signalGroup("SIGKILL");
   },2000);
   escalation.unref?.();
  }
  return this.status({processId});
 }
 stopAll(){
  for(const p of this.items.values())if(p.state==="RUNNING")this.stop({processId:p.id});
 }
}
