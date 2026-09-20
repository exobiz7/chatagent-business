import {promises as fs,constants as C} from "node:fs";
import {dirname,isAbsolute} from "node:path";
import {createHash} from "node:crypto";
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
  const job=await this.processes.start({
   executable:process.execPath,
   argv:[new URL("./async-file-copy-worker.mjs",import.meta.url).pathname,
    this.binary,this.binarySha,from,to,expectedSourceSha256,
    String(st.size),String(st.dev),String(st.ino)],
   cwd:dirname(to),timeoutMs:3600000,idempotencyKey
  });
  if(!entries.some(x=>x.key===idempotencyKey)){
   entries.push({key:idempotencyKey,processId:job.processId,
    sourcePathSha256:createHash("sha256").update(from).digest("hex"),
    destinationPathSha256:createHash("sha256").update(to).digest("hex"),
    expectedSourceSha256,bytes:st.size,createdAt:Date.now()});
   this.broker.state.copyJobs=entries;
   this.broker.record("ASYNC_COPY_BOUND",{processId:job.processId});
   this.broker.save();
  }
  return {source:from,destination:to,bytes:st.size,...job};
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
