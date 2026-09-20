import assert from "node:assert/strict";
import {spawn,spawnSync} from "node:child_process";
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,realpathSync,chmodSync,rmSync,existsSync,readdirSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {randomUUID,randomBytes,createHash} from "node:crypto";
import net from "node:net";
import {setTimeout as delay} from "node:timers/promises";
import {L1Broker} from "./broker-core.mjs";
const sha=x=>createHash("sha256").update(x).digest("hex");
const root=realpathSync(mkdtempSync(join(realpathSync("/tmp"),"ppm-")));
const state=join(root,"owner"),memoryRoot=join(root,"personal-memory"),key=join(root,"agent.key"),mcpKey=join(root,"mcp.key");
mkdirSync(join(root,"work"),{mode:0o700});
const b=new L1Broker(state,{initialize:true});
b.pair("12345678");b.setMode("FULL_HOST","12345678");
const agentToken=randomBytes(32).toString("base64url"),mcpToken=randomBytes(32).toString("base64url");
writeFileSync(key,agentToken,{mode:0o600});writeFileSync(mcpKey,mcpToken,{mode:0o600});
const freePort=async()=>{
 const s=net.createServer();
 return new Promise((resolve,reject)=>{s.once("error",reject);s.listen(0,"127.0.0.1",()=>{
  const p=s.address().port;s.close(()=>resolve(p));
 });});
};
const brokerPort=await freePort(),mcpPort=await freePort();
if(brokerPort===mcpPort)throw Error("PORT_COLLISION");
let server=null,mcp=null;
const wait=async(child,port)=>{
 for(let i=0;i<70;i++){
  if(child.exitCode!==null)throw Error("EARLY_EXIT");
  try{const r=await fetch("http://127.0.0.1:"+port+"/health",{signal:AbortSignal.timeout(300)});
   if(r.status===200)return;}catch{}
  await delay(100);
 }
 throw Error("READY_TIMEOUT");
};
const request=async(method,params={})=>{
 const r=await fetch("http://127.0.0.1:"+mcpPort+"/mcp",{method:"POST",
  headers:{"content-type":"application/json","accept":"application/json, text/event-stream",
   "x-chatagent-l0-credential":mcpToken},
  body:JSON.stringify({jsonrpc:"2.0",id:randomUUID(),method,params})});
 assert.equal(r.status,200);
 const result=await r.json();
 if(result.error)throw Error(result.error.message);
 return result.result;
};
const call=async(name,args)=>{
 const x=await request("tools/call",{name,arguments:args});
 return {value:x.structuredContent,isError:x.isError===true};
};
try{
 const native=join(root,"native-create-excl");
 const compilation=spawnSync("/usr/bin/clang",["-std=c11","-D_DARWIN_C_SOURCE",
   "-Wall","-Wextra","-Werror","-O2",
   new URL("./native-create-excl.c",import.meta.url).pathname,"-o",native],
   {encoding:"utf8",timeout:10000});
 if(compilation.status!==0)throw Error("NATIVE_BUILD_FAILED");
 chmodSync(native,0o700);
 const binarySha=sha(readFileSync(native));
 const nativeCopy=join(root,"native-copy");
 const compileCopy=spawnSync("/usr/bin/clang",["-std=c11","-D_DARWIN_C_SOURCE",
   "-Wno-deprecated-declarations","-Wall","-Wextra","-Werror","-O2",
   new URL("./native-copy-create.c",import.meta.url).pathname,"-o",nativeCopy],
   {encoding:"utf8",timeout:10000});
 if(compileCopy.status!==0)throw Error("NATIVE_COPY_BUILD_FAILED "+compileCopy.stderr);
 chmodSync(nativeCopy,0o700);
 const copySha=sha(readFileSync(nativeCopy));
 server=spawn(process.execPath,[new URL("./broker-server.mjs",import.meta.url).pathname],{
  env:{...process.env,L1_STATE_DIR:state,L1_AGENT_KEY_FILE:key,L1_AGENT_PORT:String(brokerPort),
   L1_FILE_OPS_ENABLED:"1",L1_OWNED_SCRATCH_ENABLED:"1",L1_STRICT_MUTATIONS:"1",
   L1_NATIVE_CREATE_ENABLED:"1",L1_NATIVE_CREATE_BIN:native,L1_NATIVE_CREATE_SHA256:binarySha,
   L1_HOST_EXEC_ENABLED:"1",L1_DURABLE_PROCESS_ENABLED:"1",L1_ASYNC_HASH_ENABLED:"1",
   L1_ASYNC_COPY_ENABLED:"1",L1_NATIVE_COPY_BIN:nativeCopy,L1_NATIVE_COPY_SHA256:copySha,
   L1_COPY_STAGE_RECOVERY_ENABLED:"1",
   PERSONAL_MEMORY_ENABLED:"1",PERSONAL_MEMORY_INIT:"1",PERSONAL_MEMORY_STATE_DIR:memoryRoot},
  stdio:"ignore"
 });
 await wait(server,brokerPort);
 mcp=spawn(process.execPath,[new URL("../l0-ui-probe.mjs",import.meta.url).pathname],{
  env:{...process.env,L0_AUTH_FILE:mcpKey,L0_PORT:String(mcpPort),L1_AGENT_KEY_FILE:key,
   L1_BROKER_URL:"http://127.0.0.1:"+brokerPort,L1_POWERUSER_TOOLS:"1",
   L1_SEMANTIC_WRITE_TOOLS:"1",L1_OWNED_SCRATCH_TOOLS:"1",L1_STRICT_MUTATIONS:"1",
   L1_ASYNC_HASH_TOOLS:"1",L1_ASYNC_COPY_TOOLS:"1",
   L1_COPY_STAGE_RECOVERY_TOOLS:"1",PERSONAL_MEMORY_TOOLS:"1"},
  stdio:"ignore"
 });
 await wait(mcp,mcpPort);
 const tools=(await request("tools/list")).tools;
 assert.equal(tools.length,36);
 assert.equal(Object.hasOwn(tools.find(x=>x.name==="local_copy_stage_cleanup").inputSchema.properties,"path"),false);
 const hashTool=tools.find(x=>x.name==="local_async_hash_start");
 assert.deepEqual(hashTool.annotations,{readOnlyHint:false,destructiveHint:false,openWorldHint:false});
 const ctool=tools.find(x=>x.name==="local_scratch_create");
 const dtool=tools.find(x=>x.name==="local_scratch_cleanup");
 assert.deepEqual(ctool.annotations,{readOnlyHint:false,destructiveHint:false,openWorldHint:false});
 assert.deepEqual(dtool.annotations,{readOnlyHint:false,destructiveHint:true,openWorldHint:false});
 assert.ok(!Object.hasOwn(dtool.inputSchema.properties,"path"));
 console.log("PASS isolated 36-tool personal candidate inventory with owner-only stage recovery and independent memory");
 const userPath=join(root,"work","native-mcp.txt");
 const nativeCreate=await call("local_create_file",{path:userPath,content:"NATIVE_MCP_OK"});
 assert.equal(nativeCreate.isError,false);
 assert.equal(nativeCreate.value.commitMode,"DIRFD_O_EXCL");
 assert.equal(nativeCreate.value.sha256,sha("NATIVE_MCP_OK"));
 assert.equal((await call("local_create_file",{path:userPath,content:"OVERWRITE"})).isError,true);
 const nativeReplace=await call("local_replace_file",{path:userPath,content:"OVERWRITE",
   expectedSha256:sha("NATIVE_MCP_OK")});
 assert.equal(nativeReplace.isError,true);
 assert.equal(nativeReplace.value.code,"ATOMIC_REPLACE_UNAVAILABLE");
 const unavailableCopy=await call("local_copy",{source:userPath,
   destination:join(root,"work","copy.txt"),expectedSourceSha256:sha("NATIVE_MCP_OK"),
   expectedDestinationSha256:null});
 assert.equal(unavailableCopy.isError,true);
 assert.equal(unavailableCopy.value.code,"NATIVE_COPY_UNAVAILABLE");
 console.log("PASS MCP pinned native create-only and strict replace/copy refusals");
 const content="STABLE001_OWNED_SCRATCH_MCP",idempotencyKey=randomUUID();
 const c=await call("local_scratch_create",{content,idempotencyKey});
 assert.equal(c.isError,false);assert.equal(c.value.state,"CREATED");
 assert.equal(c.value.sha256,sha(content));
 const before=(await call("local_scratch_cleanup",{handle:c.value.handle,expectedSha256:sha("other")}));
 assert.equal(before.isError,true);
 const d=await call("local_scratch_cleanup",{handle:c.value.handle,expectedSha256:sha(content)});
 assert.equal(d.isError,false);assert.equal(d.value.state,"CLEANED");
 const again=await call("local_scratch_cleanup",{handle:c.value.handle,expectedSha256:sha(content)});
 assert.equal(again.value.changed,false);
 assert.equal(readdirSync(join(state,"scratch")).length,0);
 console.log("PASS MCP create, wrong hash refusal, exact cleanup, idempotent absence");
 const unknown=await call("local_scratch_cleanup",{handle:randomUUID(),expectedSha256:sha(content)});
 assert.equal(unknown.isError,true);
 console.log("PASS unknown handle denied; no generic deletion");
 const hashPath=join(root,"work","9mb.bin"),hashData=Buffer.alloc(9*1024*1024,0x5a);
 writeFileSync(hashPath,hashData,{mode:0o600});
 const hashKey=randomUUID();
 const hashJob=await call("local_async_hash_start",{path:hashPath,idempotencyKey:hashKey});
 assert.equal(hashJob.isError,false);assert.ok(hashJob.value.processId);
 let terminal;
 for(let i=0;i<120;i++){
  const status=await call("local_async_hash_status",{processId:hashJob.value.processId});
  assert.equal(status.isError,false);
  if(status.value.state==="EXITED"){terminal=status.value;break;}
  if(status.value.state==="FAILED"||status.value.state==="RECOVERY_REQUIRED")
   throw Error("HASH_FAILED_"+status.value.state);
  await delay(80);
 }
 assert.ok(terminal,"HASH_TERMINAL_TIMEOUT");
 const result=await call("local_async_hash_read",{processId:hashJob.value.processId,cursor:0,maxBytes:16384});
 assert.equal(result.isError,false);assert.equal(result.value.exitCode,0);
 assert.match(result.value.content,/HASH_PROGRESS/);
 assert.match(result.value.content,new RegExp(sha(hashData)));
 assert.match(result.value.content,/HASH_DONE/);
 const same=await call("local_async_hash_start",{path:hashPath,idempotencyKey:hashKey});
 assert.equal(same.value.processId,hashJob.value.processId);
 const stopped=await call("local_async_hash_stop",{processId:hashJob.value.processId});
 assert.equal(stopped.value.state,"EXITED");
 console.log("PASS actual MCP 9MiB async hash progress, terminal SHA, owned status and no replay");
 const copyDestination=join(root,"work","copied.bin");
 const cp=await call("local_async_copy_start",{source:hashPath,destination:copyDestination,
   expectedSourceSha256:sha(hashData),idempotencyKey:randomUUID()});
 assert.equal(cp.isError,false);assert.ok(cp.value.processId);
 let cpTerminal;
 for(let i=0;i<120;i++){
  const status=await call("local_async_copy_status",{processId:cp.value.processId});
  if(status.value.state==="EXITED"){cpTerminal=status.value;break;}
  if(["FAILED","RECOVERY_REQUIRED"].includes(status.value.state))throw Error("ASYNC_COPY_FAILED");
  await delay(80);
 }
 assert.ok(cpTerminal,"ASYNC_COPY_TIMEOUT");
 const out=await call("local_async_copy_read",{processId:cp.value.processId,cursor:0,maxBytes:16384});
 assert.equal(out.value.exitCode,0,out.value.content);
 assert.match(out.value.content,/COPY_DONE/);
 assert.equal(sha(readFileSync(copyDestination)),sha(hashData));
 const denied=await call("local_async_copy_start",{source:hashPath,destination:copyDestination,
   expectedSourceSha256:sha(hashData),idempotencyKey:randomUUID()});
 assert.equal(denied.isError,true);assert.equal(denied.value.code,"COPY_DESTINATION_EXISTS");
 console.log("PASS real MCP create-only native async 9MiB copy, final hash, pre-existing denial");
 const corrupt=await call("local_async_copy_start",{source:hashPath,
   destination:join(root,"work","bad-copy.bin"),
   expectedSourceSha256:sha("WRONG"),idempotencyKey:randomUUID()});
 assert.equal(corrupt.isError,false);
 for(let i=0;i<110;i++){
  const st=await call("local_async_copy_status",{processId:corrupt.value.processId});
  if(st.value.state==="FAILED")break;
  if(i===109)throw Error("BAD_COPY_NOT_TERMINAL");
  await delay(70);
 }
 const initial=await call("local_copy_stage_inspect",{processId:corrupt.value.processId});
 assert.equal(initial.value.state,"STAGE_ABSENT_UNVERIFIED");
 const stage=join(root,"work",".personal-copy-"+initial.value.stageId+".stage");
 writeFileSync(stage,"ISOLATED_ORPHAN_STAGE",{mode:0o600,flag:"wx"});
 const found=await call("local_copy_stage_inspect",{processId:corrupt.value.processId});
 assert.equal(found.value.stageSha256,sha("ISOLATED_ORPHAN_STAGE"));
 const mismatch=await call("local_copy_stage_cleanup",{processId:corrupt.value.processId,
  expectedStageSha256:sha("wrong"),expectedDev:found.value.stageDev,
  expectedIno:found.value.stageIno});
 assert.equal(mismatch.isError,true);
 const exact=await call("local_copy_stage_cleanup",{processId:corrupt.value.processId,
  expectedStageSha256:found.value.stageSha256,expectedDev:found.value.stageDev,
  expectedIno:found.value.stageIno});
 assert.equal(exact.isError,false);assert.equal(exact.value.changed,true);
 assert.equal(existsSync(stage),false);
 console.log("PASS owner-only MCP stage inspection, wrong digest denial, exact cleanup");
 assert.equal(tools.some(x=>x.name.startsWith("local_continuity_")),false);
 const pr=await call("personal_project_register",{projectId:"personal-test",rootLabel:"Isolated personal fixture",operationId:randomUUID()});
 assert.equal(pr.isError,false);
 const task=await call("personal_task_start",{projectId:"personal-test",title:"Private checkpoint",operationId:randomUUID()});
 assert.equal(task.isError,false);
 const checkpoint=await call("personal_checkpoint_append",{projectId:"personal-test",taskId:task.value.taskId,
  expectedTaskRevision:0,summary:"Self-contained durable checkpoint",currentState:"Independent personal store",
  nextActions:["Inspect tests"],verification:"PASS",operationId:randomUUID()});
 assert.equal(checkpoint.value.revision,1);
 const context=await call("personal_project_context",{projectId:"personal-test"});
 assert.equal(context.value.project.projectId,"personal-test");
 assert.equal((await call("personal_memory_search",{projectId:"personal-test",query:"checkpoint"})).value.matches.length,1);
 assert.equal((await call("personal_task_get",{projectId:"personal-test",taskId:task.value.taskId})).value.task.revision,1);
 console.log("PASS combined native copy/stage and self-owned memory; no external P8 runtime dependency");
 console.log("PERSONAL_36_TOOL_CANDIDATE=PASS");
}catch(e){console.error("PERSONAL_36_TOOL_CANDIDATE=FAIL "+e.stack);process.exitCode=1;}
finally{
 if(mcp)mcp.kill("SIGTERM");
 if(server)server.kill("SIGTERM");
 await delay(400);
 rmSync(root,{recursive:true,force:true});
 console.log("isolated_fixture_cleanup=COMPLETE");
}
