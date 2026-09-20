import http from "node:http";
import net from "node:net";
import { readFileSync, existsSync, chmodSync, unlinkSync, lstatSync } from "node:fs";
import { timingSafeEqual, createHash } from "node:crypto";
import { L1Broker } from "./broker-core.mjs";
import { HostFileOps } from "./host-file-ops.mjs";
import { OwnedScratch } from "./owned-scratch.mjs";
import { HostProcesses } from "./host-processes.mjs";
import { DurableHostProcesses } from "./durable-host-processes.mjs";
import { AsyncHashJobs } from "./async-hash-jobs.mjs";
import { AsyncCopyJobs } from "./async-copy-jobs.mjs";
import { PersonalMemoryStore } from "./personal-memory-store.mjs";
import { dirname,resolve,sep,isAbsolute } from "node:path";

const dir=process.env.L1_STATE_DIR;
const tokenFile=process.env.L1_AGENT_KEY_FILE;
if(!dir||!tokenFile)throw Error("L1_CONFIG_REQUIRED");
const broker=new L1Broker(dir);
const fileOpsEnabled=process.env.L1_FILE_OPS_ENABLED==="1";
const personalMemoryEnabled=process.env.PERSONAL_MEMORY_ENABLED==="1";
const personalMemoryRoot=process.env.PERSONAL_MEMORY_STATE_DIR;
if(personalMemoryEnabled&&(!personalMemoryRoot||!isAbsolute(personalMemoryRoot)))
 throw Error("PERSONAL_MEMORY_ROOT_REQUIRED");
const within=(child,parent)=>child===parent||child.startsWith(parent+sep);
if(personalMemoryEnabled&&(within(resolve(personalMemoryRoot),resolve(dir))||
   within(resolve(dir),resolve(personalMemoryRoot))))
 throw Error("PERSONAL_MEMORY_OWNER_ROOT_OVERLAP");
const memory=personalMemoryEnabled?new PersonalMemoryStore(personalMemoryRoot,{
 initialize:process.env.PERSONAL_MEMORY_INIT==="1",ownerStatus:()=>broker.status()}):null;
const supportRoot=dir.includes("/Application Support/chatagent/")?dirname(dirname(dir)):null;
const files=fileOpsEnabled?new HostFileOps(broker,{privateRoot:dir,
 protectedRoots:[...(supportRoot?[supportRoot]:[]),...(personalMemoryEnabled?[personalMemoryRoot]:[])],
 strictMutations:process.env.L1_STRICT_MUTATIONS==="1",
 nativeCreateBinary:process.env.L1_NATIVE_CREATE_ENABLED==="1"?process.env.L1_NATIVE_CREATE_BIN:null,
 nativeCreateSha256:process.env.L1_NATIVE_CREATE_ENABLED==="1"?process.env.L1_NATIVE_CREATE_SHA256:null}):null;
const scratchEnabled=fileOpsEnabled&&process.env.L1_OWNED_SCRATCH_ENABLED==="1";
const scratch=scratchEnabled?await new OwnedScratch(broker).init():null;
const processesEnabled=process.env.L1_HOST_EXEC_ENABLED==="1";
// Default OFF: deployed Business v2 retains proven legacy process behavior.
const durableProcesses=process.env.L1_DURABLE_PROCESS_ENABLED==="1";
const processes=processesEnabled?(durableProcesses?new DurableHostProcesses(broker):new HostProcesses(broker)):null;
if(process.env.L1_ASYNC_HASH_ENABLED==="1"&&
   (!fileOpsEnabled||!processesEnabled||!durableProcesses))
 throw Error("ASYNC_HASH_REQUIRES_DURABLE_PROCESS_AND_FILE_GATES");
const asyncHashEnabled=fileOpsEnabled&&processesEnabled&&durableProcesses&&
 process.env.L1_ASYNC_HASH_ENABLED==="1";
