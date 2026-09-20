import {promises as fs,constants as C} from "node:fs";
import {dirname,join,isAbsolute} from "node:path";
import {createHash,randomUUID} from "node:crypto";
import {DurableHostProcesses} from "./durable-host-processes.mjs";

const validSha=s=>typeof s==="string"&&/^[a-f0-9]{64}$/.test(s);
export class AsyncCopyJobs {
 constructor(broker,files,{processes=null,binary,binarySha}={}){
  if(!isAbsolute(binary??"")||!validSha(binarySha))throw Error("INVALID_COPY_HELPER_CONFIG");
  this.broker=broker;this.files=files;this.binary=binary;this.binarySha=binarySha;
  this.processes=processes??new DurableHostProcesses(broker);
 }
 async start({source,destination,expectedSourceSha256,idempotencyKey}){
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
   if(!old.processId)throw Error("ASYNC_COPY_RECONCILIATION_REQUIRED");
   return {source:from,destination:to,bytes:old.bytes,
     ...this.processes.status({processId:old.processId})};
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
   expectedSourceSha256,bytes:st.size,createdAt:Date.now(),stageCleanup:"NONE"};
  entries.push(record);this.broker.state.copyJobs=entries;
  this.broker.record("ASYNC_COPY_RESERVED",{stageId});this.broker.save();
  const job=await this.processes.start({
   executable:process.execPath,
   argv:[new URL("./async-file-copy-worker.mjs",import.meta.url).pathname,
    this.binary,this.binarySha,from,to,expectedSourceSha256,
    String(st.size),String(st.dev),String(st.ino),stageId],
   cwd:dirname(to),timeoutMs:3600000,idempotencyKey
  });
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
