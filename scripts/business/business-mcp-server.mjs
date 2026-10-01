import http from "node:http";
import {readFileSync} from "node:fs";
import {join} from "node:path";
import {timingSafeEqual,randomUUID,createHash} from "node:crypto";
import {McpServer} from "@modelcontextprotocol/sdk/server/mcp.js";
import {StreamableHTTPServerTransport} from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import {z} from "zod";
import {boundedJSONBody} from "../l1/bounded-json-body.mjs";
import {BusinessRegistry,businessStatus} from "./business-core.mjs";
import {BusinessFileOps} from "./business-file-ops.mjs";
import {BusinessContinuity} from "./business-continuity.mjs";
import {BusinessAuditLedger} from "./business-audit.mjs";
import {BusinessExecManager} from "./business-exec.mjs";

const state=process.env.CHATAGENT_BUSINESS_STATE_DIR;
const authFile=process.env.CHATAGENT_BUSINESS_AUTH_FILE;
if(!state||!authFile)throw Error("BUSINESS_MCP_CONFIG_REQUIRED");
const registry=new BusinessRegistry(state);
const nativeConfig={
 nativeCreateBinary:process.env.CHATAGENT_BUSINESS_NATIVE_CREATE_BIN,
 nativeCreateSha256:process.env.CHATAGENT_BUSINESS_NATIVE_CREATE_SHA256,
 nativeReplaceBinary:process.env.CHATAGENT_BUSINESS_NATIVE_REPLACE_BIN,
 nativeReplaceSha256:process.env.CHATAGENT_BUSINESS_NATIVE_REPLACE_SHA256,
 nativeMkdirBinary:process.env.CHATAGENT_BUSINESS_NATIVE_MKDIR_BIN,
 nativeMkdirSha256:process.env.CHATAGENT_BUSINESS_NATIVE_MKDIR_SHA256
};
const nativeValues=Object.values(nativeConfig),nativePresent=nativeValues.filter(Boolean).length;
if(nativePresent!==0&&nativePresent!==nativeValues.length)throw Error("BUSINESS_NATIVE_FILE_CONFIG_PARTIAL");
const safeFilesReady=nativePresent===nativeValues.length;
const files=safeFilesReady?new BusinessFileOps(registry,nativeConfig):null;
const continuityFlag=process.env.CHATAGENT_BUSINESS_CONTINUITY_ENABLED;
if(continuityFlag!==undefined&&!["0","1"].includes(continuityFlag))
 throw Error("BUSINESS_CONTINUITY_CONFIG_INVALID");
const continuityReady=continuityFlag==="1";
if(continuityReady&&!safeFilesReady)throw Error("BUSINESS_CONTINUITY_REQUIRES_B2");
const continuity=continuityReady?new BusinessContinuity(registry,{
 root:process.env.CHATAGENT_BUSINESS_CONTINUITY_STATE_DIR||join(state,"continuity")
}):null;
const auditFlag=process.env.CHATAGENT_BUSINESS_AUDIT_ENABLED;
if(auditFlag!==undefined&&!["0","1"].includes(auditFlag))
 throw Error("BUSINESS_AUDIT_CONFIG_INVALID");
const auditReady=auditFlag==="1";
if(auditReady&&!continuityReady)throw Error("BUSINESS_AUDIT_REQUIRES_B3");
const audit=auditReady?new BusinessAuditLedger(
 process.env.CHATAGENT_BUSINESS_AUDIT_DIR||join(state,"audit")):null;
const execFlag=process.env.CHATAGENT_BUSINESS_EXEC_ENABLED;
if(execFlag!==undefined&&!["0","1"].includes(execFlag))
 throw Error("BUSINESS_EXEC_CONFIG_INVALID");
const execEnabled=execFlag==="1";
if(execEnabled&&!auditReady)throw Error("BUSINESS_EXEC_REQUIRES_B4");
const execConfig=execEnabled?{
 dockerBinary:process.env.CHATAGENT_BUSINESS_DOCKER_BIN,
 dockerSha256:process.env.CHATAGENT_BUSINESS_DOCKER_SHA256,
 imageRef:process.env.CHATAGENT_BUSINESS_EXEC_IMAGE_REF,
 imageId:process.env.CHATAGENT_BUSINESS_EXEC_IMAGE_ID
}:null;
const expected=readFileSync(authFile,"utf8").trim();
if(!/^[A-Za-z0-9_-]{43,256}$/.test(expected))throw Error("BUSINESS_AUTH_INVALID");

