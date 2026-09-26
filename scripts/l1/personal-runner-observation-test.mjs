// Diagnostic-only repeated start/read of test-owned processes.
// Does not disable sealed identity checks, replay an uncertain action,
// or touch live Business/P8/M16 processes.
import assert from "node:assert/strict";
import {mkdtempSync,realpathSync,mkdirSync,rmSync} from "node:fs";
import {join} from "node:path";
import {randomUUID} from "node:crypto";
import {setTimeout as delay} from "node:timers/promises";
import {L1Broker} from "./broker-core.mjs";
import {DurableHostProcesses} from "./durable-host-processes.mjs";
const root=realpathSync(mkdtempSync(join("/tmp","personal-runner-observe-")));
const state=join(root,"state"),cwd=join(root,"work");
mkdirSync(cwd,{mode:0o700});
const broker=new L1Broker(state,{initialize:true});
broker.pair("12345678");broker.setMode("FULL_HOST","12345678");
const runner=new DurableHostProcesses(broker);
const wait=async(fn)=>{
 for(let j=0;j<110;j++){
  const val=fn();if(val)return val;
  await delay(35);
 }
 throw Error("OBSERVATION_TIMEOUT");
};
const observations=[];
let complete=false;
try{
 for(let i=0;i<12;i++){
  const key=randomUUID();
  const args=["-e",'setTimeout(()=>{process.stdout.write("PERSONAL_OWNED_'+   i+'")},90)'];
  const started=await runner.start({
   executable:process.execPath,argv:args,cwd,timeoutMs:5000,idempotencyKey:key
  });
  const initial=started.state;
  const end=await wait(()=>{
   const s=runner.status({processId:started.processId});
   return ["EXITED","FAILED","TERMINATED"].includes(s.state)?s:null;
  });
  assert.equal(end.state,"EXITED");
  assert.equal(end.exitCode,0);
  const output=runner.read({processId:started.processId,cursor:0,maxBytes:1024});
  assert.match(output.content,new RegExp("PERSONAL_OWNED_"+i));
  const duplicate=await runner.start({
   executable:process.execPath,argv:args,cwd,timeoutMs:5000,idempotencyKey:key
  });
  assert.equal(duplicate.processId,started.processId);
  observations.push(initial);
 }
 complete=true;
 console.log("PASS twelve test-owned short processes terminal/read/identity/no-replay");
 console.log("INITIAL_STATES="+JSON.stringify(Object.fromEntries(
  [...new Set(observations)].map(x=>[x,observations.filter(s=>s===x).length]))));
 console.log("PERSONAL_RUNNER_OBSERVATION=PASS");
}catch(e){
 console.error("PERSONAL_RUNNER_OBSERVATION=FAIL "+e.message);
 process.exitCode=1;
}finally{
 if(complete)rmSync(root,{recursive:true,force:true});
 console.log("isolated_fixture_cleanup="+(complete?"COMPLETE":"RETAINED_FOR_REVIEW"));
}
