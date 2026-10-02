import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import {spawn,execFileSync} from "node:child_process";
import {mkdtempSync,mkdirSync,rmSync,readFileSync,existsSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {randomUUID} from "node:crypto";
import {setTimeout as sleep} from "node:timers/promises";
import {L1Broker} from "./broker-core.mjs";
import {DurableHostProcesses} from "./durable-host-processes.mjs";

const root=mkdtempSync(join(tmpdir(),"chatagent-l6-durable-"));
const cwd=join(root,"work"),state=join(root,"owner");
mkdirSync(cwd,{mode:0o700});
const pass="12345678";
const created=new L1Broker(state,{initialize:true});
created.pair(pass);
created.setMode("FULL_HOST",pass);
let testWorker=null;
const owned=[];
async function wait(fn,tries=100,step=90){
 for(let i=0;i<tries;i++){const x=await fn();if(x)return x;await sleep(step);}
 throw Error("DURABLE_WAIT_TIMEOUT");
}
const trace=s=>console.log("PASS "+s);
try{
 const key=randomUUID();
 testWorker=spawn(process.execPath,[fileURLToPath(new URL("./l6-durable-worker.mjs",import.meta.url)),state,cwd,key],
   {stdio:["ignore","pipe","pipe"]});
 let data="",errors="";
 testWorker.stdout.on("data",x=>data+=String(x));
 testWorker.stderr.on("data",x=>errors+=String(x));
 const match=await wait(()=>{
  if(testWorker.exitCode!==null)throw Error("WORKER_EARLY_EXIT "+errors);
  const m=data.match(/\{"processId":"([^"]+)","state":"([^"]+)"\}/);
  return m;
 });
 const id=match[1];owned.push(id);
 const before=readFileSync(join(state,"jobs",id,"manifest.json"),"utf8");
 const original=JSON.parse(before);
 assert.equal(original.state,"RUNNING");
 assert.ok(original.runnerPid>0);
 // Only kill the disposable worker; its detached supervisor must survive.
 testWorker.kill("SIGKILL");
 await wait(()=>testWorker.exitCode!==null||testWorker.signalCode==="SIGKILL");
 testWorker=null;
 const reopened=new L1Broker(state);
 const restored=new DurableHostProcesses(reopened);
 const current=restored.status({processId:id});
 assert.ok(["RUNNING","EXITED"].includes(current.state));
 trace("physical SIGKILL of test-only broker client preserves owned process identity");
 await wait(()=>restored.read({processId:id,cursor:0,maxBytes:4096}).content.includes("L6_DURABLE_2"));
 assert.equal(restored.status({processId:id}).state,"RUNNING");
 trace("live output available before job completion after manager crash");
 const progress=restored.read({processId:id,cursor:0,maxBytes:12});
 assert.ok(progress.cursor>0);
 await wait(()=>restored.status({processId:id}).state==="EXITED");
 const output=restored.read({processId:id,cursor:0,maxBytes:4096});
 assert.equal(output.exitCode,0);
 assert.match(output.content,/L6_DURABLE_8/);
 assert.equal(output.hasMore,false);
 assert.equal(reopened.state.actions.find(x=>x.key===key).stage,"EXITED");
 trace("post-restart output cursor, terminal EXITED, sealed action completion");
 const repeated=await restored.start({
  executable:process.execPath,cwd,timeoutMs:12000,idempotencyKey:key,
  argv:["-e","let n=0;const t=setInterval(()=>{process.stdout.write('L6_DURABLE_'+(++n)+'\\n');if(n===8){clearInterval(t);process.exit(0);}},320)"]
 });
 assert.equal(repeated.processId,id);
 await assert.rejects(()=>restored.start({
  executable:process.execPath,cwd,timeoutMs:12000,idempotencyKey:key,
  argv:["-e","process.stdout.write('DIFFERENT')"]
 }),/IDEMPOTENCY_KEY_CONFLICT/);
 trace("duplicate key resolves prior job, never re-executes");

 const stopKey=randomUUID();
 const toStop=await restored.start({
  executable:process.execPath,cwd,timeoutMs:12000,idempotencyKey:stopKey,
  argv:["-e","setInterval(()=>{},500)"]
 });
 owned.push(toStop.processId);
 await wait(()=>restored.status({processId:toStop.processId}).state==="RUNNING");
 assert.equal(restored.stop({processId:toStop.processId}).state,"TERMINATION_PENDING");
 await wait(()=>restored.status({processId:toStop.processId}).state==="TERMINATED");
 assert.throws(()=>restored.stop({processId:randomUUID()}),/PROCESS_NOT_OWNED/);
 trace("owned runner termination, unowned process denied");
 // A runner owns its whole POSIX group; stop must include its descendants.
 const treeKey=randomUUID();
 const tree=await restored.start({executable:process.execPath,cwd,timeoutMs:12000,idempotencyKey:treeKey,
  argv:["-e","const p=require('node:child_process').spawn(process.execPath,['-e','setInterval(()=>{},500)'],{stdio:'ignore'});process.stdout.write('DESC:'+p.pid);setInterval(()=>{},500)"]});
 owned.push(tree.processId);
 await wait(()=>restored.read({processId:tree.processId,cursor:0,maxBytes:256}).content.includes("DESC:"));
 const treeOutput=restored.read({processId:tree.processId,cursor:0,maxBytes:256});
 const descendantPid=Number(treeOutput.content.match(/DESC:(\d+)/)?.[1]);
 assert.ok(Number.isInteger(descendantPid)&&descendantPid>0);
 assert.equal(restored.stop({processId:tree.processId}).state,"TERMINATION_PENDING");
 await wait(()=>restored.status({processId:tree.processId}).state==="TERMINATED");
 await wait(()=>{
  try{const x=execFileSync("/bin/ps",["-o","stat=","-p",String(descendantPid)],{encoding:"utf8"}).trim();
   return !x||x.startsWith("Z");}catch{return true;}
 });
 trace("durable supervisor stop terminates owned descendant without unrelated PID target");

 // Killing a test-owned supervisor (not the production broker) must fail closed.
 const unknownKey=randomUUID();
 const unknownArgs={executable:process.execPath,cwd,timeoutMs:5000,idempotencyKey:unknownKey,
  argv:["-e","setTimeout(()=>process.exit(0),800)"]};
 const unknown=await restored.start(unknownArgs);
 owned.push(unknown.processId);
 await wait(()=>restored.status({processId:unknown.processId}).state==="RUNNING");
 const ownerRecord=reopened.state.actions.find(x=>x.key===unknownKey);
 assert.ok(restored.runnerVerified(ownerRecord));
 process.kill(ownerRecord.runnerPid,"SIGKILL"); // exact test-owned supervisor only
 await wait(()=>restored.status({processId:unknown.processId}).state==="RECOVERY_REQUIRED");
 assert.equal((await restored.start(unknownArgs)).state,"RECOVERY_REQUIRED");
 assert.equal(reopened.state.actions.find(x=>x.key===unknownKey).stage,"ISSUED");
 await sleep(950); // test-owned short child exits independently, no orphan workload
 trace("supervisor loss becomes RECOVERY_REQUIRED, no false completion or automatic replay");
 reopened.setMode("ASK",pass);
 await assert.rejects(()=>restored.start({
  executable:process.execPath,cwd,timeoutMs:12000,idempotencyKey:randomUUID(),
  argv:["-e","process.exit(0)"]
 }),/ACCESS_REQUIRED/);
 trace("owner mode downgrade denies fresh jobs");
 console.log("L6_DURABLE_PHYSICAL_TEST=PASS");
}catch(error){
 console.error("L6_DURABLE_PHYSICAL_TEST=FAIL "+error.stack);
 process.exitCode=1;
}finally{
 if(testWorker)try{testWorker.kill("SIGKILL");}catch{}
 try{
  const b=new L1Broker(state),p=new DurableHostProcesses(b);
  for(const id of owned){
   try{p.stop({processId:id});}catch{}
  }
 }catch{}
 await sleep(400);
 if(existsSync(root))rmSync(root,{recursive:true,force:true});
 console.log("isolated_fixture_cleanup=COMPLETE");
}
