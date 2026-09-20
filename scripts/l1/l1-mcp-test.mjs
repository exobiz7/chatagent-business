import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import http from "node:http";
import assert from "node:assert/strict";
import { L1Broker } from "./broker-core.mjs";

const home=mkdtempSync(join(tmpdir(),"chatagent-l1-mcp-"));
const dir=join(home,"state"), keyFile=join(home,"agent.key"), l0File=join(home,"l0.key");
const pass="test-owner-passphrase-2026";
let brokerProcess=null,l0Process=null;
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const agentKey=randomBytes(32).toString("base64url"),l0Key=randomBytes(32).toString("base64url");
async function post(port,path,payload,header={}){
 const res=await fetch("http://127.0.0.1:"+port+path,{
  method:"POST",headers:{"content-type":"application/json","accept":"application/json, text/event-stream",...header},body:JSON.stringify(payload)});
 return {status:res.status,body:await res.json()};
}
async function ownerCall(route,body){
 return await new Promise((resolve,reject)=>{
  const s=JSON.stringify(body);
  const req=http.request({socketPath:join(dir,"owner.sock"),path:route,method:"POST",
   headers:{"content-type":"application/json","content-length":Buffer.byteLength(s)}},res=>{
    let raw="";res.on("data",x=>raw+=x);res.on("end",()=>resolve({code:res.statusCode,body:JSON.parse(raw)}));
  });req.on("error",reject);req.end(s);
 });
}
async function start(script,env,port){
 let errors="";
 const child=spawn(process.execPath,[script],{env:{...process.env,...env},stdio:["ignore","pipe","pipe"]});
 child.stderr.on("data",x=>{errors+=String(x).slice(0,300);});
 for(let i=0;i<55;i++){
  if(child.exitCode!==null)throw Error("CHILD_EXIT "+errors);
  try{const r=await fetch("http://127.0.0.1:"+port+"/health");if(r.ok)return child;}catch{}
  await pause(100);
 }
 child.kill("SIGTERM");throw Error("BOOT_TIMEOUT "+errors);
}
try{
 const b=new L1Broker(dir,{initialize:true});b.pair(pass);
 writeFileSync(keyFile,agentKey,{mode:0o600});writeFileSync(l0File,l0Key,{mode:0o600});
 const brokerPort=31519,l0Port=31520;
 brokerProcess=await start(new URL("./broker-server.mjs",import.meta.url).pathname,{
  L1_STATE_DIR:dir,L1_AGENT_KEY_FILE:keyFile,L1_AGENT_PORT:String(brokerPort)},brokerPort);
 l0Process=await start(new URL("../l0-ui-probe.mjs",import.meta.url).pathname,{
  L0_AUTH_FILE:l0File,L0_PORT:String(l0Port),L1_AGENT_KEY_FILE:keyFile,
  L1_BROKER_URL:"http://127.0.0.1:"+brokerPort},l0Port);
 const headers={"x-chatagent-l0-credential":l0Key};
 let id=0;
 async function tool(name,args){
  const r=await post(l0Port,"/mcp",{jsonrpc:"2.0",id:++id,method:"tools/call",
   params:{name,arguments:args}},headers);
  assert.equal(r.status,200);assert.ok(!r.body.error);
  return r.body.result.structuredContent;
 }
 let a=await post(l0Port,"/mcp",{jsonrpc:"2.0",id:++id,method:"initialize",
  params:{protocolVersion:"2025-03-26",capabilities:{},clientInfo:{name:"l1-isolated-test",version:"1"}}},headers);
 assert.equal(a.status,200);
 a=await post(l0Port,"/mcp",{jsonrpc:"2.0",id:++id,method:"tools/list",params:{}},headers);
 assert.equal(a.body.result.tools.length,4);
 console.log("PASS L1 optional MCP adapter preserves existing four-tool schema");
 const state=await tool("local_access_status",{});
 assert.equal(state.paired,true);assert.equal(state.realFilesystemAccess,false);
 const input={path:"/tmp/l1-adapter-fixture",purpose:"test approval lifecycle",mode:"read"};
 const request=await tool("local_request_access",input);
 assert.equal(request.code,"PENDING_OWNER_APPROVAL");
 assert.equal(request.ownerApproval,"LOCAL_OWNER_CLI_REQUIRED");
 assert.equal(request.realGrant,false);
 const request2=await tool("local_request_access",input);
 assert.equal(request.requestId,request2.requestId);assert.equal(request2.duplicate,true);
 const pending=await tool("local_check_access",{requestId:request.requestId});
 assert.equal(pending.status,"PENDING_OWNER_APPROVAL");
 console.log("PASS Business-like MCP status/request/check and idempotence");
 const list=await ownerCall("/owner/pending",{passphrase:pass});
 const item=list.body.requests.find(x=>x.requestId===request.requestId);
 assert.ok(item);
 const approved=await ownerCall("/owner/approve",{passphrase:pass,requestId:item.requestId,digest:item.digest});
 assert.equal(approved.code,200);assert.equal(approved.body.realGrant,false);
 const checked=await tool("local_check_access",{requestId:item.requestId});
 assert.equal(checked.status,"APPROVED_RECORD_ONLY");
 assert.equal(checked.realGrant,false);
 const revoked=await ownerCall("/owner/revoke",{passphrase:pass,grantId:approved.body.grantId});
 assert.equal(revoked.code,200);
 const after=await tool("local_check_access",{requestId:item.requestId});
 assert.equal(after.recordValid,false);
 console.log("PASS MCP -> owner record approval -> MCP check -> owner revoke; no real grant");
 console.log("L1_MCP_INTEGRATION=PASS");
}catch(e){console.error("L1_MCP_INTEGRATION=FAIL "+e.stack);process.exitCode=1;}
finally{
 if(l0Process)l0Process.kill("SIGTERM");
 if(brokerProcess)brokerProcess.kill("SIGTERM");
 await pause(350);
 rmSync(home,{recursive:true,force:true});
}