const port=Number(process.env.CHATAGENT_BUSINESS_PORT||31850);
if(!Number.isInteger(port)||port<1024||port>65535)throw Error("BUSINESS_PORT_INVALID");
const instanceId=process.env.CHATAGENT_BUSINESS_INSTANCE_ID||randomUUID();
if(!/^[0-9a-f-]{36}$/i.test(instanceId))throw Error("BUSINESS_INSTANCE_ID_INVALID");
const execOwnerId=createHash("sha256")
 .update(registry.root+"\0"+registry.organization().organizationId)
 .digest("hex").slice(0,24);
const execManager=execEnabled?new BusinessExecManager(registry,{
 ...execConfig,ownerId:execOwnerId,instanceId
}):null;
if(execManager)await execManager.initialize();
const execReady=Boolean(execManager);
const equal=(a,b)=>{
 const x=Buffer.from(typeof a==="string"?a:""),y=Buffer.from(b);
 return x.length===y.length&&timingSafeEqual(x,y);
};
const forbiddenAuthorityHeader=req=>[
 "x-chatagent-business-profile","x-chatagent-profile","x-chatagent-authority","x-chatagent-mode"
].some(h=>req.headers[h]!==undefined);
const jsonError=(res,status,message,id=null)=>{
 res.writeHead(status,{"content-type":"application/json","cache-control":"no-store"});
 res.end(JSON.stringify({jsonrpc:"2.0",id,error:{code:-32000,message}}));
};
const text=data=>({content:[{type:"text",text:JSON.stringify(data)}],structuredContent:data});
const toolError=e=>{
 const code=/^[A-Z][A-Z0-9_]{2,64}$/.test(String(e?.message))?String(e.message):"BUSINESS_OPERATION_FAILED";
 const data={code,success:false,
  ...(typeof e?.effect==="string"?{effect:e.effect}:{}),
  ...(e?.retryable===false?{retryable:false}:{}),
  ...(e?.audit==="UNCERTAIN"?{audit:"UNCERTAIN"}:{}),
  ...(/^xexec_[a-f0-9]{32}$/.test(e?.sessionId??"")?{sessionId:e.sessionId}:{})};
 return {...text(data),isError:true};
};
const EFFECT_CLASS=Object.freeze({
 make_directory:"CREATE",create_file:"CREATE",replace_file:"REPLACE",apply_patch:"PATCH",
 continuity_start_task:"CONTINUITY_WRITE",continuity_checkpoint:"CONTINUITY_WRITE",
 continuity_complete_task:"CONTINUITY_WRITE",
 exec_command:"EXEC_START",terminate_process:"EXEC_TERMINATE"
});
const audited=async(tool,args,run)=>{
 if(!audit||!EFFECT_CLASS[tool])return run();
 let profile="UNKNOWN",organizationId=registry.organization().organizationId;
 try{profile=registry.inspect(args.projectId).profile;}catch{}
 const base={organizationId,projectId:args.projectId,profile,tool,effectClass:EFFECT_CLASS[tool],
  targetRelativePath:typeof args.relativePath==="string"?args.relativePath:null,
  preconditionDigest:typeof args.expectedSha256==="string"?args.expectedSha256:null};
 try{
  const value=await run();
  try{audit.append({...base,resultCode:"OK"});}
  catch{
   const e=Error("BUSINESS_AUDIT_UNCERTAIN");e.effect="COMMITTED";e.retryable=false;e.audit="UNCERTAIN";
   if(tool==="exec_command"&&/^xexec_[a-f0-9]{32}$/.test(value?.sessionId??""))e.sessionId=value.sessionId;
   throw e;
  }
  return value;
 }catch(e){
  if(e?.message==="BUSINESS_AUDIT_UNCERTAIN")throw e;
  try{audit.append({...base,resultCode:/^[A-Z][A-Z0-9_]{1,63}$/.test(String(e?.message))?String(e.message):"BUSINESS_OPERATION_FAILED"});}
  catch{e.audit="UNCERTAIN";e.retryable=false;}
  throw e;
 }
};

