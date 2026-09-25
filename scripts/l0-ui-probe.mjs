import http from "node:http";
import {boundedJSONBody} from "./l1/bounded-json-body.mjs";
import {callL1} from "./l1/l1-file-transport.mjs";
import { randomUUID, timingSafeEqual } from "node:crypto";
import { readFileSync } from "node:fs";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";

const tokenFile=process.env.L0_AUTH_FILE;
if(!tokenFile) throw Error("L0_AUTH_FILE_REQUIRED");
const expected=readFileSync(tokenFile,"utf8").trim();
if(!/^[A-Za-z0-9_-]{43,256}$/.test(expected)) throw Error("L0_AUTH_INVALID");
const port=Number(process.env.L0_PORT||3109);
const l1Url=process.env.L1_BROKER_URL;
if(l1Url&&!/^http:\/\/127\.0\.0\.1:[0-9]{4,5}$/.test(l1Url))throw Error("L1_BROKER_URL_UNSAFE");
const l1Token=l1Url?readFileSync(process.env.L1_AGENT_KEY_FILE,"utf8").trim():null;
const powerUserTools=process.env.L1_POWERUSER_TOOLS==="1";
const semanticWriteTools=process.env.L1_SEMANTIC_WRITE_TOOLS==="1";
const scratchTools=process.env.L1_OWNED_SCRATCH_TOOLS==="1";
const strictMutations=process.env.L1_STRICT_MUTATIONS==="1";
const asyncHashTools=process.env.L1_ASYNC_HASH_TOOLS==="1";
const asyncCopyTools=process.env.L1_ASYNC_COPY_TOOLS==="1";
const copyStageTools=process.env.L1_COPY_STAGE_RECOVERY_TOOLS==="1";
const personalMemoryTools=process.env.PERSONAL_MEMORY_TOOLS==="1";
// Explicit Personal presentation profile: hide development probes and known
// unavailable operations. Default development inventory remains unchanged.
// This is discovery/schema only; L1 still enforces actual authority and effects.
const personalCoreTools=process.env.PERSONAL_CORE_TOOLS==="1";
const nativeReplaceEnabled=process.env.L1_NATIVE_REPLACE_ENABLED==="1";
if(copyStageTools&&!asyncCopyTools)throw Error("COPY_STAGE_REQUIRES_ASYNC_COPY_TOOLS");
if(asyncCopyTools&&!powerUserTools)throw Error("ASYNC_COPY_REQUIRES_POWERUSER_TOOLS");
if(asyncHashTools&&!powerUserTools)throw Error("ASYNC_HASH_REQUIRES_POWERUSER_TOOLS");
if(scratchTools&&!semanticWriteTools)throw Error("SEMANTIC_WRITE_TOOLS_REQUIRED");
if(semanticWriteTools&&!powerUserTools)throw Error("POWERUSER_TOOLS_REQUIRED");
if(powerUserTools&&!l1Url)throw Error("L1_BROKER_REQUIRED");
async function brokerCall(route,body={}){
  return callL1({route,body,url:l1Url,token:l1Token});
}

const requests=new Map();
let harmlessWrites=0;
const text=(data)=>({content:[{type:"text",text:JSON.stringify(data)}],structuredContent:data});
const toolError=e=>({...text({code:e.message||"BROKER_UNAVAILABLE",success:false,
  ...(["COMMITTED","UNCERTAIN"].includes(e.effect)?{effect:e.effect,retryable:false}:{}),
  ...(e.audit==="UNCERTAIN"?{audit:"UNCERTAIN"}:{})}),isError:true});
