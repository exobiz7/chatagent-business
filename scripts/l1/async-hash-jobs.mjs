import {promises as fs,constants as C} from "node:fs";
import {dirname} from "node:path";
import {createHash} from "node:crypto";
import {DurableHostProcesses} from "./durable-host-processes.mjs";

export class AsyncHashJobs {
 constructor(broker,files,{processes=null}={}){
  this.broker=broker;this.files=files;
  this.processes=processes??new DurableHostProcesses(broker);
 }
 async start({path,idempotencyKey}){
  if(typeof path!=="string"||typeof idempotencyKey!=="string")
    throw Error("INVALID_ASYNC_HASH_REQUEST");
  const target=await this.files.allowed("read",path,{resolveLeaf:true});
  const fh=await fs.open(target,C.O_RDONLY|C.O_NOFOLLOW);
  let st;
  try{
   st=await fh.stat();
   if(!st.isFile()||st.size>32*1024*1024*1024)throw Error("INVALID_ASYNC_HASH_SOURCE");
  }finally{await fh.close();}
  const registrations=this.broker.state.hashJobs??=[];
  if(registrations.length>=128&&!registrations.some(x=>x.key===idempotencyKey))
   throw Error("ASYNC_HASH_RECORD_LIMIT");
  const job=await this.processes.start({
   executable:process.execPath,
   argv:[new URL("./async-file-hash-worker.mjs",import.meta.url).pathname,
    target,String(st.dev),String(st.ino),String(st.size),String(st.mtimeMs)],
   cwd:dirname(target),
   timeoutMs:3600000,
   idempotencyKey
  });
  const current=registrations.find(x=>x.key===idempotencyKey);
  if(current&&current.processId!==job.processId)
   throw Error("ASYNC_HASH_IDENTITY_CONFLICT");
  if(!current){
   registrations.push({key:idempotencyKey,processId:job.processId,
    pathSha256:createHash("sha256").update(target).digest("hex"),
    bytes:st.size,createdAt:Date.now()});
   this.broker.state.hashJobs=registrations;
   this.broker.record("ASYNC_HASH_BOUND",{processId:job.processId});
   this.broker.save();
  }
  return {source:target,bytes:st.size,...job};
 }
 owned({processId}){
  if(typeof processId!=="string"||
    !(this.broker.state.hashJobs??[]).some(x=>x.processId===processId))
   throw Error("ASYNC_HASH_NOT_OWNED");
 }
 status({processId}){this.owned({processId});return this.processes.status({processId});}
 read({processId,cursor=0,maxBytes=16384}){
  this.owned({processId});return this.processes.read({processId,cursor,maxBytes});
 }
 stop({processId}){this.owned({processId});return this.processes.stop({processId});}
}
