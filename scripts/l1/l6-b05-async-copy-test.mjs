import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
import {mkdtempSync,mkdirSync,realpathSync,readFileSync,writeFileSync,rmSync,existsSync,symlinkSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {randomUUID,createHash} from "node:crypto";
import {setTimeout as delay} from "node:timers/promises";
import {L1Broker} from "./broker-core.mjs";
import {HostFileOps} from "./host-file-ops.mjs";
import {AsyncCopyJobs} from "./async-copy-jobs.mjs";

const sha=x=>createHash("sha256").update(x).digest("hex");
const root=realpathSync(mkdtempSync(join(tmpdir(),"chatagent-b05-copy-")));
const state=join(root,"owner"),work=join(root,"work");mkdirSync(work,{mode:0o700});
const helper=join(root,"native-copy");
const cc=spawnSync("/usr/bin/clang",["-std=c11","-D_DARWIN_C_SOURCE","-Wno-deprecated-declarations",
 "-Wall","-Wextra","-Werror","-O2",new URL("./native-copy-create.c",import.meta.url).pathname,"-o",helper],
 {encoding:"utf8",timeout:10000});
if(cc.status!==0)throw Error("NATIVE_COPY_BUILD_FAILED "+cc.stderr);
const {chmodSync}=await import("node:fs");chmodSync(helper,0o700);
const helperSha=sha(readFileSync(helper));
const source=join(work,"16mb.bin"),destination=join(work,"dest.bin");
const data=Buffer.alloc(16*1024*1024,0x41);
writeFileSync(source,data,{mode:0o600});
const expected=sha(data),pass="12345678";
const broker=new L1Broker(state,{initialize:true});
broker.pair(pass);broker.setMode("FULL_HOST",pass);
const files=new HostFileOps(broker,{privateRoot:state,strictMutations:true});
const jobs=new AsyncCopyJobs(broker,files,{binary:helper,binarySha:helperSha});
const wait=async(fn,tries=125)=>{
 for(let i=0;i<tries;i++){const val=await fn();if(val)return val;await delay(80);}
 throw Error("ASYNC_COPY_TIMEOUT");
};
try{
 const key=randomUUID();
 const first=await jobs.start({source,destination,expectedSourceSha256:expected,idempotencyKey:key});
 assert.ok(first.processId);
 await wait(()=>["EXITED","FAILED"].includes(jobs.status({processId:first.processId}).state));
 const output=jobs.read({processId:first.processId,cursor:0,maxBytes:16384});
 assert.equal(output.exitCode,0,output.content);
 assert.match(output.content,/COPY_PROGRESS/);assert.match(output.content,/COPY_DONE/);
 assert.equal(sha(readFileSync(destination)),expected);
 assert.equal(sha(readFileSync(source)),expected);
 console.log("PASS owned 16MiB create-only copy, source/dest SHA, progress and EXITED");
 const b2=new L1Broker(state);
 const r=new AsyncCopyJobs(b2,new HostFileOps(b2,{privateRoot:state,strictMutations:true}),
  {binary:helper,binarySha:helperSha});
 assert.equal(r.status({processId:first.processId}).state,"EXITED");
 const duplicate=await r.start({source,destination,expectedSourceSha256:expected,idempotencyKey:key});
 assert.equal(duplicate.processId,first.processId);
 await assert.rejects(()=>r.start({source,destination,expectedSourceSha256:sha("BAD"),
  idempotencyKey:key}),/IDEMPOTENCY_KEY_CONFLICT/);
 console.log("PASS durable reopen and duplicate suppression");
 const existing=join(work,"existing.bin");writeFileSync(existing,"ORIGINAL",{mode:0o600});
 await assert.rejects(()=>r.start({source,destination:existing,expectedSourceSha256:expected,
  idempotencyKey:randomUUID()}),/COPY_DESTINATION_EXISTS/);
 assert.equal(readFileSync(existing,"utf8"),"ORIGINAL");
 const bad=join(work,"bad.bin");
 const failed=await r.start({source,destination:bad,expectedSourceSha256:sha("WRONG"),
  idempotencyKey:randomUUID()});
 await wait(()=>["EXITED","FAILED"].includes(r.status({processId:failed.processId}).state));
 assert.equal(r.status({processId:failed.processId}).state,"FAILED");
 assert.equal(existsSync(bad),false);
 console.log("PASS wrong source hash, existing destination reject without publishing");
 // Simulate the exact sealed stage identity left by an abrupt native-helper
 // SIGKILL. Test only; no real user file or general-purpose cleanup path.
 const record=b2.state.copyJobs.find(x=>x.processId===failed.processId);
 assert.ok(record?.stageId);
 const stage=join(work,".personal-copy-"+record.stageId+".stage");
 writeFileSync(stage,"ORPHAN_PARTIAL_COPY",{mode:0o600,flag:"wx"});
 const inspection=await r.inspectStage({processId:failed.processId});
 assert.equal(inspection.state,"ORPHAN_STAGE_REVIEW");
 assert.equal(inspection.stageSha256,sha("ORPHAN_PARTIAL_COPY"));
 await assert.rejects(()=>r.cleanupStage({processId:failed.processId,
   expectedStageSha256:sha("WRONG"),expectedDev:inspection.stageDev,
   expectedIno:inspection.stageIno}),/COPY_STAGE_PRECONDITION_MISMATCH/);
 assert.equal(readFileSync(stage,"utf8"),"ORPHAN_PARTIAL_COPY");
 const cleaned=await r.cleanupStage({processId:failed.processId,
   expectedStageSha256:inspection.stageSha256,expectedDev:inspection.stageDev,
   expectedIno:inspection.stageIno});
 assert.equal(cleaned.changed,true);assert.equal(existsSync(stage),false);
 assert.equal((await r.cleanupStage({processId:failed.processId,
   expectedStageSha256:inspection.stageSha256,expectedDev:inspection.stageDev,
   expectedIno:inspection.stageIno})).changed,false);
 console.log("PASS sealed-stage inspection, wrong hash refusal and exact cleanup");
 const symlink=join(work,"link");symlinkSync(state,symlink);
 await assert.rejects(()=>r.start({source,destination:join(symlink,"escape"),
  expectedSourceSha256:expected,idempotencyKey:randomUUID()}),/OWNER_CONTROL_PATH_DENIED/);
 const unrelated=await r.processes.start({executable:process.execPath,cwd:work,
  argv:["-e","process.stdout.write('OTHER')"],timeoutMs:10000,idempotencyKey:randomUUID()});
 assert.throws(()=>r.status({processId:unrelated.processId}),/ASYNC_COPY_NOT_OWNED/);
 assert.throws(()=>r.stop({processId:unrelated.processId}),/ASYNC_COPY_NOT_OWNED/);
 broker.setMode("ASK",pass);
 await assert.rejects(()=>jobs.start({source,destination:join(work,"blocked.bin"),
  expectedSourceSha256:expected,idempotencyKey:randomUUID()}),/ACCESS_REQUIRED/);
 console.log("PASS private state, unrelated process ID and revoked gate denial");
 console.log("L6_B05_ASYNC_COPY=PASS");
}catch(e){console.error("L6_B05_ASYNC_COPY=FAIL "+e.stack);process.exitCode=1;}
finally{rmSync(root,{recursive:true,force:true});console.log("isolated_fixture_cleanup=COMPLETE");}
