import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import net from "node:net";
import {mkdtempSync,realpathSync,writeFileSync,rmSync,lstatSync,readFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {randomUUID,randomBytes} from "node:crypto";
import {setTimeout as delay} from "node:timers/promises";
import {L1Broker} from "./broker-core.mjs";
import {PersonalMemoryStore} from "./personal-memory-store.mjs";
import {HostFileOps} from "./host-file-ops.mjs";

const root=realpathSync(mkdtempSync(join("/tmp","pm-mcp-")));
const state=join(root,"owner"),memoryRoot=join(root,"personal-memory");
const key=join(root,"agent.key"),mcpKey=join(root,"mcp.key");
const broker=new L1Broker(state,{initialize:true});
broker.pair("12345678"); // purposely leave host in ASK
const agentToken=randomBytes(32).toString("base64url");
const mcpToken=randomBytes(32).toString("base64url");
writeFileSync(key,agentToken,{mode:0o600});writeFileSync(mcpKey,mcpToken,{mode:0o600});
const freePort=()=>new Promise((resolve,reject)=>{
 const s=net.createServer();s.once("error",reject);
 s.listen(0,"127.0.0.1",()=>{const p=s.address().port;s.close(()=>resolve(p));});
});
const brokerPort=await freePort(),mcpPort=await freePort();
let server=null,mcp=null;
const wait=async(child,port)=>{
 for(let i=0;i<80;i++){
  if(child.exitCode!==null)throw Error("TEST_SERVER_EARLY_EXIT");
  try{const r=await fetch("http://127.0.0.1:"+port+"/health",
    {signal:AbortSignal.timeout(400)});
   if(r.status===200)return;}catch{}
  await delay(100);
 }
 throw Error("TEST_SERVER_READY_TIMEOUT");
};
const rpc=async(method,params={})=>{
 const r=await fetch("http://127.0.0.1:"+mcpPort+"/mcp",{
  method:"POST",headers:{"content-type":"application/json",
   "accept":"application/json, text/event-stream",
   "x-chatagent-l0-credential":mcpToken},
  body:JSON.stringify({jsonrpc:"2.0",id:randomUUID(),method,params}),
  signal:AbortSignal.timeout(10000)
 });
 assert.equal(r.status,200);
 const x=await r.json();
 if(x.error)throw Error(x.error.message);
 return x.result;
};
const call=async(name,args)=>{
 const result=await rpc("tools/call",{name,arguments:args});
 return {value:result.structuredContent,isError:result.isError===true};
};
try{
 server=spawn(process.execPath,[new URL("./broker-server.mjs",import.meta.url).pathname],{
  env:{...process.env,L1_STATE_DIR:state,L1_AGENT_KEY_FILE:key,L1_AGENT_PORT:String(brokerPort),
   L1_FILE_OPS_ENABLED:"0",L1_HOST_EXEC_ENABLED:"0",
   PERSONAL_MEMORY_ENABLED:"1",PERSONAL_MEMORY_INIT:"1",
   PERSONAL_MEMORY_STATE_DIR:memoryRoot},
  stdio:"ignore"
 });
 await wait(server,brokerPort);
 mcp=spawn(process.execPath,[new URL("../l0-ui-probe.mjs",import.meta.url).pathname],{
  env:{...process.env,L0_AUTH_FILE:mcpKey,L0_PORT:String(mcpPort),
   L1_AGENT_KEY_FILE:key,L1_BROKER_URL:"http://127.0.0.1:"+brokerPort,
   PERSONAL_MEMORY_TOOLS:"1",L1_POWERUSER_TOOLS:"0"},
  stdio:"ignore"
 });
 await wait(mcp,mcpPort);
 const tools=(await rpc("tools/list")).tools;
 assert.equal(tools.length,11);
 assert.equal(tools.filter(x=>x.name.startsWith("personal_")).length,7);
 assert.equal(tools.some(x=>x.name==="local_exec_start"),false);
 assert.equal(tools.some(x=>x.name.startsWith("local_continuity_")),false);
 const status=await call("local_access_status",{});
 assert.equal(status.value.mode,"ASK");assert.equal(status.value.realHostExec,false);
 const newOp=randomUUID();
 const project=await call("personal_project_register",{projectId:"workbench",
  rootLabel:"Personal lab",operationId:newOp});
 assert.equal(project.isError,false);
 assert.equal((await call("personal_project_register",{projectId:"workbench",
  rootLabel:"Personal lab",operationId:newOp})).value.duplicate,true);
 const other=await call("personal_project_register",{projectId:"other",
  rootLabel:"Other",operationId:randomUUID()});
 assert.equal(other.isError,false);
 const task=await call("personal_task_start",{projectId:"workbench",
  title:"Independent personal memory",operationId:randomUUID()});
 assert.equal(task.isError,false);
 const taskId=task.value.taskId;
 const input={projectId:"workbench",taskId,expectedTaskRevision:0,
  summary:"First personal checkpoint",currentState:"Owned SQLite and HMAC chain",
  nextActions:["Verify crash recovery"],verification:"MCP canary PASS",
  operationId:randomUUID()};
 const cp=await call("personal_checkpoint_append",input);
 assert.equal(cp.isError,false);assert.equal(cp.value.revision,1);
 const dup=await call("personal_checkpoint_append",input);
 assert.equal(dup.value.duplicate,true);
 const wrong=await call("personal_checkpoint_append",{...input,projectId:"other",operationId:randomUUID()});
 assert.equal(wrong.isError,true);assert.equal(wrong.value.code,"MEMORY_PROJECT_DENIED");
 const stale=await call("personal_checkpoint_append",{...input,operationId:randomUUID()});
 assert.equal(stale.isError,true);assert.equal(stale.value.code,"MEMORY_REVISION_CONFLICT");
 const unauthorized=await call("personal_task_get",{projectId:"other",taskId});
 assert.equal(unauthorized.isError,true);
 assert.equal(unauthorized.value.code,"MEMORY_PROJECT_DENIED");
 const context=await call("personal_project_context",{projectId:"workbench"});
 assert.equal(context.value.project.projectId,"workbench");
 const search=await call("personal_memory_search",{projectId:"workbench",query:"checkpoint"});
 assert.equal(search.value.matches.length,1);
 assert.equal((await call("personal_memory_search",{projectId:"other",query:"checkpoint"})).value.matches.length,0);
 const get=await call("personal_task_get",{projectId:"workbench",taskId});
 assert.equal(get.value.task.checkpoints.length,1);
 const done=await call("personal_task_complete",{projectId:"workbench",taskId,
  expectedTaskRevision:1,operationId:randomUUID()});
 assert.equal(done.value.status,"COMPLETED");
 const immutable=await call("personal_checkpoint_append",{...input,expectedTaskRevision:2,operationId:randomUUID()});
 assert.equal(immutable.isError,true);assert.equal(immutable.value.code,"MEMORY_TASK_COMPLETED");
 const secret=await call("personal_task_start",{projectId:"workbench",
  title:"password=should-not-be-saved",operationId:randomUUID()});
 assert.equal(secret.isError,true);assert.equal(secret.value.code,"MEMORY_INVALID_OR_SENSITIVE_TEXT");
 console.log("PASS actual 11-tool memory MCP in ASK, project isolation, CAS, idempotency, immutable completion and secrets");

 // No data shared with any other app: this independently sealed root is
 // excluded from the generic host file facade even if FULL_HOST were enabled.
 const memoryView=new PersonalMemoryStore(memoryRoot,{ownerStatus:()=>broker.status()});
 assert.equal(memoryView.taskGet({projectId:"workbench",taskId}).task.revision,2);
 const protectedFiles=new HostFileOps(broker,{privateRoot:state,protectedRoots:[memoryRoot]});
 broker.setMode("FULL_HOST","12345678");
 await assert.rejects(()=>protectedFiles.read({path:join(memoryRoot,"memory-seal.key")}),
  /OWNER_CONTROL_PATH_DENIED/);
 await assert.rejects(()=>protectedFiles.hash({path:join(memoryRoot,"memory.sqlite")}),
  /OWNER_CONTROL_PATH_DENIED/);
 memoryView.close();
 console.log("PASS independently reopened memory, private key and database denied through host file facade");
 console.log("PERSONAL_MEMORY_MCP=PASS");
}catch(e){
 console.error("PERSONAL_MEMORY_MCP=FAIL "+e.stack);process.exitCode=1;
}finally{
 if(mcp)mcp.kill("SIGTERM");
 if(server)server.kill("SIGTERM");
 await delay(450);
 rmSync(root,{recursive:true,force:true});
 console.log("test_only_fixture_cleanup=COMPLETE");
}
