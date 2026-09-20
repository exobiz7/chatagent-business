import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { L1Broker } from "./broker-core.mjs";
import { HostProcesses } from "./host-processes.mjs";

const root=mkdtempSync(join(tmpdir(),"chatagent-l6-preflight-"));
const work=join(root,"work");
mkdirSync(work,{mode:0o700});
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const wait=async(fn,limit=80)=>{
 for(let i=0;i<limit;i++){const result=fn();if(result)return result;await sleep(60);}
 throw Error("ISOLATED_TEST_TIMEOUT");
};
const broker=new L1Broker(join(root,"owner"),{initialize:true});
broker.pair("12345678");
broker.setMode("FULL_HOST","12345678");
const jobs=new HostProcesses(broker);
let active=null;
try {
 const progressKey=randomUUID();
 const progress=await jobs.start({
  executable:process.execPath,cwd:work,timeoutMs:10000,idempotencyKey:progressKey,
  argv:["-e","let i=0;const t=setInterval(()=>{process.stdout.write('L6_PROGRESS_'+(++i)+'\\n');if(i===4)clearInterval(t)},280)"]
 });
 active=progress.processId;
 assert.equal(progress.state,"RUNNING");
 await wait(()=>jobs.read({processId:active,cursor:0,maxBytes:1000}).content.includes("L6_PROGRESS_1"));
 const fragment=jobs.read({processId:active,cursor:0,maxBytes:30});
 assert.ok(fragment.cursor>0);
 await wait(()=>jobs.status({processId:active}).state==="EXITED");
 const all=jobs.read({processId:active,cursor:0,maxBytes:1000});
 assert.match(all.content,/L6_PROGRESS_4/);
 assert.equal(all.exitCode,0);
 assert.equal(all.hasMore,false);
 console.log("PASS L6 isolated long job streaming, bounded cursor and EXITED");
 active=null;

 const riskyKey=randomUUID();
 const pending=await jobs.start({
  executable:process.execPath,cwd:work,timeoutMs:15000,idempotencyKey:riskyKey,
  argv:["-e","setInterval(()=>{},1000)"]
 });
 active=pending.processId;
 const afterRestart=new L1Broker(join(root,"owner"));
 const lostRegistry=new HostProcesses(afterRestart);
 assert.throws(()=>lostRegistry.status({processId:active}),/PROCESS_NOT_OWNED/);
 await assert.rejects(()=>lostRegistry.start({
  executable:process.execPath,cwd:work,timeoutMs:15000,idempotencyKey:riskyKey,
  argv:["-e","setInterval(()=>{},1000)"]
 }),/ACTION_RECONCILIATION_REQUIRED/);
 assert.equal(afterRestart.state.actions.find(x=>x.key===riskyKey)?.stage,"ISSUED");
 console.log("PASS L6 sealed retry fence after simulated in-memory registry loss");
 console.log("KNOWN_GAP crash restart cannot recover owned process or stdout");

 const stopping=jobs.stop({processId:active});
 assert.equal(stopping.state,"TERMINATION_PENDING");
 await wait(()=>jobs.status({processId:active}).state==="TERMINATED");
 active=null;
 console.log("PASS L6 explicit owned group termination");

 broker.setMode("ASK","12345678");
 await assert.rejects(()=>jobs.start({
  executable:process.execPath,cwd:work,timeoutMs:10000,idempotencyKey:randomUUID(),argv:["-e","process.exit(0)"]
 }),/ACCESS_REQUIRED/);
 console.log("PASS L6 owner revocation denies new executable");
 console.log("L6_RELIABILITY_PREFLIGHT=PASS_WITH_KNOWN_CRASH_RECOVERY_GAP");
}catch(error){
 console.error("L6_RELIABILITY_PREFLIGHT=FAIL "+error.stack);
 process.exitCode=1;
}finally{
 if(active){try{jobs.stop({processId:active});}catch{}await sleep(300);}
 rmSync(root,{recursive:true,force:true});
 console.log("isolated_fixture_cleanup=COMPLETE");
}