const projectId=z.string().regex(/^[a-z0-9][a-z0-9._-]{0,63}$/);
const relativePath=z.string().max(4096);
const sha=z.string().regex(/^[a-f0-9]{64}$/);
const uuid=z.string().uuid();
const contextDigest=z.string().regex(/^sha256:[a-f0-9]{64}$/);
const execSessionId=z.string().regex(/^xexec_[a-f0-9]{32}$/);
const execCommand=z.string().min(1).refine(v=>Buffer.byteLength(v)<=16384);
const execCwd=z.string().max(4096);

function registerTools(mcp){
 mcp.registerTool("business_status",{
  description:"Read bounded organization, project-profile and runtime readiness status. Never returns host roots or secrets.",
  inputSchema:z.strictObject({}),
  annotations:{readOnlyHint:true,destructiveHint:false,openWorldHint:false}
 },async()=>text(businessStatus(registry,{safeFilesReady,continuityReady,auditReady,execReady:execReady&&execManager?.healthy()!==false})));

 if(!files)return;
 const register=(name,description,schema,method,{readOnly=false,destructive=false}={})=>
  mcp.registerTool(name,{description,inputSchema:z.strictObject(schema),
   annotations:{readOnlyHint:readOnly,destructiveHint:destructive,openWorldHint:false}},async(args)=>{
    try{return text(await audited(name,args,()=>files[method](args)));}catch(e){return toolError(e);}
  });

 register("list_directory","List one registered project directory by projectId + relativePath only.",
  {projectId,relativePath:relativePath.optional(),offset:z.number().int().nonnegative().optional(),
   limit:z.number().int().min(1).max(250).optional()},"listDirectory",{readOnly:true});
 register("stat_path","Read metadata for one registered project path.",
  {projectId,relativePath},"statPath",{readOnly:true});
 register("read_file","Read bounded UTF-8 bytes from one regular project file.",
  {projectId,relativePath,offset:z.number().int().nonnegative().optional(),
   maxBytes:z.number().int().min(1).max(65536).optional()},"readFile",{readOnly:true});
 register("hash_file","Compute SHA-256 and size for one regular project file.",
  {projectId,relativePath},"hashFile",{readOnly:true});

 register("make_directory","Create exactly one new directory inside a SAFE/STANDARD project. Existing target fails.",
  {projectId,relativePath},"makeDirectory");
 register("create_file","Create one new UTF-8 file only; never overwrite an existing target.",
  {projectId,relativePath,content:z.string().max(262144)},"createFile");
 register("replace_file","Replace one existing regular file only when current SHA-256 exactly matches expectedSha256. Never blindly retry UNCERTAIN.",
  {projectId,relativePath,content:z.string().max(262144),expectedSha256:sha},
  "replaceFile",{destructive:true});
 register("apply_patch","Apply one bounded exact-text patch to one existing regular file through the same Safe Replace CAS boundary.",
  {projectId,relativePath,expectedSha256:sha,oldText:z.string().min(1).max(131072),
   newText:z.string().max(131072),expectedOccurrences:z.number().int().min(1).max(32).optional()},
  "applyPatch",{destructive:true});

 if(!continuity)return;
 const cRegister=(name,description,schema,method,{readOnly=false,destructive=false}={})=>
  mcp.registerTool(name,{description,inputSchema:z.strictObject(schema),
   annotations:{readOnlyHint:readOnly,destructiveHint:destructive,openWorldHint:false}},async(args)=>{
    try{return text(await audited(name,args,()=>continuity[method](args)));}catch(e){return toolError(e);}
  });
 cRegister("continuity_open","Open current bounded continuity context for a registered project/task; optional prior digest is checked for freshness. Context never grants authority.",
  {projectId,taskId:uuid.nullable().optional(),expectedContextDigest:contextDigest.nullable().optional()},
  "open",{readOnly:true});
 cRegister("continuity_start_task","Start one shared project task with idempotency UUID. Requires SAFE/STANDARD project authority.",
  {projectId,objective:z.string().min(1).max(160),operationId:uuid},"startTask");
 cRegister("continuity_checkpoint","Append one revision-checked shared checkpoint. Decisions and facts remain fields, not separate tools.",
  {projectId,taskId:uuid,expectedTaskRevision:z.number().int().nonnegative(),operationId:uuid,
   summary:z.string().min(1).max(512),currentState:z.string().min(1).max(512),
   nextActions:z.array(z.string().min(1).max(256)).max(5),
   verification:z.string().min(1).max(512),
   decisions:z.array(z.string().min(1).max(256)).max(8).optional(),
   facts:z.array(z.string().min(1).max(256)).max(8).optional(),
   artifacts:z.array(z.string().min(1).max(128)).max(5).optional()},"checkpoint");
 cRegister("continuity_prepare_handoff","Build a deterministic bounded context-only handoff with digest and continuity-state freshness.",
  {projectId,taskId:uuid},"prepareHandoff",{readOnly:true});
 cRegister("continuity_complete_task","Complete an exact task revision; completion is immutable and idempotent only for the same operation UUID.",
  {projectId,taskId:uuid,expectedTaskRevision:z.number().int().nonnegative(),operationId:uuid},
  "completeTask",{destructive:true});

 if(!execManager)return;
 const eRegister=(name,description,schema,method,{readOnly=false,destructive=false}={})=>
  mcp.registerTool(name,{description,inputSchema:z.strictObject(schema),
   annotations:{readOnlyHint:readOnly,destructiveHint:destructive,openWorldHint:false}},async(args)=>{
    try{return text(await audited(name,args,()=>execManager[method](args)));}catch(e){return toolError(e);}
  });
 eRegister("exec_command","Run one bounded shell command inside the isolated STANDARD project container plane. Network is none, rootfs is read-only, .git is read-only when present, and no host credential or Docker socket is mounted.",
  {projectId,command:execCommand,cwd:execCwd.optional(),
   timeoutMs:z.number().int().min(1000).max(900000).optional(),
   yieldTimeMs:z.number().int().min(0).max(30000).optional(),
   maxOutputBytes:z.number().int().min(1).max(524288).optional()},
  "start",{destructive:true});
 eRegister("read_process","Read bounded retained output/state for one owned STANDARD exec session.",
  {projectId,sessionId:execSessionId,afterSeq:z.number().int().nonnegative().optional(),
   waitMs:z.number().int().min(0).max(30000).optional(),
   maxOutputBytes:z.number().int().min(1).max(524288).optional()},
  "read",{readOnly:true});
 eRegister("terminate_process","Terminate one owned STANDARD exec session. Session/project ownership is revalidated.",
  {projectId,sessionId:execSessionId},"terminate",{destructive:true});
}

