import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes, randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import http from "node:http";
import { execFileSync } from "node:child_process";
import { L1Broker } from "./broker-core.mjs";
import { HostProcesses } from "./host-processes.mjs";

const root=mkdtempSync(join(tmpdir(),"chatagent-process-"));
const state=join(root,"state"),cwd=join(root,"work"),tokenfile=join(root,"agent.key");
mkdirSync(cwd,{mode:0o700});
const pass="12345678";
const broker=new L1Broker(state,{initialize:true});
let child=null;
const pause=ms=>new Promise(r=>setTimeout(r,ms));
const passLog=s=>console.log("PASS "+s);
async function until(fn,attempts=70){
 for(let i=0;i<attempts;i++){const result=await fn();if(result)return result;await pause(80);}
 throw Error("WAIT_TIMEOUT");
}
try{
 broker.pair(pass);
 const p=new HostProcesses(broker);
 const input={executable:process.execPath,argv:["-e","process.stdout.write('power-user')"],
   cwd,timeoutMs:12000,idempotencyKey:randomUUID()};
 await assert.rejects(()=>p.start(input),/ACCESS_REQUIRED/);
 broker.setMode("FULL_HOST",pass);
 const first=await p.start(input),second=await p.start(input);
 assert.equal(first.processId,second.processId);
 const ended=await until(()=>p.status({processId:first.processId}).state!=="RUNNING");
 assert.equal(p.status({processId:first.processId}).state,"EXITED");
 assert.match(p.read({processId:first.processId}).content,/power-user/);
 await assert.rejects(()=>p.start({...input,argv:["-e","console.log('different')"]}),/IDEMPOTENCY_KEY_CONFLICT/);
 const reopened=new L1Broker(state);
 await assert.rejects(()=>new HostProcesses(reopened).start(input),/ACTION_RECONCILIATION_REQUIRED/);
 passLog("sealed idempotency key prevents effect replay after broker restart");
 passLog("Full Host owned process, bounded output, per-service idempotency");
 const live=await p.start({executable:process.execPath,argv:["-e","setInterval(()=>{}, 1000)"],
  cwd,timeoutMs:15000,idempotencyKey:randomUUID()});
 assert.equal(p.stop({processId:live.processId}).state,"TERMINATION_PENDING");
 await until(()=>p.status({processId:live.processId}).state!=="TERMINATION_PENDING");
 assert.equal(p.status({processId:live.processId}).state,"TERMINATED");
 assert.throws(()=>p.stop({processId:randomUUID()}),/PROCESS_NOT_OWNED/);
 // Spawn a descendant within an owned process group. Revoke must signal the
 // entire owned group, not just the direct child. No unrelated PIDs are used.
 let descendantPid=null,treeId=null;
 try{
  const tree=await p.start({executable:process.execPath,
   argv:["-e", "const c=require('node:child_process').spawn(process.execPath,['-e','setInterval(()=>{},500)'],{stdio:'ignore'});process.stdout.write('PID:'+String(c.pid));setInterval(()=>{},500)"],
   cwd,timeoutMs:12000,idempotencyKey:randomUUID()});
  treeId=tree.processId;
  await until(()=>{
   const result=p.read({processId:treeId});
   if(result.content.includes("[stderr]"))throw Error("DESCENDANT_LAUNCH_FAILED "+result.content.slice(0,200));
   return result.content.match(/PID:([0-9]+)/);
  });
  descendantPid=Number(p.read({processId:tree.processId}).content.match(/PID:([0-9]+)/)[1]);
  assert.ok(Number.isInteger(descendantPid)&&descendantPid>0);
  p.stop({processId:tree.processId});
  await until(()=>p.status({processId:tree.processId}).state==="TERMINATED");
  await until(()=>{
   try{const st=execFileSync("/bin/ps",["-o","stat=","-p",String(descendantPid)],{encoding:"utf8"}).trim();return !st||st.startsWith("Z");}
   catch{return true;}
  });
  passLog("owned process group terminates direct child and descendant");
 }finally{
  if(treeId){try{p.stop({processId:treeId});}catch{}}
  if(descendantPid){try{process.kill(descendantPid,"SIGKILL");}catch{}}
 }
 passLog("terminate owned process only");
 broker.setMode("ASK",pass);
 await assert.rejects(()=>p.start({...input,idempotencyKey:randomUUID()}),/ACCESS_REQUIRED/);
 passLog("revoke to ASK prevents new host processes");
 broker.setMode("FULL_HOST",pass);
 const token=randomBytes(32).toString("base64url");
 writeFileSync(tokenfile,token,{mode:0o600});
 const port=31521;
 child=spawn(process.execPath,[fileURLToPath(new URL("./broker-server.mjs",import.meta.url))],{
  env:{...process.env,L1_STATE_DIR:state,L1_AGENT_KEY_FILE:tokenfile,
   L1_AGENT_PORT:String(port),L1_HOST_EXEC_ENABLED:"1"},
  stdio:["ignore","pipe","pipe"]
 });
 let ready=false,error="";
 child.stdout.on("data",x=>{if(String(x).includes("L1_BROKER_READY"))ready=true;});
 child.stderr.on("data",x=>error+=String(x).slice(0,300));
 await until(()=>{if(child.exitCode!==null)throw Error("BROKER_EARLY_EXIT "+error);return ready;});
 async function rpc(route,body={},auth=token){
  const response=await fetch("http://127.0.0.1:"+port+route,{method:"POST",
   headers:{"content-type":"application/json","x-chatagent-l1-credential":auth},body:JSON.stringify(body)});
  return {code:response.status,body:await response.json()};
 }
 const st=await rpc("/agent/status");
 assert.equal(st.body.realHostExec,true);
 assert.equal(st.body.realFilesystemAccess,false);
 const key=randomUUID();
 const started=await rpc("/agent/process/start",{executable:process.execPath,
  argv:["-e","process.stdout.write('via-broker')"],cwd,timeoutMs:12000,idempotencyKey:key});
 assert.equal(started.code,200);
 const pid=started.body.processId;
 await until(async()=>{const r=await rpc("/agent/process/status",{processId:pid});return r.body.state!=="RUNNING";});
 const result=await rpc("/agent/process/read",{processId:pid,cursor:0,maxBytes:256});
 assert.match(result.body.content,/via-broker/);
 assert.equal((await rpc("/agent/process/status",{processId:pid},"wrong")).code,401);
 const inFlight=await rpc("/agent/process/start",{executable:process.execPath,
  argv:["-e","setInterval(()=>{}, 1000)"],cwd,timeoutMs:30000,idempotencyKey:randomUUID()});
 assert.equal(inFlight.code,200);
 async function owner(route,body={}){
  const raw=JSON.stringify(body);
  return await new Promise((resolve,reject)=>{
   const req=http.request({socketPath:join(state,"owner.sock"),path:"/owner/"+route,method:"POST",
    headers:{"content-type":"application/json","content-length":Buffer.byteLength(raw)}},res=>{
      let data="";res.on("data",x=>data+=x);res.on("end",()=>resolve({code:res.statusCode,body:JSON.parse(data)}));
     });req.on("error",reject);req.end(raw);
  });
 }
 assert.equal((await owner("mode",{mode:"ASK"})).code,200);
 await until(async()=>{
  const r=await rpc("/agent/process/status",{processId:inFlight.body.processId});
  return r.body.state==="TERMINATED";
 });
 assert.equal((await rpc("/agent/process/start",{executable:process.execPath,
  argv:["-e","process.exit(0)"],cwd,timeoutMs:10000,idempotencyKey:randomUUID()})).code,400);
 assert.equal((await owner("mode",{mode:"FULL_HOST"})).code,403);
 passLog("local owner downgrade terminates owned process and blocks new execution");
 passLog("separate loopback process route + agent authentication");
 console.log("POWERUSER_L1_PROCESS_TEST=PASS");
}catch(error){console.error("POWERUSER_L1_PROCESS_TEST=FAIL "+error.stack);process.exitCode=1;}
finally{
 if(child)child.kill("SIGTERM");
 await pause(200);
 rmSync(root,{recursive:true,force:true});
}
