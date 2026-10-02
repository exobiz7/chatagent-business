import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
import {mkdtempSync,mkdirSync,realpathSync,writeFileSync,readFileSync,rmSync,existsSync,chmodSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {createHash,randomUUID} from "node:crypto";
import {setTimeout as delay} from "node:timers/promises";
import {L1Broker} from "./broker-core.mjs";
import {HostFileOps} from "./host-file-ops.mjs";
import {AsyncCopyJobs} from "./async-copy-jobs.mjs";
const sha=v=>createHash("sha256").update(v).digest("hex");
const root=realpathSync(mkdtempSync(join(tmpdir(),"personal-end-to-end-kill-")));
const state=join(root,"owner"),work=join(root,"work");
mkdirSync(work,{mode:0o700});
const helper=join(root,"copy-held");
const cc=spawnSync("/usr/bin/clang",["-std=c11","-D_DARWIN_C_SOURCE",
 "-Wno-deprecated-declarations","-Wall","-Wextra","-Werror","-O2",
 "-DPERSONAL_TEST_STAGE_HOLD_MS=3000",
 fileURLToPath(new URL("./native-copy-create.c",import.meta.url)),"-o",helper],
 {encoding:"utf8",timeout:10000});
assert.equal(cc.status,0,cc.stderr);chmodSync(helper,0o700);
const source=join(work,"source.bin"),destination=join(work,"destination.bin");
const data=Buffer.alloc(16*1024*1024,0x68),expected=sha(data);
writeFileSync(source,data,{mode:0o600,flag:"wx"});
const pass="12345678",broker=new L1Broker(state,{initialize:true});
broker.pair(pass);broker.setMode("FULL_HOST",pass);
const jobs=new AsyncCopyJobs(broker,new HostFileOps(broker,{privateRoot:state,strictMutations:true}),
 {binary:helper,binarySha:sha(readFileSync(helper))});
const wait=async(fn,tries=120)=>{
 for(let i=0;i<tries;i++){const v=await fn();if(v)return v;await delay(50);}
 throw Error("KILL_TEST_TIMEOUT");
};
let isolatedPid=null;
try{
 const key=randomUUID();
 const task=await jobs.start({source,destination,expectedSourceSha256:expected,idempotencyKey:key});
 const rec=broker.state.copyJobs.find(x=>x.key===key);
 assert.equal(rec.processId,task.processId);
 const stage=join(work,".personal-copy-"+rec.stageId+".stage");
 await wait(()=>jobs.read({processId:task.processId,cursor:0,maxBytes:1024})
   .content.includes("COPY_STAGE_READY id="+rec.stageId));
 const list=spawnSync("/bin/ps",["-axo","pid=,uid=,command="],{encoding:"utf8",timeout:1500});
 assert.equal(list.status,0);
 const matches=list.stdout.split("\n").map(x=>x.trim()).filter(x=>{
  const m=x.match(/^\d+\s+\d+\s+(\S+)\s/);
  return m?.[1]===helper&&x.includes(source)&&x.includes(destination)&&x.includes(rec.stageId);
 });
 assert.equal(matches.length,1,"helper must be uniquely test-owned");
 const match=matches[0].match(/^(\d+)\s+(\d+)\s+/);
 assert.ok(match);assert.equal(Number(match[2]),process.getuid());
 isolatedPid=Number(match[1]);
 process.kill(isolatedPid,"SIGKILL"); // only uniquely identified test fixture helper
 await wait(()=>jobs.status({processId:task.processId}).state==="FAILED");
 const reopened=new L1Broker(state);
 const restored=new AsyncCopyJobs(reopened,new HostFileOps(reopened,{privateRoot:state,strictMutations:true}),
  {binary:helper,binarySha:sha(readFileSync(helper))});
 assert.equal(existsSync(destination),false);
 const found=await restored.inspectStage({processId:task.processId});
 assert.equal(found.stageId,rec.stageId);assert.equal(found.state,"ORPHAN_STAGE_REVIEW");
 assert.ok(found.stageBytes<=data.length);
 const denied=restored.cleanupStage({processId:task.processId,
  expectedStageSha256:sha("incorrect"),expectedDev:found.stageDev,expectedIno:found.stageIno});
 await assert.rejects(()=>denied,/COPY_STAGE_PRECONDITION_MISMATCH/);
 const cleaned=await restored.cleanupStage({processId:task.processId,
  expectedStageSha256:found.stageSha256,expectedDev:found.stageDev,expectedIno:found.stageIno});
 assert.equal(cleaned.changed,true);assert.equal(existsSync(stage),false);
 assert.equal(sha(readFileSync(source)),expected);
 assert.equal((await restored.cleanupStage({processId:task.processId,
  expectedStageSha256:found.stageSha256,expectedDev:found.stageDev,expectedIno:found.stageIno})).changed,false);
 console.log("PASS owned native copy SIGKILL -> durable FAILED -> sealed UUID stage inspection");
 console.log("PASS independent owner reopen, wrong hash refusal and exact dev/ino/SHA cleanup");
 console.log("PERSONAL_COPY_E2E_KILL_RECOVERY=PASS");
}catch(e){
 console.error("PERSONAL_COPY_E2E_KILL_RECOVERY=FAIL "+e.stack);process.exitCode=1;
}finally{
 if(isolatedPid)try{process.kill(isolatedPid,0);console.error("TEST_HELPER_STILL_RUNNING_REVIEW_REQUIRED");}
 catch{}
 // The unique mkdtemp fixture has no user data; only this test owns its contents.
 await delay(250);
 rmSync(root,{recursive:true,force:true});
 console.log("isolated_fixture_cleanup=COMPLETE");
}