const server=http.createServer(async(req,res)=>{
 if(req.url==="/health"&&req.method==="GET"){
  const execHealthy=execManager?.healthy()!==false;
  const ready=execHealthy;
  res.writeHead(ready?200:503,{"content-type":"application/json","cache-control":"no-store"});
  res.end(JSON.stringify({ready,
   phase:execReady?"B5":auditReady?"B4":continuityReady?"B3":safeFilesReady?"B2":"B1",
   safeFilesReady,continuityReady,auditReady,execReady,execHealthy,
   ...(execManager?{exec:execManager.accounting()}:{}),instanceId}));return;
 }
 if(req.url!=="/mcp"||req.method!=="POST")return jsonError(res,404,"NOT_FOUND");
 if(forbiddenAuthorityHeader(req))return jsonError(res,400,"AUTHORITY_INPUT_FORBIDDEN");
 if(!equal(req.headers["x-chatagent-business-credential"],expected))return jsonError(res,401,"UNAUTHORIZED");
 let body;try{body=(await boundedJSONBody(req,{maxBytes:350000,oversizeCode:"BODY_LIMIT"})).body;}
 catch(e){return jsonError(res,e.message==="BODY_LIMIT"?413:400,e.message);}
 const mcp=new McpServer({name:"chatagent-business",version:"0.1.0-dev.0"});
 registerTools(mcp);
 const transport=new StreamableHTTPServerTransport({sessionIdGenerator:undefined,enableJsonResponse:true});
 try{await mcp.connect(transport);await transport.handleRequest(req,res,body);}
 catch{if(!res.headersSent)jsonError(res,500,"BUSINESS_MCP_INTERNAL",body?.id??null);}
 finally{try{await mcp.close();}catch{}}
});
server.listen(port,"127.0.0.1",()=>console.log(JSON.stringify({event:"business_mcp_started",port,
 phase:execReady?"B5":auditReady?"B4":continuityReady?"B3":safeFilesReady?"B2":"B1",instanceId})));
let stopping=false;
const stop=async()=>{
 if(stopping)return;stopping=true;
 try{await execManager?.close();}catch{}
 try{continuity?.close();}catch{}
 server.close();
};
process.once("SIGTERM",()=>{void stop();});process.once("SIGINT",()=>{void stop();});