const asyncHash=asyncHashEnabled?new AsyncHashJobs(broker,files,{processes}):null;
const asyncCopyRequested=process.env.L1_ASYNC_COPY_ENABLED==="1";
if(asyncCopyRequested&&(!fileOpsEnabled||!processesEnabled||!durableProcesses||
   process.env.L1_STRICT_MUTATIONS!=="1"||process.env.L1_NATIVE_CREATE_ENABLED!=="1"))
 throw Error("ASYNC_COPY_REQUIRES_DURABLE_NATIVE_STRICT_GATES");
const asyncCopy=asyncCopyRequested?new AsyncCopyJobs(broker,files,{processes,
 binary:process.env.L1_NATIVE_COPY_BIN,binarySha:process.env.L1_NATIVE_COPY_SHA256}):null;
const copyStageRecovery=process.env.L1_COPY_STAGE_RECOVERY_ENABLED==="1";
if(copyStageRecovery&&!asyncCopyRequested)throw Error("COPY_STAGE_REQUIRES_ASYNC_COPY");
const effectiveStatus=()=>({...broker.status(),realFilesystemAccess:fileOpsEnabled&&broker.status().paired&&broker.status().mode==="FULL_HOST",realHostExec:processesEnabled&&broker.status().paired&&broker.status().mode==="FULL_HOST",grantsEnforced:fileOpsEnabled||processesEnabled});
const token=readFileSync(tokenFile,"utf8").trim();
if(!/^[A-Za-z0-9_-]{43,256}$/.test(token))throw Error("AGENT_TOKEN_INVALID");
const socket=dir+"/owner.sock";
// Durable mode uses a macOS lockf launcher holding broker.lock across server
// lifetime. Without that exclusive lease we retain original fail-closed policy.
const prepareOwnerSocket=async()=>{
 if(!existsSync(socket))return;
 if(!durableProcesses||process.env.L1_LOCKED_STARTUP!=="1")
   throw Error("OWNER_SOCKET_ALREADY_PRESENT_CHECK_PROCESS");
 const before=lstatSync(socket);
 if(!before.isSocket()||before.isSymbolicLink()||(before.mode&0o077)!==0||
    (process.getuid&&before.uid!==process.getuid()))throw Error("OWNER_SOCKET_UNSAFE");
 const outcome=await new Promise(resolve=>{
   const client=net.createConnection({path:socket});
   const complete=code=>{client.destroy();resolve(code);};
   client.once("connect",()=>complete("LIVE"));
   client.once("error",e=>complete(e.code??"UNKNOWN"));
   client.setTimeout(500,()=>complete("UNKNOWN"));
 });
 if(outcome!=="ECONNREFUSED")throw Error("OWNER_SOCKET_LIVE_OR_UNKNOWN");
 const after=lstatSync(socket);
 if(!after.isSocket()||after.dev!==before.dev||after.ino!==before.ino||
    after.uid!==before.uid||after.mode!==before.mode)
    throw Error("OWNER_SOCKET_IDENTITY_CHANGED");
 unlinkSync(socket);
};
await prepareOwnerSocket();
const port=Number(process.env.L1_AGENT_PORT||3110);
if(!Number.isInteger(port)||port<1024||port>65535)throw Error("INVALID_PORT");
const equal=(a,b)=>{
 const x=Buffer.from(typeof a==="string"?a:"");
 const y=Buffer.from(b);
 return x.length===y.length&&timingSafeEqual(x,y);
};
const safeError=e=>{
 const code=typeof e?.code==="string"?e.code:"";
 if(/^[A-Z][A-Z0-9_]{2,48}$/.test(code))return code;
 const message=String(e?.message??"");
 return /^[A-Z][A-Z0-9_]{2,48}$/.test(message)?message:"OPERATION_FAILED";
};
const pathFingerprint=body=>createHash("sha256").update(JSON.stringify({path:body.path??null,source:body.source??null,destination:body.destination??null})).digest("hex");
const json=(res,code,value)=>{
 res.writeHead(code,{"content-type":"application/json","cache-control":"no-store"});
 res.end(JSON.stringify(value));
};
const read=async req=>{
 let s="";for await(const chunk of req){
  s+=chunk;if(s.length>8192)throw Error("PAYLOAD_LIMIT");
 }
 try{return JSON.parse(s||"{}");}catch{throw Error("INVALID_JSON");}
};
let ownerFailures=0, lockedUntil=0;
function rejectOwner(pass){
 if(Date.now()<lockedUntil)throw Error("OWNER_LOCKED");
 if(!broker.verifyOwner(pass)){
  ownerFailures++;if(ownerFailures>=5){lockedUntil=Date.now()+900_000;ownerFailures=0;}
  throw Error("OWNER_AUTH_DENIED");
 }
 ownerFailures=0;
}
async function handleAgent(req,res){
 if(req.method==="GET"&&req.url==="/health")return json(res,200,{ready:true,paired:broker.status().paired,realAccess:effectiveStatus().realFilesystemAccess});
 const allowedAgentRoutes=["/agent/status","/agent/request","/agent/check",
    ...(fileOpsEnabled?["/agent/file/list","/agent/file/stat","/agent/file/read","/agent/file/hash","/agent/file/write","/agent/file/copy","/agent/file/create","/agent/file/replace"]:[]),
    ...(scratchEnabled?["/agent/scratch/create","/agent/scratch/cleanup"]:[]),
    ...(asyncHashEnabled?["/agent/async-hash/start","/agent/async-hash/status", "/agent/async-hash/read","/agent/async-hash/stop"]:[]),
    ...(asyncCopyRequested?["/agent/async-copy/start","/agent/async-copy/status", "/agent/async-copy/read","/agent/async-copy/stop"]:[]),
    ...(copyStageRecovery?["/agent/async-copy/stage-inspect","/agent/async-copy/stage-cleanup"]:[]),
    ...(personalMemoryEnabled?["/agent/personal-memory/project-register","/agent/personal-memory/task-start",
      "/agent/personal-memory/checkpoint-append","/agent/personal-memory/task-complete",
      "/agent/personal-memory/task-get","/agent/personal-memory/project-context",
      "/agent/personal-memory/search"]:[]),
    ...(processesEnabled?["/agent/process/start","/agent/process/status","/agent/process/read","/agent/process/input","/agent/process/stop"]:[])];
 if(req.method!=="POST"||!allowedAgentRoutes.includes(req.url))
  return json(res,404,{code:"NOT_FOUND"});
 if(!equal(req.headers["x-chatagent-l1-credential"],token))return json(res,401,{code:"UNAUTHORIZED"});
 try{
  const a=await read(req);
  if(req.url==="/agent/status")return json(res,200,effectiveStatus());
  if(req.url==="/agent/request")return json(res,200,broker.propose(a));
  if(req.url==="/agent/check")return json(res,200,broker.check(a.requestId));
  if(personalMemoryEnabled&&req.url.startsWith("/agent/personal-memory/")){
    const op=req.url.slice("/agent/personal-memory/".length);
    const methods={"project-register":"projectRegister","task-start":"taskStart",
      "checkpoint-append":"checkpointAppend","task-complete":"taskComplete",
      "task-get":"taskGet","project-context":"projectContext",search:"search"};
    if(!Object.hasOwn(methods,op))throw Error("UNSUPPORTED_OPERATION");
    return json(res,200,memory[methods[op]](a));
  }
  if(processesEnabled&&req.url.startsWith("/agent/process/")){
    const op=req.url.slice("/agent/process/".length);
    if(!["start","status","read","input","stop"].includes(op))throw Error("UNSUPPORTED_OPERATION");
    return json(res,200,await processes[op](a));
  }
  if(asyncCopyRequested&&req.url.startsWith("/agent/async-copy/")){
    const op=req.url.slice("/agent/async-copy/".length);
    const method={start:"start",status:"status",read:"read",stop:"stop",
     ...(copyStageRecovery?{"stage-inspect":"inspectStage","stage-cleanup":"cleanupStage"}:{})}[op];
    if(!method)throw Error("UNSUPPORTED_OPERATION");
    return json(res,200,await asyncCopy[method](a));
  }
  if(asyncHashEnabled&&req.url.startsWith("/agent/async-hash/")){
    const op=req.url.slice("/agent/async-hash/".length);
    if(!["start","status","read","stop"].includes(op))throw Error("UNSUPPORTED_OPERATION");
    return json(res,200,await asyncHash[op](a));
  }
  if(scratchEnabled&&req.url.startsWith("/agent/scratch/")){
    const op=req.url.slice("/agent/scratch/".length);
    if(!["create","cleanup"].includes(op))throw Error("UNSUPPORTED_OPERATION");
    return json(res,200,await scratch[op](a));
  }
  if(fileOpsEnabled&&req.url.startsWith("/agent/file/")){
    const op=req.url.slice("/agent/file/".length);
    if(!["list","stat","read","hash","write","copy","create","replace"].includes(op))throw Error("UNSUPPORTED_OPERATION");
    const pathDigest=pathFingerprint(a);
    if(["write","copy","create","replace"].includes(op)){
      broker.record("HOST_FILE_ISSUED",{operation:op,pathDigest});broker.save();
    }
    try{
      const result=await files[op](a);
      broker.record("HOST_FILE_COMPLETED",{operation:op,pathDigest});broker.save();
      return json(res,200,result);
    }catch(e){
      broker.record("HOST_FILE_FAILED",{operation:op,pathDigest,code:safeError(e)});broker.save();
      throw e;
    }
  }
 }catch(e){return json(res,400,{code:safeError(e)});}
}
async function handleOwner(req,res){
 if(req.method!=="POST"||!["/owner/status","/owner/pending","/owner/grants","/owner/approve","/owner/revoke","/owner/mode","/owner/audit"].includes(req.url))
  return json(res,404,{code:"NOT_FOUND"});
 try{
  const a=await read(req);
  // A private owner-only Unix socket is trusted after initial local enrollment.
  // A supplied password is still validated; switching on Full Host requires
  // an explicit password even from that socket. Everyday owner actions do not.
  if(a.passphrase!==undefined||req.url==="/owner/mode"&&a.mode==="FULL_HOST")
    rejectOwner(a.passphrase);
  else if(!broker.status().paired)throw Error("OWNER_NOT_PAIRED");
  if(req.url==="/owner/status")return json(res,200,effectiveStatus());
  if(req.url==="/owner/pending")return json(res,200,{requests:broker.pending()});
  if(req.url==="/owner/grants")return json(res,200,{grants:broker.grants()});
  if(req.url==="/owner/audit")return json(res,200,{events:broker.audit()});
  if(req.url==="/owner/approve")return json(res,200,broker.approve(a.requestId,undefined,a.digest));
  if(req.url==="/owner/revoke")return json(res,200,broker.revoke(a.grantId,undefined));
  if(req.url==="/owner/mode"){
    const result=broker.setMode(a.mode,a.mode==="FULL_HOST"?a.passphrase:undefined);
    if(a.mode!=="FULL_HOST")processes?.stopAll();
    return json(res,200,result);
  }
 }catch(e){return json(res,e.message==="OWNER_AUTH_DENIED"||e.message==="OWNER_LOCKED"?403:400,{code:e.message||"INVALID_REQUEST"});}
}
const agent=http.createServer((req,res)=>{void handleAgent(req,res);});
const owner=http.createServer((req,res)=>{void handleOwner(req,res);});
agent.requestTimeout=15000;owner.requestTimeout=15000;
owner.listen(socket,()=>{
 chmodSync(socket,0o600);
 agent.listen(port,"127.0.0.1",()=>{
  console.log(JSON.stringify({event:"L1_BROKER_READY",port,pid:process.pid,ownerSocket:"PRIVATE",paired:broker.status().paired,realAccess:effectiveStatus().realFilesystemAccess}));
 });
});
const stop=()=>{
 processes?.stopAll();
 agent.close();owner.close(()=>{try{unlinkSync(socket);}catch{}});
};
process.once("SIGTERM",stop);process.once("SIGINT",stop);
