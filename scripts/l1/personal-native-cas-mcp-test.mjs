import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import {spawn,spawnSync} from "node:child_process";
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,chmodSync,readdirSync,
 realpathSync,rmSync} from "node:fs";
import {join} from "node:path";
import {tmpdir} from "node:os";
import {randomUUID,randomBytes,createHash} from "node:crypto";
import net from "node:net";
import {setTimeout as delay} from "node:timers/promises";
import {L1Broker} from "./broker-core.mjs";
const sha=x=>createHash("sha256").update(x).digest("hex");
const root=realpathSync(mkdtempSync(join(tmpdir(),"personal-cas-mcp-")));
const state=join(root,"owner"),memoryRoot=join(root,"memory"),key=join(root,"agent.key"),
 mcpKey=join(root,"mcp.key"),work=join(root,"work");
mkdirSync(work,{mode:0o700});
const b=new L1Broker(state,{initialize:true});
b.pair("12345678");b.setMode("FULL_HOST","12345678");
writeFileSync(key,randomBytes(32).toString("base64url"),{mode:0o600});
writeFileSync(mcpKey,randomBytes(32).toString("base64url"),{mode:0o600});
const build=(src,name)=>{
 const binary=join(root,name);
 const cc=spawnSync("/usr/bin/clang",["-std=c11","-D_DARWIN_C_SOURCE",
  "-Wno-deprecated-declarations","-Wall","-Wextra","-Werror","-O2",
  fileURLToPath(new URL(src,import.meta.url)),"-o",binary],{encoding:"utf8",timeout:10000});
 assert.equal(cc.status,0,cc.stderr);chmodSync(binary,0o700);
 return {binary,hash:sha(readFileSync(binary))};
};
const create=build("./native-create-excl.c","create");
const copy=build("./native-copy-create.c","copy");
const cas=build("./native-replace-cas.c","cas");
const freePort=async()=>{
 const srv=net.createServer();
 return await new Promise((resolve,reject)=>{
  srv.once("error",reject);
  srv.listen(0,"127.0.0.1",()=>{const p=srv.address().port;srv.close(()=>resolve(p));});
 });
};
let l1=null,l0=null;
const wait=async(child,port)=>{
 for(let i=0;i<90;i++){
  if(child.exitCode!==null)throw Error("EARLY_EXIT");
  try{const r=await fetch("http://127.0.0.1:"+port+"/health",{
    signal:AbortSignal.timeout(300)});if(r.status===200)return;}catch{}
  await delay(80);
 }
 throw Error("READY_TIMEOUT");
};
try{
 const agentPort=await freePort(),mcpPort=await freePort();
 assert.notEqual(agentPort,mcpPort);
 l1=spawn(process.execPath,[fileURLToPath(new URL("./broker-server.mjs",import.meta.url))],{
  env:{...process.env,L1_STATE_DIR:state,L1_AGENT_KEY_FILE:key,L1_AGENT_PORT:String(agentPort),
   L1_FILE_OPS_ENABLED:"1",L1_STRICT_MUTATIONS:"1",L1_NATIVE_CREATE_ENABLED:"1",
   L1_NATIVE_CREATE_BIN:create.binary,L1_NATIVE_CREATE_SHA256:create.hash,
   L1_NATIVE_REPLACE_ENABLED:"1",L1_NATIVE_REPLACE_BIN:cas.binary,
   L1_NATIVE_REPLACE_SHA256:cas.hash,
   L1_HOST_EXEC_ENABLED:"1",L1_DURABLE_PROCESS_ENABLED:"1",L1_ASYNC_HASH_ENABLED:"1",
   L1_ASYNC_COPY_ENABLED:"1",L1_NATIVE_COPY_BIN:copy.binary,
   L1_NATIVE_COPY_SHA256:copy.hash,L1_COPY_STAGE_RECOVERY_ENABLED:"1",
   L1_OWNED_SCRATCH_ENABLED:"1",PERSONAL_MEMORY_ENABLED:"1",
   PERSONAL_MEMORY_INIT:"1",PERSONAL_MEMORY_STATE_DIR:memoryRoot},
  stdio:"ignore"
 });
 await wait(l1,agentPort);
 l0=spawn(process.execPath,[fileURLToPath(new URL("../l0-ui-probe.mjs",import.meta.url))],{
  env:{...process.env,L0_AUTH_FILE:mcpKey,L0_PORT:String(mcpPort),
   L1_AGENT_KEY_FILE:key,L1_BROKER_URL:"http://127.0.0.1:"+agentPort,
   L1_POWERUSER_TOOLS:"1",L1_SEMANTIC_WRITE_TOOLS:"1",L1_STRICT_MUTATIONS:"1",
   L1_NATIVE_CREATE_ENABLED:"1",L1_NATIVE_REPLACE_ENABLED:"1",
   L1_DURABLE_PROCESS_ENABLED:"1",L1_OWNED_SCRATCH_TOOLS:"1",
   L1_ASYNC_HASH_TOOLS:"1",L1_ASYNC_COPY_TOOLS:"1",
   L1_COPY_STAGE_RECOVERY_TOOLS:"1",PERSONAL_MEMORY_TOOLS:"1",
   PERSONAL_CORE_TOOLS:"1"},
  stdio:"ignore"
 });
 await wait(l0,mcpPort);
 const callRpc=async(method,params={})=>{
  const r=await fetch("http://127.0.0.1:"+mcpPort+"/mcp",{
   method:"POST",headers:{"content-type":"application/json",
    "accept":"application/json, text/event-stream",
    "x-chatagent-l0-credential":readFileSync(mcpKey,"utf8")},
   body:JSON.stringify({jsonrpc:"2.0",id:randomUUID(),method,params})});
  assert.equal(r.status,200);const value=(await r.json());
  if(value.error)throw Error(value.error.message);
  return value.result;
 };
 const call=async(name,args)=>{
  const r=await callRpc("tools/call",{name,arguments:args});
  return {value:r.structuredContent,isError:r.isError===true};
 };
 const tools=(await callRpc("tools/list")).tools, names=tools.map(t=>t.name);
 assert.equal(names.length,33);assert.equal(new Set(names).size,33);
 assert.equal(names.includes("local_replace_file"),true);
 assert.equal(names.includes("local_process_input"),false);
 assert.equal(names.includes("local_copy"),false);
 assert.equal(names.includes("l0_confirmation_probe"),false);
 assert.equal(names.some(x=>/backup|archive|rotate|continuity/.test(x)),false);
 const replaceTool=tools.find(t=>t.name==="local_replace_file");
 assert.equal(replaceTool.title,"Replace existing file");
 assert.deepEqual(replaceTool.annotations,{readOnlyHint:false,destructiveHint:true,openWorldHint:false,idempotentHint:false});
 assert.match(replaceTool.description,/explicitly asked|confirmation/i);
 assert.deepEqual(tools.find(t=>t.name==="local_write").annotations,{readOnlyHint:false,destructiveHint:false,openWorldHint:false});
 assert.deepEqual(tools.find(t=>t.name==="local_async_copy_start").annotations,{readOnlyHint:false,destructiveHint:false,openWorldHint:false});
 assert.deepEqual(tools.find(t=>t.name==="local_async_hash_start").annotations,{readOnlyHint:false,destructiveHint:false,openWorldHint:false});
 assert.deepEqual(tools.find(t=>t.name==="local_exec_start").annotations,{readOnlyHint:false,destructiveHint:true,openWorldHint:true});
 assert.deepEqual(tools.find(t=>t.name==="local_process_stop").annotations,{readOnlyHint:false,destructiveHint:true,openWorldHint:false});
 assert.deepEqual(tools.find(t=>t.name==="personal_task_complete").annotations,{readOnlyHint:false,destructiveHint:true,openWorldHint:false});
 console.log("PASS opted-in core 33 names and OpenAI write/destructive annotations match actual behavior");
 const target=join(work,"mcp-existing.txt");
 const made=await call("local_create_file",{path:target,content:"MCP_BASE"});
 assert.equal(made.isError,false);assert.equal(made.value.sha256,sha("MCP_BASE"));
 const wrong=await call("local_replace_file",{path:target,content:"BAD",
  expectedSha256:sha("WRONG")});
 assert.equal(wrong.isError,true);
 assert.equal(wrong.value.code,"CAS_PRECONDITION_MISMATCH");
 assert.equal(readFileSync(target,"utf8"),"MCP_BASE");
 const attach=spawnSync("/usr/bin/xattr",["-w","com.example.chatagent.mcp","MCP_META",target],
  {encoding:"utf8",timeout:5000});
 assert.equal(attach.status,0,attach.stderr);
 const changed=await call("local_replace_file",{path:target,content:"MCP_UPDATED",
  expectedSha256:made.value.sha256});
 assert.equal(changed.isError,false);
 assert.equal(changed.value.commitMode,"DIRFD_DUAL_EXLOCK_RENAME_SWAP");
 assert.equal(readFileSync(target,"utf8"),"MCP_UPDATED");
 const retained=spawnSync("/usr/bin/xattr",["-p","com.example.chatagent.mcp",target],
  {encoding:"utf8",timeout:5000});
 assert.equal(retained.status,0,retained.stderr);
 assert.equal(retained.stdout.trim(),"MCP_META");
 const inheritedDir=join(work,"mcp-inherited-acl");
 mkdirSync(inheritedDir,{mode:0o700});
 const inherit=spawnSync("/bin/chmod",["+a","everyone allow read,write,file_inherit,directory_inherit",inheritedDir],
  {encoding:"utf8",timeout:5000});
 assert.equal(inherit.status,0,inherit.stderr);
 const inheritedTarget=join(inheritedDir,"target.txt");
 writeFileSync(inheritedTarget,"MCP_ACL_BASE",{mode:0o600,flag:"wx"});
 const strip=spawnSync("/bin/chmod",["-N",inheritedTarget],{encoding:"utf8",timeout:5000});
 assert.equal(strip.status,0,strip.stderr);
 const inherited=await call("local_replace_file",{path:inheritedTarget,content:"MCP_ACL_NEW",
  expectedSha256:sha("MCP_ACL_BASE")});
 assert.equal(inherited.isError,true);
 assert.equal(inherited.value.code,"CAS_METADATA_UNSUPPORTED");
 assert.equal(readFileSync(inheritedTarget,"utf8"),"MCP_ACL_BASE");
 assert.equal(readdirSync(inheritedDir).some(x=>x.startsWith(".personal-cas-")),false);
 console.log("PASS MCP inherited-stage ACL is refused without replacement or stage debris");
 const collision=await call("local_create_file",{path:target,content:"NEVER"});
 assert.equal(collision.isError,true);
 assert.equal(readFileSync(target,"utf8"),"MCP_UPDATED");
 const read=await call("local_read",{path:target,offset:0,maxBytes:100});
 assert.equal(read.isError,false);assert.equal(read.value.content,"MCP_UPDATED");
 const largeBase="A".repeat(12288),largeChanged="B".repeat(12288);
 const largeTarget=join(work,"mcp-12k.txt");
 const lc=await call("local_create_file",{path:largeTarget,content:largeBase});
 assert.equal(lc.isError,false);
 const lr=await call("local_replace_file",{path:largeTarget,content:largeChanged,
  expectedSha256:sha(largeBase)});
 assert.equal(lr.isError,false);
 assert.equal(sha(readFileSync(largeTarget)),sha(largeChanged));
 console.log("PASS >8KiB MCP create and replace within bounded 256KiB content cap");
 console.log("PASS native CAS through actual MCP, mismatch refusal, create-only non-overwrite");
 console.log("PERSONAL_NATIVE_CAS_MCP_TEST=PASS");
}catch(e){console.error("PERSONAL_NATIVE_CAS_MCP_TEST=FAIL "+e.stack);process.exitCode=1;}
finally{
 if(l0)l0.kill("SIGTERM");
 if(l1)l1.kill("SIGTERM");
 await delay(350);
 rmSync(root,{recursive:true,force:true});
 console.log("isolated_fixture_cleanup=COMPLETE");
}