const error=(res,status,reason,id=null)=>{res.writeHead(status,{"content-type":"application/json"});res.end(JSON.stringify({jsonrpc:"2.0",id,error:{code:-32000,message:reason}}));};
const eq=(a,b)=>{const x=Buffer.from(a??""),y=Buffer.from(b??"");return x.length===y.length&&timingSafeEqual(x,y);};
const server=http.createServer(async(req,res)=>{
  if(req.url==="/health"&&req.method==="GET"){res.writeHead(200);res.end("ok");return;}
  if(req.url!=="/mcp"||req.method!=="POST")return error(res,404,"NOT_FOUND");
  if(!eq(req.headers["x-chatagent-l0-credential"],expected))return error(res,401,"UNAUTHORIZED");
  // Parse byte-counted complete UTF-8, not per-chunk Buffer.toString().
  // Only file text operations retain the larger authenticated envelope.
  let parsed;
  try{parsed=await boundedJSONBody(req,{maxBytes:350000,oversizeCode:"BODY_LIMIT"});}
  catch(e){return error(res,e.message==="BODY_LIMIT"?413:400,e.message);}
  const {body,bytes}=parsed;
  if(bytes>16384&&!(body?.method==="tools/call"&&
      ["local_write","local_create_file","local_replace_file"].includes(body?.params?.name)))
    return error(res,413,"BODY_LIMIT");
  // Phase 6 accepted compatibility: authenticated legacy discovery negotiation is not a tool.
  if (body && !Array.isArray(body) && body.jsonrpc === "2.0" && body.method === "server/discover" &&
      (body.id == null || typeof body.id === "string" || (typeof body.id === "number" && Number.isFinite(body.id))) &&
      (body.params === undefined || (body.params !== null && typeof body.params === "object" && !Array.isArray(body.params)))) {
    res.writeHead(404,{"content-type":"application/json"});
    res.end(JSON.stringify({jsonrpc:"2.0",id:body.id??null,error:{code:-32601,message:"Method not found"}}));
    return;
  }
  if(body?.jsonrpc!=="2.0"||!["initialize","notifications/initialized","tools/list","tools/call","ping"].includes(body.method))return error(res,403,"CAPABILITY_DENIED",body?.id??null);
  const mcp=new McpServer({name:"chatagent-stable001-l0-ui-probe",version:"0.0.1"});
  mcp.registerTool("local_access_status",{description:l1Url?"Read current paired owner, configured Full Host mode and actual enabled host file/process gates. This status alone does not prove access to a particular path.":"L0 probe without real filesystem access or owner grants.",inputSchema:z.strictObject({}),annotations:{readOnlyHint:true,destructiveHint:false,openWorldHint:false}},async()=>text(l1Url?await brokerCall("status"):{mode:"L0_PROBE",approvedGrants:0,ownerIdentity:"UNVERIFIED",realFilesystemAccess:false}));
  mcp.registerTool("local_request_access",{description:"L0 UI-only permission request proposal. Does NOT grant access. No host filesystem actions are performed.",inputSchema:z.strictObject({path:z.string().min(1).max(512),purpose:z.string().min(1).max(256),mode:z.enum(["read","write","host_exec"])}),annotations:{readOnlyHint:false,destructiveHint:false,openWorldHint:false}},async(a)=>{
    if(l1Url){
      const result=await brokerCall("request",{path:a.path,mode:a.mode,purpose:a.purpose,lifetime:"task"});
      return text({...result,code:result.status,realGrant:false,ownerApproval:"LOCAL_OWNER_CLI_REQUIRED",nextStep:"Ask the paired local Mac owner to inspect and approve through the isolated L1 owner CLI. This only records approval; no filesystem access is enabled."});
    }
    const requestId=randomUUID();
    requests.set(requestId,{status:"PENDING_OWNER_APPROVAL",mode:a.mode,path:a.path,expires:Date.now()+120000});
    return text({code:"PENDING_OWNER_APPROVAL",requestId,requestedMode:a.mode,displayPath:a.path,ownerApproval:"UNAVAILABLE_IN_L0",nextStep:"This is a UI probe; no grant can be issued here."});
  });
  mcp.registerTool("local_check_access",{description:"L0 read-only check of a proposed request; never yields a real approved grant.",inputSchema:z.strictObject({requestId:z.string().uuid()}),annotations:{readOnlyHint:true,destructiveHint:false,openWorldHint:false}},async(a)=>{
    if(l1Url)return text(await brokerCall("check",{requestId:a.requestId}));
    const item=requests.get(a.requestId);
    return text({requestId:a.requestId,status:!item?"NOT_FOUND":Date.now()>item.expires?"EXPIRED":item.status,realGrant:false});
  });
  if(!personalCoreTools){
    mcp.registerTool("l0_confirmation_probe",{description:"Harmless L0 write-annotation UI probe. Only increments volatile test counter, never changes files, permissions or settings.",inputSchema:z.strictObject({note:z.string().max(120)}),annotations:{readOnlyHint:false,destructiveHint:false,openWorldHint:false}},async()=>{
      harmlessWrites++;return text({result:"VOLATILE_COUNTER_UPDATED",counter:harmlessWrites,realEffect:false});
    });
  }
  if(personalMemoryTools){
    if(!l1Url)throw Error("PERSONAL_MEMORY_BROKER_REQUIRED");
    const projectId=z.string().regex(/^[a-z0-9][a-z0-9._-]{0,127}$/);
    const taskId=z.string().uuid(),operationId=z.string().uuid();
    const memoryWrite=(name,description,schema,route)=>mcp.registerTool(name,{
      description,inputSchema:z.strictObject(schema),
      annotations:{readOnlyHint:false,destructiveHint:false,openWorldHint:false}
    },async(a)=>{
      try{return text(await brokerCall("personal-memory/"+route,a));}
      catch(e){return {...text({code:e.message||"MEMORY_UNAVAILABLE",success:false}),isError:true};}
    });
    const memoryRead=(name,description,schema,route)=>mcp.registerTool(name,{
      description,inputSchema:z.strictObject(schema),
      annotations:{readOnlyHint:true,destructiveHint:false,openWorldHint:false}
    },async(a)=>{
      try{return text(await brokerCall("personal-memory/"+route,a));}
      catch(e){return {...text({code:e.message||"MEMORY_UNAVAILABLE",success:false}),isError:true};}
    });
    memoryWrite("personal_project_register","Register metadata for one project in this personal product's own private memory store; independent of P8 and host grants.",
      {projectId,rootLabel:z.string().min(1).max(128),operationId},"project-register");
    memoryWrite("personal_task_start","Create an owner-scoped task under an existing personal project. Requires idempotency UUID.",
      {projectId,title:z.string().min(1).max(160),operationId},"task-start");
    memoryWrite("personal_checkpoint_append","Append a personal task checkpoint with exact project, task, expected revision, and operation UUID; cannot authorize host execution.",
      {projectId,taskId,expectedTaskRevision:z.number().int().nonnegative(),operationId,
       summary:z.string().min(1).max(512),currentState:z.string().min(1).max(512),
       nextActions:z.array(z.string().min(1).max(256)).max(5),verification:z.string().min(1).max(512),
       artifactRefs:z.array(z.string().min(1).max(128)).max(5).optional(),
       gitSha:z.string().regex(/^[a-f0-9]{40}$/).nullable().optional()},"checkpoint-append");
    memoryWrite("personal_task_complete","Complete an exact project/task at the expected revision; the task becomes immutable.",
      {projectId,taskId,expectedTaskRevision:z.number().int().nonnegative(),operationId},"task-complete");
    memoryRead("personal_task_get","Read one existing personal task only from the explicitly supplied matching project.",
      {projectId,taskId},"task-get");
    memoryRead("personal_project_context","Read bounded task context from an explicit personal project; no host authority.",
      {projectId,limit:z.number().int().min(1).max(20).optional()},"project-context");
    memoryRead("personal_memory_search","Bounded lexical checkpoint search inside an explicit personal project.",
      {projectId,query:z.string().min(1).max(128),limit:z.number().int().min(1).max(20).optional()},"search");
  }
  if(powerUserTools){
    const path=z.string().min(1).max(4096);
    const requestId=z.string().uuid();
    const sha=z.string().regex(/^[0-9a-f]{64}$/);
    const key=z.string().uuid();
    const register=(name,description,schema,route,readonly=false)=>mcp.registerTool(name,{
      description,inputSchema:z.strictObject(schema),annotations:{readOnlyHint:readonly,destructiveHint:!readonly,openWorldHint:name==="local_exec_start"}
    },async(args)=>{
      try{return text(await brokerCall(route,args));}
      catch(e){return toolError(e);}
    });
    register("local_list","List an absolute macOS path through explicit persistent owner FULL_HOST delegation; bounded and paginated.",
      {path,offset:z.number().int().nonnegative().optional(),limit:z.number().int().min(1).max(250).optional()},"file/list",true);
    register("local_stat","Stat an absolute macOS path under delegated ordinary-user authority.",{path},"file/stat",true);
    register("local_read","Read bounded UTF-8 bytes from a regular host file; use local_hash for large/binary files.",
      {path,offset:z.number().int().nonnegative().optional(),maxBytes:z.number().int().min(1).max(65536).optional()},"file/read",true);
    register("local_hash","Compute SHA-256 and size of a regular host file without returning its contents.",{path},"file/hash",true);
    register("local_write",personalCoreTools?"Create a NEW UTF-8 file only under owner FULL_HOST. Existing targets are not replaced; use local_create_file for the simpler create-only contract.":strictMutations?"Legacy create mode only in strict mode; existing-target replace returns ATOMIC_REPLACE_UNAVAILABLE. Use local_create_file for non-destructive creation.":"Create or replace a UTF-8 file under persistent FULL_HOST; replace requires exact existing SHA-256.",
      {path,content:z.string().max(262144),mode:z.enum(personalCoreTools?["create"]:["create","replace"]),expectedSha256:sha.nullable()},"file/write");
    if(semanticWriteTools){
      // Per MCP annotations, a create-only O_EXCL operation does not overwrite or delete.
      mcp.registerTool("local_create_file",{
        description:"Create a NEW UTF-8 regular file at an absolute macOS path. Fails if it already exists; never overwrites or deletes data. Requires paired owner FULL_HOST and macOS user file permission.",
        inputSchema:z.strictObject({path,content:z.string().max(262144)}),
        annotations:{readOnlyHint:false,destructiveHint:false,openWorldHint:false}
      },async(a)=>{
        try{return text(await brokerCall("file/create",a));}
        catch(e){return toolError(e);}
      });
      if(!personalCoreTools||nativeReplaceEnabled)mcp.registerTool("local_replace_file",{
        description:nativeReplaceEnabled?"Replace an EXISTING regular file at exact expected SHA-256 using native dual-inode O_EXLOCK plus Darwin atomic RENAME_SWAP, post-swap verification and safe rollback. Preserves regular mode and xattrs; ACL/special flags refused. Raw writers can ignore advisory locks, so UNCERTAIN remains possible and must never be blindly retried.":strictMutations?"UNAVAILABLE in strict mode: existing-target replace returns ATOMIC_REPLACE_UNAVAILABLE until a reviewed atomic CAS implementation exists.":"Replace an existing regular file only when its current SHA-256 matches expectedSha256. Changes content and may lose previous data; no implicit create or delete.",
        inputSchema:z.strictObject({path,content:z.string().max(262144),expectedSha256:sha}),
        annotations:{readOnlyHint:false,destructiveHint:true,openWorldHint:false}
      },async(a)=>{
        try{return text(await brokerCall("file/replace",a));}
        catch(e){return toolError(e);}
      });
    }
    if(scratchTools){
      // Only internally generated scratch fixtures can be removed. No path input.
      mcp.registerTool("local_scratch_create",{
        description:"Create a bounded temporary UTF-8 test fixture in the private ChatAgent scratch directory. Returns opaque handle and content SHA-256; no user-selectable filesystem path.",
        inputSchema:z.strictObject({content:z.string().max(16384),idempotencyKey:key}),
        annotations:{readOnlyHint:false,destructiveHint:false,openWorldHint:false}
      },async(a)=>{
        try{return text(await brokerCall("scratch/create",a));}
        catch(e){return {...text({code:e.message||"BROKER_UNAVAILABLE",success:false}),isError:true};}
      });
      mcp.registerTool("local_scratch_cleanup",{
        description:"Delete ONLY a ChatAgent-owned scratch fixture identified by its opaque handle and exact expected SHA-256. Cannot delete an arbitrary user path.",
        inputSchema:z.strictObject({handle:key,expectedSha256:sha}),
        annotations:{readOnlyHint:false,destructiveHint:true,openWorldHint:false}
      },async(a)=>{
        try{return text(await brokerCall("scratch/cleanup",a));}
        catch(e){return {...text({code:e.message||"BROKER_UNAVAILABLE",success:false}),isError:true};}
      });
    }
    if(!personalCoreTools)register("local_copy",process.env.L1_NATIVE_CREATE_ENABLED==="1"?"UNAVAILABLE in native create-only mode: source-bound copy requires separately reviewed descriptor-anchored implementation.":strictMutations?"Copy source to NEW destination only, with exact source hash; existing-target replacement returns ATOMIC_REPLACE_UNAVAILABLE in strict mode.":"Copy a host file with exact source digest and destination-create/replace preconditions; avoid retry after ambiguous timeout.",
      {source:path,destination:path,expectedSourceSha256:sha,expectedDestinationSha256:sha.nullable().optional()},"file/copy");
    if(asyncCopyTools){
      register("local_async_copy_start","Start a create-only, bounded, owned native source-bound copy. Requires exact source SHA-256. Does not replace any existing destination. Progress and final hash require owned status/read.",
        {source:path,destination:path,expectedSourceSha256:sha,idempotencyKey:key},"async-copy/start");
      register("local_async_copy_status","Read status for an owned async copy job.",
        {processId:requestId},"async-copy/status",true);
      register("local_async_copy_read","Read bounded progress and final SHA of an owned copy job.",
        {processId:requestId,cursor:z.number().int().nonnegative().optional(),maxBytes:z.number().int().min(1).max(16384).optional()},"async-copy/read",true);
      register("local_async_copy_stop","Stop only an owned create-only copy job.",
        {processId:requestId},"async-copy/stop");
      if(copyStageTools){
        register("local_copy_stage_inspect","Inspect only this Broker-owned terminal copy job's UUID-named staging artifact. Returns bounded SHA, inode and size for operator reconciliation; never deletes.",
          {processId:requestId},"async-copy/stage-inspect",true);
        mcp.registerTool("local_copy_stage_cleanup",{
          description:"Delete ONLY the exact orphan stage of a terminal Broker-owned copy after matching SHA-256, device and inode. No arbitrary path input; unknown or running job denied.",
          inputSchema:z.strictObject({processId:requestId,expectedStageSha256:sha,
            expectedDev:z.string().regex(/^\d+$/),expectedIno:z.string().regex(/^\d+$/)}),
          annotations:{readOnlyHint:false,destructiveHint:true,openWorldHint:false}
        },async(a)=>{
          try{return text(await brokerCall("async-copy/stage-cleanup",a));}
          catch(e){return {...text({code:e.message||"BROKER_UNAVAILABLE",success:false}),isError:true};}
        });
      }
    }
    if(asyncHashTools){
      mcp.registerTool("local_async_hash_start",{
        description:"Start a bounded read-only SHA-256 job on an owner-accessible regular file. Returns an owned processId; progress and final hash require status/read. No copy, replace or delete.",
        inputSchema:z.strictObject({path,idempotencyKey:key}),
        annotations:{readOnlyHint:false,destructiveHint:false,openWorldHint:false}
      },async(a)=>{
        try{return text(await brokerCall("async-hash/start",a));}
        catch(e){return {...text({code:e.message||"BROKER_UNAVAILABLE",success:false}),isError:true};}
      });
      register("local_async_hash_status","Read status of this Broker-owned hash job.",
        {processId:requestId},"async-hash/status",true);
      register("local_async_hash_read","Read bounded progress and terminal digest for this owned hash job.",
        {processId:requestId,cursor:z.number().int().nonnegative().optional(),
         maxBytes:z.number().int().min(1).max(16384).optional()},"async-hash/read",true);
      register("local_async_hash_stop","Stop only the identified Broker-owned hash job.",
        {processId:requestId},"async-hash/stop");
    }
    register("local_exec_start","Start an owner-delegated ordinary-user host process; absolute executable, argv, cwd and idempotency key. Shell interpreters can access user files/network; no sandbox or sudo bypass is claimed.",
      {executable:path,argv:z.array(z.string().max(8192)).max(48),cwd:path,timeoutMs:z.number().int().min(100).max(3600000).optional(),idempotencyKey:key},"process/start");
    register("local_process_status","Status of a process owned by this broker.",{processId:requestId},"process/status",true);
    register("local_process_read","Read bounded UTF-8 output for an owned process with cursor.",
      {processId:requestId,cursor:z.number().int().nonnegative().optional(),maxBytes:z.number().int().min(1).max(16384).optional()},"process/read",true);
    if(!personalCoreTools)register("local_process_input","Send bounded stdin to a currently running owned process.",
      {processId:requestId,content:z.string().max(16384)},"process/input");
    register("local_process_stop","Stop only a process owned by this broker.",{processId:requestId},"process/stop");
  }
  const transport=new StreamableHTTPServerTransport({sessionIdGenerator:undefined,enableJsonResponse:true});
  try{await mcp.connect(transport);await transport.handleRequest(req,res,body);}
  catch{if(!res.headersSent)error(res,500,"L0_INTERNAL");}
  finally{try{await mcp.close();}catch{}}
});
server.listen(port,"127.0.0.1",()=>console.log(JSON.stringify({event:"l0_started",port,realAccess:false})));
