import { fileURLToPath } from "node:url";
import {promises as fs,constants as C,existsSync,lstatSync,fstatSync,openSync,readFileSync,closeSync} from "node:fs";
import {dirname,join,isAbsolute} from "node:path";
import {createHash,randomUUID} from "node:crypto";
import {DurableHostProcesses} from "./durable-host-processes.mjs";

const validSha=s=>typeof s==="string"&&/^[a-f0-9]{64}$/.test(s);
const digest=v=>createHash("sha256").update(JSON.stringify(v)).digest("hex");
const uuid=s=>typeof s==="string"&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
const decimal=s=>typeof s==="string"&&/^\d+$/.test(s);
export class AsyncCopyJobs {
 constructor(broker,files,{processes=null,binary,binarySha}={}){
  if(!isAbsolute(binary??"")||!validSha(binarySha))throw Error("INVALID_COPY_HELPER_CONFIG");
  this.broker=broker;this.files=files;this.binary=binary;this.binarySha=binarySha;
  this.processes=processes??new DurableHostProcesses(broker);
  // Serialize only copy job reservation/start/bind. The detached copy workers
  // still run concurrently; this queue prevents concurrent first-use/same-key
  // requests from observing separate or incomplete ownership records.
  this.startQueue=Promise.resolve();
 }
 start(request){
  const run=this.startQueue.then(()=>this.startUnlocked(request));
  this.startQueue=run.then(()=>undefined,()=>undefined);
  return run;
 }
 actionInput(rec,dev,ino){
  return {executable:process.execPath,
   argv:[fileURLToPath(new URL("./async-file-copy-worker.mjs",import.meta.url)),
    this.binary,this.binarySha,rec.sourcePath,rec.destinationPath,
    rec.expectedSourceSha256,String(rec.bytes),dev,ino,rec.stageId],
   cwd:dirname(rec.destinationPath),timeoutMs:3600000};
 }
 // Legacy reservations predate sealed source dev/ino. Recover ONLY if the
 // private action config itself matches the sealed action digest and this
 // copy's immutable stage/source/destination/size. No live source re-stat:
 // the original source may have changed since the interrupted launch.
 legacyIdentity(rec,action){
  const directory=this.processes.jobDir(action.processId);
  const file=join(directory,"config.json");
  if(!existsSync(file))throw Error("ASYNC_COPY_RECONCILIATION_REQUIRED");
  for(const path of [directory,file]){
   const st=lstatSync(path);
   if(st.isSymbolicLink()||(st.mode&0o077)!==0||
      (typeof process.getuid==="function"&&st.uid!==process.getuid())||
      (path===directory?!st.isDirectory():!st.isFile()))
    throw Error("ASYNC_COPY_RECONCILIATION_REQUIRED");
  }
  const fd=openSync(file,C.O_RDONLY|C.O_NOFOLLOW);
  let config;
  try{
   const st=fstatSync(fd);
   if(!st.isFile()||st.size>65536||(st.mode&0o077)!==0||
      (typeof process.getuid==="function"&&st.uid!==process.getuid()))
    throw Error("UNSAFE_COPY_CONFIG");
   config=JSON.parse(readFileSync(fd,{encoding:"utf8"}));
  }catch{throw Error("ASYNC_COPY_RECONCILIATION_REQUIRED");}
  finally{closeSync(fd);}
  if(!config||typeof config!=="object"||Array.isArray(config)||
     !validSha(config.nonce)||config.processId!==action.processId||
     digest(config.nonce)!==action.nonceDigest||
     typeof config.executable!=="string"||!isAbsolute(config.executable)||
     typeof config.cwd!=="string"||!isAbsolute(config.cwd)||
     !Number.isInteger(config.timeoutMs)||config.timeoutMs<100||config.timeoutMs>3600000||
     !Array.isArray(config.argv)||config.argv.length!==10||
     config.argv.some(x=>typeof x!=="string"||x.length>8192||x.includes("\0"))||
     !decimal(config.argv[7])||!decimal(config.argv[8]))
   throw Error("ASYNC_COPY_RECONCILIATION_REQUIRED");
  // Hash the *actual* persisted execution fields before comparing the
  // original copy's reconstructed intent. Never authenticate one and bind
  // another: the runner consumes this config, not the reconstructed object.
  const actualIntent={executable:config.executable,argv:config.argv,
   cwd:config.cwd,timeoutMs:config.timeoutMs};
  if(digest(actualIntent)!==action.digest)
   throw Error("ASYNC_COPY_RECONCILIATION_REQUIRED");
  const [dev,ino]=config.argv.slice(7,9);
  if(digest(this.actionInput(rec,dev,ino))!==action.digest)
   throw Error("ASYNC_COPY_RECONCILIATION_REQUIRED");
  return {dev,ino};
 }
 // Bind only the original HMAC-sealed action with the same key AND exact
 // intended launch digest. Never invoke processes.start here or replay effect.
 reconcile(rec){
  const action=(this.broker.state.actions??[]).find(x=>x.key===rec.key);
  if(!action||!uuid(action.processId)||!validSha(action.nonceDigest)||
     !validSha(action.digest)||!["ISSUED","EXITED","FAILED","TERMINATED"].includes(action.stage)||
     !uuid(rec.stageId)||!Number.isSafeInteger(rec.bytes)||rec.bytes<0||
     (this.broker.state.copyJobs??[]).some(x=>x!==rec&&x.processId===action.processId))
   throw Error("ASYNC_COPY_RECONCILIATION_REQUIRED");
  const {dev,ino}=decimal(rec.sourceDev)&&decimal(rec.sourceIno)
   ?{dev:rec.sourceDev,ino:rec.sourceIno}:this.legacyIdentity(rec,action);
  if(digest(this.actionInput(rec,dev,ino))!==action.digest)
   throw Error("ASYNC_COPY_RECONCILIATION_REQUIRED");
  const previousAudit=this.broker.state.audit.slice();
  rec.processId=action.processId;
  this.broker.record("ASYNC_COPY_RECONCILED",{stageId:rec.stageId,processId:action.processId});
  // An uncertain state save must not be advertised as durable in this session.
  // A fresh sealed reload can always repeat reconciliation without replay.
  try{this.broker.save();}
  catch{
   rec.processId=null;this.broker.state.audit=previousAudit;
   throw Error("ASYNC_COPY_RECONCILIATION_REQUIRED");
  }
  return action.processId;
 }
 async startUnlocked({source,destination,expectedSourceSha256,idempotencyKey}){
  if(typeof source!=="string"||typeof destination!=="string"||
    !validSha(expectedSourceSha256)||typeof idempotencyKey!=="string")
    throw Error("INVALID_ASYNC_COPY_REQUEST");
  // Canonical resolution denies protected state, and native openat refuses
  // symlink swaps after precheck. Never accept an existing destination.
  const from=await this.files.allowed("read",source,{resolveLeaf:true});
  const to=await this.files.allowed("write",destination,{resolveLeaf:true});
  if(from===to)throw Error("COPY_SAME_PATH");
  const entries=this.broker.state.copyJobs??[];
  const old=entries.find(x=>x.key===idempotencyKey);
  if(old){
   const hash=v=>createHash("sha256").update(v).digest("hex");
   if(old.sourcePathSha256!==hash(from)||old.destinationPathSha256!==hash(to)||
       old.expectedSourceSha256!==expectedSourceSha256)
    throw Error("IDEMPOTENCY_KEY_CONFLICT");
   if(!old.processId)this.reconcile(old);
   let observed;
   try{observed=this.processes.status({processId:old.processId});}
   catch(e){
    // A damaged or still-unbound runner cannot make the sealed action ID vanish.
    // Expose only RECOVERY_REQUIRED; never claim terminal state or replay.
    if(e?.message!=="RECOVERY_REQUIRED")throw e;
    observed={processId:old.processId,state:"RECOVERY_REQUIRED"};
   }
   return {source:from,destination:to,bytes:old.bytes,...observed};
  }
  const fd=await fs.open(from,C.O_RDONLY|C.O_NOFOLLOW);
  let st;
  try{
   st=await fd.stat();
   if(!st.isFile()||st.size>32*1024*1024*1024)throw Error("INVALID_COPY_SOURCE");
  }finally{await fd.close();}
  try{await fs.lstat(to);throw Error("COPY_DESTINATION_EXISTS");}
  catch(e){if(e.code!=="ENOENT")throw e;}
  if(entries.length>=128)
    throw Error("ASYNC_COPY_RECORD_LIMIT");
  // Reserve a unique stage identity in HMAC-sealed private owner state *before*
  // launching a helper. Unexpected restarts never create a second staging name.
  const stageId=randomUUID();
  const record={key:idempotencyKey,processId:null,stageId,sourcePath:from,
   destinationPath:to,
   sourcePathSha256:createHash("sha256").update(from).digest("hex"),
   destinationPathSha256:createHash("sha256").update(to).digest("hex"),
   expectedSourceSha256,bytes:st.size,sourceDev:String(st.dev),sourceIno:String(st.ino),
   createdAt:Date.now(),stageCleanup:"NONE"};
  entries.push(record);this.broker.state.copyJobs=entries;
  this.broker.record("ASYNC_COPY_RESERVED",{stageId});this.broker.save();
  const job=await this.processes.start({...this.actionInput(record,record.sourceDev,record.sourceIno),
   idempotencyKey});
  record.processId=job.processId;
  this.broker.record("ASYNC_COPY_BOUND",{processId:job.processId});
  this.broker.save();
  return {source:from,destination:to,bytes:st.size,...job};
 }
 record(processId){
  if(typeof processId!=="string")throw Error("ASYNC_COPY_NOT_OWNED");
  const rec=(this.broker.state.copyJobs??[]).find(x=>x.processId===processId);
  if(!rec||!/^[0-9a-f-]{36}$/.test(rec.stageId??""))
   throw Error("ASYNC_COPY_NOT_OWNED");
  return rec;
 }
 stagePath(rec){return join(dirname(rec.destinationPath),".personal-copy-"+rec.stageId+".stage");}
 async inspectStage({processId}){
  const rec=this.record(processId);
  const current=this.processes.status({processId});
  if(!["EXITED","FAILED","TERMINATED"].includes(current.state))
   throw Error("COPY_RECONCILIATION_REQUIRED");
  const target=this.stagePath(rec);
  // Authorization also blocks symlinks that now point into private broker state.
  if(!this.broker.accessDecision("write",target).allowed)
   throw Error("ACCESS_REQUIRED");
  let fd;
  try{fd=await fs.open(target,C.O_RDONLY|C.O_NOFOLLOW);}
  catch(e){if(e.code==="ENOENT")return {processId,stageId:rec.stageId,
    state:rec.stageCleanup==="CLEANED"?"CLEANED":"STAGE_ABSENT_UNVERIFIED"};throw Error("COPY_STAGE_UNSAFE");}
  try{
   const st=await fd.stat({bigint:true});
   if(!st.isFile()||st.nlink!==1n||(st.mode&0o077n)!==0n||
      st.uid!==BigInt(process.getuid())||st.size>BigInt(rec.bytes))
    throw Error("COPY_STAGE_UNSAFE");
   const hash=createHash("sha256"),buf=Buffer.alloc(1024*1024);let at=0;
   const bytes=Number(st.size);
   while(at<bytes){const {bytesRead}=await fd.read(buf,0,Math.min(buf.length,bytes-at),at);
    if(bytesRead<=0)throw Error("COPY_STAGE_CHANGED");
    hash.update(buf.subarray(0,bytesRead));at+=bytesRead;
   }
   const after=await fd.stat({bigint:true});
   if(after.dev!==st.dev||after.ino!==st.ino||after.size!==st.size||
      after.mtimeNs!==st.mtimeNs)throw Error("COPY_STAGE_CHANGED");
   return {processId,stageId:rec.stageId,state:"ORPHAN_STAGE_REVIEW",
    stageSha256:hash.digest("hex"),stageBytes:bytes,
    stageDev:st.dev.toString(),stageIno:st.ino.toString()};
  }finally{await fd.close();}
 }
 async cleanupStage({processId,expectedStageSha256,expectedDev,expectedIno}){
  const rec=this.record(processId);
  if(rec.stageCleanup==="ISSUED")throw Error("COPY_CLEANUP_RECONCILIATION_REQUIRED");
  if(rec.stageCleanup==="CLEANED")return {processId,state:"CLEANED",changed:false};
  const found=await this.inspectStage({processId});
  if(found.state!=="ORPHAN_STAGE_REVIEW")throw Error("COPY_STAGE_ABSENT_UNVERIFIED");
  if(found.stageSha256!==expectedStageSha256||found.stageDev!==expectedDev||
     found.stageIno!==expectedIno)throw Error("COPY_STAGE_PRECONDITION_MISMATCH");
  const stage=this.stagePath(rec);
  if(!this.broker.accessDecision("write",stage).allowed)throw Error("ACCESS_REQUIRED");
  rec.stageCleanup="ISSUED";
  this.broker.record("COPY_STAGE_CLEANUP_ISSUED",{stageId:rec.stageId});this.broker.save();
  // Recheck immediately before unlink. A malicious same-UID last-check race
  // remains outside our claimed security boundary; no arbitrary path accepted.
  const current=await fs.lstat(stage,{bigint:true});
  if(!current.isFile()||current.dev.toString()!==expectedDev||
     current.ino.toString()!==expectedIno)throw Error("COPY_STAGE_CHANGED");
  await fs.unlink(stage);
  try{await fs.lstat(stage);throw Error("COPY_CLEANUP_UNCERTAIN");}
  catch(e){if(e.code!=="ENOENT")throw e;}
  rec.stageCleanup="CLEANED";
  this.broker.record("COPY_STAGE_CLEANED",{stageId:rec.stageId});this.broker.save();
  return {processId,state:"CLEANED",changed:true};
 }
 owned(processId){
  if(typeof processId!=="string"||
     !(this.broker.state.copyJobs??[]).some(x=>x.processId===processId))
   throw Error("ASYNC_COPY_NOT_OWNED");
 }
 status({processId}){this.owned(processId);return this.processes.status({processId});}
 read({processId,cursor=0,maxBytes=16384}){
  this.owned(processId);return this.processes.read({processId,cursor,maxBytes});
 }
 stop({processId}){this.owned(processId);return this.processes.stop({processId});}
}
