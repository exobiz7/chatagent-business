import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import {mkdtempSync,mkdirSync,writeFileSync,rmSync,existsSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {randomUUID,randomBytes} from "node:crypto";
import net from "node:net";
import {setTimeout as delay} from "node:timers/promises";
import {L1Broker} from "./broker-core.mjs";

const root=mkdtempSync(join(tmpdir(),"chatagent-l6-api-"));
const state=join(root,"owner"),work=join(root,"work"),tokenFile=join(root,"agent.key");
mkdirSync(work,{mode:0o700});
const b=new L1Broker(state,{initialize:true});b.pair("12345678");b.setMode("FULL_HOST","12345678");
const token=randomBytes(32).toString("base64url");
writeFileSync(tokenFile,token,{mode:0o600});
const port=await new Promise((resolve,reject)=>{
 const s=net.createServer();s.once("error",reject);s.listen(0,"127.0.0.1",()=>{
 const n=s.address().port;s.close(()=>resolve(n));
 });
});
const url="http://127.0.0.1:"+port;
let server=null,stderr="",stdout="",brokerPid=null;
const pause=ms=>delay(ms);
const wait=async(fn,n=100)=>{
 for(let i=0;i<n;i++){const v=await fn();if(v)return v;await pause(75);}
 throw Error("DURABLE_API_WAIT_TIMEOUT");
};
async function boot(){
 stderr="";stdout="";brokerPid=null;
 server=spawn(process.execPath,[fileURLToPath(new URL("./durable-broker-launch.mjs",import.meta.url))],{
  env:{...process.env,L1_STATE_DIR:state,L1_AGENT_KEY_FILE:tokenFile,
   L1_AGENT_PORT:String(port),L1_HOST_EXEC_ENABLED:"1",L1_FILE_OPS_ENABLED:"0",
   L1_DURABLE_PROCESS_ENABLED:"1"},stdio:["ignore","pipe","pipe"]
 });
 server.stderr.on("data",x=>stderr+=String(x).slice(0,500));
 server.stdout.on("data",x=>{
  stdout+=String(x);
  const match=stdout.match(/"event":"L1_BROKER_READY","port":\d+,"pid":(\d+)/);
  if(match)brokerPid=Number(match[1]);
 });
 await wait(async()=>{
  if(server.exitCode!==null)throw Error("L1_EARLY_EXIT "+stderr);
  try{const r=await fetch(url+"/health",{signal:AbortSignal.timeout(350)});return r.status===200&&Number.isInteger(brokerPid);}
  catch{return false;}
 });
}
async function rpc(route,args={}){
 const r=await fetch(url+"/agent/"+route,{method:"POST",
  headers:{"content-type":"application/json","x-chatagent-l1-credential":token},
  body:JSON.stringify(args),signal:AbortSignal.timeout(3000)});
 const data=await r.json();
 if(r.status!==200)throw Error("HTTP_"+r.status+" "+JSON.stringify(data));
 return data;
}
async function killBroker(){
 if(!server)return;
 const old=server;
 const pid=brokerPid;
 assert.ok(Number.isInteger(pid));
 process.kill(pid,"SIGKILL"); // test L1 server only, never production
 await wait(()=>old.exitCode!==null);
 server=null;brokerPid=null;
 // Socket cleanup is now performed ONLY under the newly acquired lockf lease.
 assert.ok(existsSync(join(state,"owner.sock")));
}
try{
 await boot();
 // A simultaneous locked candidate must fail without disturbing the live socket.
 const contender=spawn(process.execPath,[fileURLToPath(new URL("./durable-broker-launch.mjs",import.meta.url))],{
  env:{...process.env,L1_STATE_DIR:state,L1_AGENT_KEY_FILE:tokenFile,
   L1_AGENT_PORT:String(port),L1_HOST_EXEC_ENABLED:"1",L1_FILE_OPS_ENABLED:"0",
   L1_DURABLE_PROCESS_ENABLED:"1"},stdio:"ignore"});
 await wait(()=>contender.exitCode!==null);
 assert.notEqual(contender.exitCode,0);
 assert.equal((await fetch(url+"/health")).status,200);
 console.log("PASS second locked broker refuses concurrent instance");
 const startKey=randomUUID();
 const input={executable:process.execPath,cwd:work,timeoutMs:15000,idempotencyKey:startKey,
  argv:["-e","let n=0;const t=setInterval(()=>{process.stdout.write('API_RESUME_'+(++n)+'\\n');if(n===12){clearInterval(t);process.exit(0);}},310)"]};
 const first=await rpc("process/start",input);
 assert.ok(first.processId);
 const id=first.processId;
 await wait(async()=>{const s=await rpc("process/status",{processId:id});return s.state==="RUNNING";});
 await wait(async()=>{
  const out=await rpc("process/read",{processId:id,cursor:0,maxBytes:1024});
  return out.content.includes("API_RESUME_2");
 });
 await killBroker();
 const b2=new L1Broker(state);
 assert.equal(b2.state.actions.find(x=>x.key===startKey)?.stage,"ISSUED");
 await boot();
 const after=await rpc("process/status",{processId:id});
 assert.ok(["RUNNING","EXITED"].includes(after.state));
 const output=await rpc("process/read",{processId:id,cursor:0,maxBytes:2048});
 assert.match(output.content,/API_RESUME_2/);
 console.log("PASS locked broker SIGKILL/restart auto-recovers verified stale owner socket and job");
 await wait(async()=>{
  const s=await rpc("process/status",{processId:id});
  return s.state==="EXITED";
 });
 const final=await rpc("process/read",{processId:id,cursor:0,maxBytes:4096});
 assert.match(final.content,/API_RESUME_12/);
 assert.equal(final.exitCode,0);
 const repeat=await rpc("process/start",input);
 assert.equal(repeat.processId,id);
 assert.equal(repeat.state,"EXITED");
 console.log("PASS resumed process terminal output and no duplicate effect");
 console.log("L6_LOCKED_STARTUP_RESTART=PASS");
}catch(e){
 console.error("L6_LOCKED_STARTUP_RESTART=FAIL "+e.stack);
 process.exitCode=1;
}finally{
 if(server){
  if(brokerPid){try{process.kill(brokerPid,"SIGTERM");}catch{}}
  await wait(()=>server.exitCode!==null,40).catch(()=>{});
  if(server.exitCode===null)server.kill("SIGTERM");
  await pause(300);
 }
 // All workload children in this fixture have 15s bounds; do not touch P8/M16.
 rmSync(root,{recursive:true,force:true});
 console.log("isolated_fixture_cleanup=COMPLETE");
}
