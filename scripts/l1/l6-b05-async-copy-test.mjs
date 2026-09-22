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
 // F04: no action ever reserved: the original key remains sealed, no replay.
 const beforeActionKey=randomUUID(),beforeActionDest=join(work,"before-action.bin");
 const realStart=r.processes.start.bind(r.processes);
 r.processes.start=async()=>{throw Error("TEST_BEFORE_ACTION");};
 await assert.rejects(()=>r.start({source,destination:beforeActionDest,
  expectedSourceSha256:expected,idempotencyKey:beforeActionKey}),/TEST_BEFORE_ACTION/);
 r.processes.start=realStart;
 await assert.rejects(()=>r.start({source,destination:beforeActionDest,
  expectedSourceSha256:expected,idempotencyKey:beforeActionKey}),
  /ASYNC_COPY_RECONCILIATION_REQUIRED/);
 assert.equal(existsSync(beforeActionDest),false);
 // An action sealed before the config/runner exists still exposes its original
 // processId as RECOVERY_REQUIRED, not a new process or a fabricated success.
 const reservedKey=randomUUID(),reservedDest=join(work,"reserved-action.bin");
 const reservedId=randomUUID(),sealedNonce=sha(JSON.stringify("fixture-nonce"));
 r.processes.start=async input=>{
  const {idempotencyKey,...intent}=input;
  b2.reserveAction(idempotencyKey,sha(JSON.stringify(intent)),
   {processId:reservedId,nonceDigest:sealedNonce});
  throw Error("TEST_AFTER_ACTION_RESERVATION");
 };
 await assert.rejects(()=>r.start({source,destination:reservedDest,
  expectedSourceSha256:expected,idempotencyKey:reservedKey}),/TEST_AFTER_ACTION_RESERVATION/);
 r.processes.start=realStart;
 const reservedReopenBroker=new L1Broker(state);
 const reservedReopen=new AsyncCopyJobs(reservedReopenBroker,
  new HostFileOps(reservedReopenBroker,{privateRoot:state,strictMutations:true}),
  {binary:helper,binarySha:helperSha});
 const recoveredReservation=await reservedReopen.start({source,destination:reservedDest,
  expectedSourceSha256:expected,idempotencyKey:reservedKey});
 assert.equal(recoveredReservation.processId,reservedId);
 assert.equal(recoveredReservation.state,"RECOVERY_REQUIRED");
 assert.equal(reservedReopenBroker.state.actions.filter(x=>x.key===reservedKey).length,1);
 assert.equal(reservedReopenBroker.state.copyJobs.find(x=>x.key===reservedKey).processId,reservedId);
 assert.equal(existsSync(reservedDest),false);
 const originalStatus=reservedReopen.processes.status.bind(reservedReopen.processes);
 reservedReopen.processes.status=()=>{throw Error("RECOVERY_REQUIRED");};
 const stillOwned=await reservedReopen.start({source,destination:reservedDest,
  expectedSourceSha256:expected,idempotencyKey:reservedKey});
 assert.equal(stillOwned.processId,reservedId);
 assert.equal(stillOwned.state,"RECOVERY_REQUIRED");
 reservedReopen.processes.status=originalStatus;
 await assert.rejects(()=>reservedReopen.inspectStage({processId:reservedId}),
  /COPY_RECONCILIATION_REQUIRED/);
 // An unrelated or corrupted action digest must never be linked to this copy.
 const badActionKey=randomUUID(),badActionDest=join(work,"bad-action.bin");
 const badActionId=randomUUID();
 r.processes.start=async input=>{
  b2.reserveAction(input.idempotencyKey,sha(JSON.stringify({unrelated:true})),
   {processId:badActionId,nonceDigest:sealedNonce});
  throw Error("TEST_MISMATCHED_ACTION");
 };
 await assert.rejects(()=>r.start({source,destination:badActionDest,
  expectedSourceSha256:expected,idempotencyKey:badActionKey}),/TEST_MISMATCHED_ACTION/);
 r.processes.start=realStart;
 await assert.rejects(()=>r.start({source,destination:badActionDest,
  expectedSourceSha256:expected,idempotencyKey:badActionKey}),
  /ASYNC_COPY_RECONCILIATION_REQUIRED/);
 assert.equal(b2.state.copyJobs.find(x=>x.key===badActionKey).processId,null);
 assert.equal(existsSync(badActionDest),false);
 // A failed reconciliation save must not announce a durable binding.
 const saveKey=randomUUID(),saveDest=join(work,"save-uncertain.bin"),saveId=randomUUID();
 r.processes.start=async input=>{
  const {idempotencyKey,...intent}=input;
  b2.reserveAction(idempotencyKey,sha(JSON.stringify(intent)),
   {processId:saveId,nonceDigest:sealedNonce});
  throw Error("TEST_SAVE_WINDOW");
 };
 await assert.rejects(()=>r.start({source,destination:saveDest,
  expectedSourceSha256:expected,idempotencyKey:saveKey}),/TEST_SAVE_WINDOW/);
 r.processes.start=realStart;
 const uncertainBroker=new L1Broker(state);
 const uncertainJobs=new AsyncCopyJobs(uncertainBroker,
  new HostFileOps(uncertainBroker,{privateRoot:state,strictMutations:true}),
  {binary:helper,binarySha:helperSha});
 const safeSave=uncertainBroker.save.bind(uncertainBroker);
 uncertainBroker.save=()=>{throw Error("TEST_STATE_SAVE_FAILED");};
 await assert.rejects(()=>uncertainJobs.start({source,destination:saveDest,
  expectedSourceSha256:expected,idempotencyKey:saveKey}),
  /ASYNC_COPY_RECONCILIATION_REQUIRED/);
 assert.equal(uncertainBroker.state.copyJobs.find(x=>x.key===saveKey).processId,null);
 uncertainBroker.save=safeSave;
 const safeReconcile=await uncertainJobs.start({source,destination:saveDest,
  expectedSourceSha256:expected,idempotencyKey:saveKey});
 assert.equal(safeReconcile.processId,saveId);
 assert.equal(safeReconcile.state,"RECOVERY_REQUIRED");
 assert.equal(existsSync(saveDest),false);
 console.log("PASS F04 no-action seal, pre-config processId reconciliation and digest mismatch denial");
 // Real detached runner launched, then simulated copy binding interruption.
 // Relaunch must reconnect to the SAME action/processId, never spawn again.
 for(const legacy of [false,true]){
  const interruptedKey=randomUUID(),interruptedDest=join(work,legacy?"legacy-recovered.bin":"recovered.bin");
  let launchedId=null;
  r.processes.start=async input=>{
   const launched=await realStart(input);launchedId=launched.processId;
   throw Error("TEST_POST_LAUNCH_BEFORE_COPY_BIND");
  };
  await assert.rejects(()=>r.start({source,destination:interruptedDest,
   expectedSourceSha256:expected,idempotencyKey:interruptedKey}),/TEST_POST_LAUNCH_BEFORE_COPY_BIND/);
  r.processes.start=realStart;
  const pendingRec=b2.state.copyJobs.find(x=>x.key===interruptedKey);
  assert.equal(pendingRec.processId,null);
  if(legacy){delete pendingRec.sourceDev;delete pendingRec.sourceIno;b2.save();}
  const restartBroker=new L1Broker(state);
  const restartJobs=new AsyncCopyJobs(restartBroker,
   new HostFileOps(restartBroker,{privateRoot:state,strictMutations:true}),
   {binary:helper,binarySha:helperSha});
  const resumed=await restartJobs.start({source,destination:interruptedDest,
   expectedSourceSha256:expected,idempotencyKey:interruptedKey});
  assert.equal(resumed.processId,launchedId);
  await wait(()=>["EXITED","FAILED"].includes(restartJobs.status({processId:launchedId}).state));
  const finished=restartJobs.read({processId:launchedId,cursor:0,maxBytes:16384});
  assert.equal(finished.exitCode,0,finished.content);
  assert.match(finished.content,/COPY_DONE/);
  assert.equal(sha(readFileSync(interruptedDest)),expected);
  assert.equal(restartBroker.state.actions.filter(x=>x.key===interruptedKey).length,1);
  assert.equal((await restartJobs.start({source,destination:interruptedDest,
   expectedSourceSha256:expected,idempotencyKey:interruptedKey})).processId,launchedId);
 }
 console.log("PASS F04 real post-launch recovery, legacy record linkage and same-ID no-replay");
 broker.setMode("ASK",pass);
 await assert.rejects(()=>jobs.start({source,destination:join(work,"blocked.bin"),
  expectedSourceSha256:expected,idempotencyKey:randomUUID()}),/ACCESS_REQUIRED/);
 console.log("PASS private state, unrelated process ID and revoked gate denial");
 // F04-R1: the *actual* legacy runner config must match the sealed action
 // AND the copy record. These are owner-only fixtures: never launch the
 // intentionally mismatched configs or touch existing user paths.
 const legacyKey=randomUUID(),legacyDest=join(work,"legacy-contract.bin");
 const legacyId=randomUUID(),legacyNonce="f".repeat(64);
 let originalIntent,launchAttempts=0;
 r.processes.start=async input=>{
  const {idempotencyKey,...intent}=input;
  originalIntent=intent;
  b2.reserveAction(idempotencyKey,sha(JSON.stringify(intent)),
   {processId:legacyId,nonceDigest:sha(JSON.stringify(legacyNonce))});
  throw Error("TEST_F04_LEGACY_PREPARED");
 };
 await assert.rejects(()=>r.start({source,destination:legacyDest,
  expectedSourceSha256:expected,idempotencyKey:legacyKey}),/TEST_F04_LEGACY_PREPARED/);
 r.processes.start=async()=>{launchAttempts++;throw Error("UNEXPECTED_SECOND_LAUNCH");};
 const legacyRec=b2.state.copyJobs.find(x=>x.key===legacyKey);
 delete legacyRec.sourceDev;delete legacyRec.sourceIno;b2.save();
 const legacyJobDir=join(state,"jobs",legacyId);
 mkdirSync(legacyJobDir,{mode:0o700});
 const legacyConfigFile=join(legacyJobDir,"config.json");
 const validConfig={...originalIntent,processId:legacyId,nonce:legacyNonce};
 const changeArg=(i,v)=>c=>{c.argv[i]=v;};
 const mutations=[
  ["executable",c=>{c.executable="/unrelated/node";}],
  ["cwd",c=>{c.cwd="/unrelated/work";}],
  ["timeout",c=>{c.timeoutMs=1000;}],
  ...[0,1,2,3,4,5,6,9].map(i=>["argv["+i+"]",
   changeArg(i,"altered-"+i)]),
  ["missing executable",c=>{delete c.executable;}],
  ["missing argv",c=>{delete c.argv;}],
  ["invalid timeout",c=>{c.timeoutMs="3600000";}],
  ["bad argv type",c=>{c.argv[3]=3;}],
  ["mismatched dev",changeArg(7,"999999")],
  ["mismatched ino",changeArg(8,"999999")],
  ["mismatched nonce",c=>{c.nonce="e".repeat(64);}]
 ];
 for(const [label,mutate] of mutations){
  const candidate=JSON.parse(JSON.stringify(validConfig));mutate(candidate);
  writeFileSync(legacyConfigFile,JSON.stringify(candidate),{mode:0o600});
  await assert.rejects(()=>r.start({source,destination:legacyDest,
   expectedSourceSha256:expected,idempotencyKey:legacyKey}),
   /ASYNC_COPY_RECONCILIATION_REQUIRED/,label);
  assert.equal(legacyRec.processId,null,label);
  assert.equal(b2.state.audit.some(a=>a.action==="ASYNC_COPY_RECONCILED"&&
   a.processId===legacyId),false,label);
 }
 const legacyBeforeReopen=new L1Broker(state);
 assert.equal(legacyBeforeReopen.state.copyJobs.find(x=>x.key===legacyKey).processId,null);
 assert.equal(launchAttempts,0);
 assert.equal(existsSync(legacyDest),false);
 writeFileSync(legacyConfigFile,JSON.stringify(validConfig),{mode:0o600});
 const recoveredLegacy=await r.start({source,destination:legacyDest,
  expectedSourceSha256:expected,idempotencyKey:legacyKey});
 assert.equal(recoveredLegacy.processId,legacyId);
 assert.equal(recoveredLegacy.state,"RECOVERY_REQUIRED");
 assert.equal(launchAttempts,0);
 assert.equal(b2.state.actions.filter(x=>x.key===legacyKey).length,1);
 assert.equal((new L1Broker(state)).state.copyJobs.find(x=>x.key===legacyKey).processId,legacyId);
 r.processes.start=realStart;
 console.log("PASS F04-R1 "+mutations.length+" legacy config mismatches rejected, intact config same-ID recovery, no replay");

 console.log("L6_B05_ASYNC_COPY=PASS");
}catch(e){console.error("L6_B05_ASYNC_COPY=FAIL "+e.stack);process.exitCode=1;}
finally{rmSync(root,{recursive:true,force:true});console.log("isolated_fixture_cleanup=COMPLETE");}
