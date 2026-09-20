import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import {mkdtempSync,mkdirSync,writeFileSync,rmSync,existsSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {randomUUID,randomBytes,createHash} from "node:crypto";
import {setTimeout as sleep} from "node:timers/promises";
import {L1Broker} from "./broker-core.mjs";
import {DurableHostProcesses} from "./durable-host-processes.mjs";
const hash=x=>createHash("sha256").update(JSON.stringify(x)).digest("hex");
const root=mkdtempSync(join(tmpdir(),"chatagent-l6-launch-window-"));
const state=join(root,"owner"),work=join(root,"work");
mkdirSync(work,{mode:0o700});
const b=new L1Broker(state,{initialize:true});
b.pair("12345678");b.setMode("FULL_HOST","12345678");
const p=new DurableHostProcesses(b);
const key=randomUUID(),id=randomUUID(),nonce=randomBytes(32).toString("hex");
const input={executable:process.execPath,argv:["-e",
 "let i=0;const t=setInterval(()=>{process.stdout.write('WINDOW_'+(++i)+'\\n');if(i===10){clearInterval(t);process.exit(0)}},270)"],cwd:work,timeoutMs:10000};
const supplied={...input,idempotencyKey:key};
let runner=null;
const wait=async(fn,n=100)=>{
 for(let i=0;i<n;i++){const v=await fn();if(v)return v;await sleep(60);}
 throw Error("LAUNCH_WINDOW_TIMEOUT");
};
try {
 b.reserveAction(key,hash(input),{processId:id,nonceDigest:hash(nonce)});
 const before=new DurableHostProcesses(new L1Broker(state));
 const unstarted=await before.start(supplied);
 assert.equal(unstarted.state,"RECOVERY_REQUIRED");
 assert.equal(unstarted.processId,id);
 assert.equal(before.running(),1);
 console.log("PASS prelaunch crash preserves sealed ID and denies replay, reserves capacity");

 const dir=join(state,"jobs",id);
 mkdirSync(dir,{mode:0o700});
 writeFileSync(join(dir,"config.json"),JSON.stringify({...input,processId:id,nonce})+"\n",{mode:0o600,flag:"wx"});
 runner=spawn(process.execPath,[new URL("./durable-process-runner.mjs",import.meta.url).pathname,dir],{
  detached:true,stdio:"ignore",cwd:work
 });
 runner.on("error",()=>{});
 runner.unref();
 const after=new DurableHostProcesses(new L1Broker(state));
 await wait(()=>{
  try{return after.status({processId:id}).state==="RUNNING";}
  catch(e){if(e.message==="RECOVERY_REQUIRED")return false;throw e;}
 });
 const entry=after.broker.state.actions.find(x=>x.key===key);
 assert.equal(entry.processId,id);
 assert.equal(entry.runnerPid,runner.pid);
 assert.ok(entry.runnerStartToken);
 console.log("PASS late sealed PID bind after simulated postspawn client death");
 const again=await after.start(supplied);
 assert.equal(again.processId,id);
 assert.equal(again.state,"RUNNING");
 await wait(()=>after.status({processId:id}).state==="EXITED");
 const out=after.read({processId:id,cursor:0,maxBytes:1024});
 assert.equal(out.exitCode,0);
 assert.match(out.content,/WINDOW_10/);
 console.log("PASS late-adopted task stdout/terminal and exactly one execution");
 console.log("L6_LAUNCH_WINDOW=PASS");
}catch(e){
 console.error("L6_LAUNCH_WINDOW=FAIL "+e.stack);
 process.exitCode=1;
}finally{
 if(runner){
  try{const latest=new DurableHostProcesses(new L1Broker(state));latest.stop({processId:id});}catch{}
 }
 await sleep(300);
 if(existsSync(root))rmSync(root,{recursive:true,force:true});
 console.log("isolated_fixture_cleanup=COMPLETE");
}
