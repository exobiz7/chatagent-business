import http from "node:http";
import {readFileSync} from "node:fs";
import {join} from "node:path";
import {timingSafeEqual} from "node:crypto";
import {McpServer} from "@modelcontextprotocol/sdk/server/mcp.js";
import {StreamableHTTPServerTransport} from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import {z} from "zod";
import {boundedJSONBody} from "../l1/bounded-json-body.mjs";
import {BusinessRegistry,businessStatus} from "./business-core.mjs";
import {BusinessFileOps} from "./business-file-ops.mjs";
import {BusinessContinuity} from "./business-continuity.mjs";

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
const expected=readFileSync(authFile,"utf8").trim();
if(!/^[A-Za-z0-9_-]{43,256}$/.test(expected))throw Error("BUSINESS_AUTH_INVALID");

const port=Number(process.env.CHATAGENT_BUSINESS_PORT||31850);
if(!Number.isInteger(port)||port<1024||port>65535)throw Error("BUSINESS_PORT_INVALID");
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
 const code=/^[A-Z][A-Z0-9_]{2,64}$/.test(String(e?.message))?String(e.message):"BUSINESS_FILE_OPERATION_FAILED";
 const data={code,success:false,...(e?.effect==="UNCERTAIN"?{effect:"UNCERTAIN",retryable:false}:{})};
 return {...text(data),isError:true};
};

const projectId=z.string().regex(/^[a-z0-9][a-z0-9._-]{0,63}$/);
const relativePath=z.string().max(4096);
const sha=z.string().regex(/^[a-f0-9]{64}$/);
const uuid=z.string().uuid();
const contextDigest=z.string().regex(/^sha256:[a-f0-9]{64}$/);

function registerTools(mcp){
 mcp.registerTool("business_status",{
  description:"Read bounded organization, project-profile and runtime readiness status. Never returns host roots or secrets.",
  inputSchema:z.strictObject({}),
  annotations:{readOnlyHint:true,destructiveHint:false,openWorldHint:false}
 },async()=>text(businessStatus(registry,{safeFilesReady,continuityReady})));

 if(!files)return;
 const register=(name,description,schema,method,{readOnly=false,destructive=false}={})=>
  mcp.registerTool(name,{description,inputSchema:z.strictObject(schema),
   annotations:{readOnlyHint:readOnly,destructiveHint:destructive,openWorldHint:false}},async(args)=>{
    try{return text(await files[method](args));}catch(e){return toolError(e);}
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
    try{return text(await continuity[method](args));}catch(e){return toolError(e);}
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
}

const server=http.createServer(async(req,res)=>{
 if(req.url==="/health"&&req.method==="GET"){
  res.writeHead(200,{"content-type":"application/json","cache-control":"no-store"});
  res.end(JSON.stringify({ready:true,phase:continuityReady?"B3":safeFilesReady?"B2":"B1",
   safeFilesReady,continuityReady}));return;
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
 phase:continuityReady?"B3":safeFilesReady?"B2":"B1"})));
const stop=()=>{try{continuity?.close();}catch{}server.close();};
process.once("SIGTERM",stop);process.once("SIGINT",stop);
