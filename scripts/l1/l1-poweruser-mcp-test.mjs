import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes,randomUUID,createHash } from "node:crypto";
import { spawn } from "node:child_process";
import http from "node:http";
import { L1Broker } from "./broker-core.mjs";

const root=mkdtempSync(join(tmpdir(),"chatagent-poweruser-mcp-"));
const state=join(root,"owner"),work=join(root,"work"),key=join(root,"agent.key"),mcpKey=join(root,"mcp.key");
mkdirSync(work,{mode:0o700});
const pass="12345678",agentToken=randomBytes(32).toString("base64url"),mcpToken=randomBytes(32).toString("base64url");
let brokerProc=null,mcpProc=null;
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function ready(child,port){
 for(let i=0;i<65;i++){
  if(child.exitCode!==null)throw Error("PROCESS_EXIT");
  try{if((await fetch("http://127.0.0.1:"+port+"/health")).ok)return;}catch{}
  await pause(100);
 }
 throw Error("START_TIMEOUT");
}
async function request(port,method,params={},token=mcpToken){
 const response=await fetch("http://127.0.0.1:"+port+"/mcp",{
  method:"POST",headers:{"content-type":"application/json","accept":"application/json, text/event-stream",
   "x-chatagent-l0-credential":token},
  body:JSON.stringify({jsonrpc:"2.0",id:randomUUID(),method,params})});
 const value=await response.json();
 assert.equal(response.status,200);if(value.error)throw Error(value.error.message);
 return value.result;
}
async function owner(route,body={}){
 const raw=JSON.stringify(body);
 return new Promise((resolve,reject)=>{
  const req=http.request({socketPath:join(state,"owner.sock"),path:"/owner/"+route,method:"POST",
   headers:{"content-type":"application/json","content-length":Buffer.byteLength(raw)}},res=>{
    let s="";res.on("data",x=>s+=x);res.on("end",()=>resolve({code:res.statusCode,body:JSON.parse(s)}));
   });req.on("error",reject);req.end(raw);
 });
}
try{
 const b=new L1Broker(state,{initialize:true});b.pair(pass);b.setMode("FULL_HOST",pass);
 writeFileSync(key,agentToken,{mode:0o600});writeFileSync(mcpKey,mcpToken,{mode:0o600});
 brokerProc=spawn(process.execPath,[fileURLToPath(new URL("./broker-server.mjs",import.meta.url))],{
  env:{...process.env,L1_STATE_DIR:state,L1_AGENT_KEY_FILE:key,L1_AGENT_PORT:"31522",
   L1_FILE_OPS_ENABLED:"1",L1_HOST_EXEC_ENABLED:"1"},stdio:"ignore"});
 await ready(brokerProc,31522);
 mcpProc=spawn(process.execPath,[fileURLToPath(new URL("../l0-ui-probe.mjs",import.meta.url))],{
  env:{...process.env,L0_AUTH_FILE:mcpKey,L0_PORT:"31523",
   L1_AGENT_KEY_FILE:key,L1_BROKER_URL:"http://127.0.0.1:31522",L1_POWERUSER_TOOLS:"1"},stdio:"ignore"});
 await ready(mcpProc,31523);
 const tools=(await request(31523,"tools/list")).tools.map(x=>x.name);
 assert.equal(tools.length,15);
 for(const name of ["local_list","local_read","local_write","local_copy","local_exec_start","local_process_read","local_process_stop"])
  assert.ok(tools.includes(name));
 console.log("PASS power-user MCP 15 tools discovered in isolated canary");
 async function call(name,args){
  const result=await request(31523,"tools/call",{name,arguments:args});
  return {value:result.structuredContent,isError:result.isError===true};
 }
 const status=await call("local_access_status",{});
 assert.equal(status.value.realFilesystemAccess,true);assert.equal(status.value.realHostExec,true);
 const f=join(work,"mcp.txt"),g=join(work,"copy.txt");
 const wr=await call("local_write",{path:f,content:"MCP host",mode:"create",expectedSha256:null});
 assert.equal(wr.value.changed,true);
 const rd=await call("local_read",{path:f,offset:0,maxBytes:32});
 assert.equal(rd.value.content,"MCP host");
 const h=await call("local_hash",{path:f});
 assert.equal(h.value.sha256,createHash("sha256").update("MCP host").digest("hex"));
 const copied=await call("local_copy",{source:f,destination:g,expectedSourceSha256:h.value.sha256,expectedDestinationSha256:null});
 assert.equal(copied.value.changed,true);
 assert.equal((await call("local_list",{path:work})).value.total,2);
 console.log("PASS actual host file list/read/create/hash/copy through MCP (temporary folder only)");
 const x=await call("local_exec_start",{executable:process.execPath,
  argv:["-e","process.stdout.write('mcp-exec-pass')"],cwd:work,timeoutMs:10000,idempotencyKey:randomUUID()});
 assert.ok(x.value.processId);
 let ended=false;
 for(let i=0;i<50;i++){
  const p=(await call("local_process_status",{processId:x.value.processId})).value;
  if(p.state!=="RUNNING"){ended=true;assert.equal(p.state,"EXITED");break;}await pause(100);
 }
 assert.ok(ended);
 const output=await call("local_process_read",{processId:x.value.processId,cursor:0,maxBytes:1000});
 assert.match(output.value.content,/mcp-exec-pass/);
 console.log("PASS owner-delegated process start/status/output through MCP without repeated password");
 assert.equal((await owner("mode",{mode:"ASK"})).code,200);
 const denied=await call("local_read",{path:f,offset:0,maxBytes:100});
 assert.equal(denied.isError,true);assert.equal(denied.value.code,"ACCESS_REQUIRED");
 assert.equal((await owner("mode",{mode:"FULL_HOST"})).code,403);
 console.log("PASS owner-controlled revocation blocks MCP; re-enable requires password");
 console.log("POWERUSER_MCP_TEST=PASS");
}catch(error){console.error("POWERUSER_MCP_TEST=FAIL "+error.stack);process.exitCode=1;}
finally{
 for(const p of [mcpProc,brokerProc])if(p)p.kill("SIGTERM");
 await pause(400);
 rmSync(root,{recursive:true,force:true});
}
