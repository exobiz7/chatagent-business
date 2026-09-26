import assert from "node:assert/strict";
import {mkdtempSync,realpathSync,readFileSync,writeFileSync,lstatSync,rmSync,chmodSync,mkdirSync,copyFileSync} from "node:fs";
import {join} from "node:path";
import {tmpdir} from "node:os";
import {randomUUID,createHash} from "node:crypto";
import {DatabaseSync} from "node:sqlite";
import {PersonalMemoryStore} from "./personal-memory-store.mjs";

const root=realpathSync(mkdtempSync(join(tmpdir(),"personal-memory-owned-")));
const state=join(root,"private"),sha=v=>createHash("sha256").update(v).digest("hex");
const ownerStatus=()=>({paired:true,mode:"ASK"});
const uid=typeof process.getuid==="function"?process.getuid():null;
const uuid=randomUUID, gitSha="a".repeat(40);
let store;
const start=()=>new PersonalMemoryStore(state,{ownerStatus});
const open=()=>new PersonalMemoryStore(state,{initialize:true,ownerStatus});
const expect=async(fn,code)=>assert.rejects(async()=>fn(),new RegExp(code));
try{
 store=open();
 const st=lstatSync(state),key=lstatSync(join(state,"memory-seal.key")),
  db=lstatSync(join(state,"memory.sqlite"));
 assert.equal(st.mode&0o077,0);
 assert.equal(key.mode&0o077,0);
 assert.equal(db.mode&0o077,0);
 assert.equal(key.nlink,1);
 if(uid!==null)assert.equal(key.uid,uid);
 assert.notEqual(sha(readFileSync(join(state,"memory-seal.key"))),sha("P8_SHARED_KEY"));
 console.log("PASS independently initialized personal-only 0700 state, 0600 SQLite and seal");

 const projectKey=uuid(),project=store.projectRegister({
  projectId:"alpha",rootLabel:"Alpha local",operationId:projectKey
 });
 assert.ok(project.projectUuid);
 assert.deepEqual(store.projectRegister({projectId:"alpha",rootLabel:"Alpha local",
  operationId:projectKey}),{...project,duplicate:true});
 await expect(()=>store.projectRegister({projectId:"alpha",rootLabel:"other",
  operationId:projectKey}),"MEMORY_IDEMPOTENCY_CONFLICT");
 store.projectRegister({projectId:"beta",rootLabel:"Beta",operationId:uuid()});
 const taskKey=uuid(),task=store.taskStart({projectId:"alpha",title:"Ship personal store",operationId:taskKey});
 assert.deepEqual(store.taskStart({projectId:"alpha",title:"Ship personal store",
  operationId:taskKey}),{...task,duplicate:true});
 assert.equal(task.revision,0);
 const cpKey=uuid(),base={projectId:"alpha",taskId:task.taskId,expectedTaskRevision:0,
  summary:"Checkpoint completed",currentState:"Isolated memory running",
  nextActions:["Verify CI","Review security"],verification:"local tests PASS",
  artifactRefs:["docs/verification/person-test"],gitSha};
 const checkpoint=store.checkpointAppend({...base,operationId:cpKey});
 assert.equal(checkpoint.revision,1);assert.ok(checkpoint.checkpointId);
 assert.deepEqual(store.checkpointAppend({...base,operationId:cpKey}),{...checkpoint,duplicate:true});
 await expect(()=>store.checkpointAppend({...base,summary:"different",operationId:cpKey}),
  "MEMORY_IDEMPOTENCY_CONFLICT");
 await expect(()=>store.checkpointAppend({...base,operationId:uuid()}),"MEMORY_REVISION_CONFLICT");
 await expect(()=>store.checkpointAppend({...base,projectId:"beta",operationId:uuid()}),"MEMORY_PROJECT_DENIED");
 await expect(()=>store.taskGet({projectId:"beta",taskId:task.taskId}),"MEMORY_PROJECT_DENIED");
 await expect(()=>store.projectContext({projectId:"missing"}),"MEMORY_PROJECT_DENIED");
 assert.equal(store.search({projectId:"beta",query:"Checkpoint"}).matches.length,0);
 assert.equal(store.search({projectId:"alpha",query:"checkpoint"}).matches[0].checkpointId,checkpoint.checkpointId);
 assert.equal(store.projectContext({projectId:"alpha"}).tasks[0].projectId,"alpha");
 await expect(()=>store.checkpointAppend({...base,expectedTaskRevision:1,
  summary:"password=topsecret",operationId:uuid()}),"MEMORY_INVALID_OR_SENSITIVE_TEXT");
 await expect(()=>store.checkpointAppend({...base,expectedTaskRevision:1,
  verification:"Bearer live-token-value",operationId:uuid()}),"MEMORY_INVALID_OR_SENSITIVE_TEXT");
 await expect(()=>store.taskStart({projectId:"alpha",title:"api_key=secret",operationId:uuid()}),
  "MEMORY_INVALID_OR_SENSITIVE_TEXT");
 assert.equal(store.projectContext({projectId:"alpha"}).contextSeq,4);
 const completed=store.taskComplete({projectId:"alpha",taskId:task.taskId,
  expectedTaskRevision:1,operationId:uuid()});
 assert.equal(completed.status,"COMPLETED");
 await expect(()=>store.checkpointAppend({...base,expectedTaskRevision:2,operationId:uuid()}),
  "MEMORY_TASK_COMPLETED");
 await expect(()=>store.taskGet({projectId:"beta",taskId:task.taskId}),"MEMORY_PROJECT_DENIED");
 console.log("PASS project/task scopes, revision CAS, exact idempotency, immutable completion and secret denial");

 // Fresh process-equivalent owner instance reloads entirely from signed disk events.
 store.close();store=start();
 const stored=store.taskGet({projectId:"alpha",taskId:task.taskId}).task;
 assert.equal(stored.status,"COMPLETED");
 assert.equal(stored.checkpoints[0].summary,base.summary);
 assert.equal(store.search({projectId:"alpha",query:"Checkpoint"}).matches.length,1);
 assert.equal(store.projectContext({projectId:"alpha"}).contextSeq,5);
 console.log("PASS independent reopen, verified event-chain replay and bounded search");

 // Simulate a crash after durable SQLite COMMIT but BEFORE signed head promotion.
 store.close();
 let injected=0;
 store=new PersonalMemoryStore(state,{ownerStatus,testHooks:{beforeHeadPromotion:()=>{
  injected++;throw Error("TEST_AFTER_COMMIT_BEFORE_HEAD");}}});
 const otherKey=uuid();
 await expect(()=>store.taskStart({projectId:"alpha",title:"After commit",operationId:otherKey}),
  "MEMORY_RECOVERY_REQUIRED");
 assert.equal(injected,1);store.close();store=start();
 const recovered=store.taskStart({projectId:"alpha",title:"After commit",operationId:otherKey});
 assert.equal(recovered.duplicate,true);
 const scope=store.projectContext({projectId:"alpha"});
 assert.equal(scope.tasks.length,2);
 assert.equal(scope.contextSeq,6);
 console.log("PASS committed-before-head interrupted effect verified and reconciled without replay");

 // Tamper one recorded payload while keeping the HMAC seal key untouched.
 store.close();
 const dbFile=join(state,"memory.sqlite");
 const sqlite=new DatabaseSync(dbFile);
 sqlite.prepare("UPDATE events SET payload = ? WHERE seq = ?").run('{"kind":"PROJECT","projectId":"ATTACK"}',1);
 sqlite.close();
 assert.throws(()=>start(),/MEMORY_RECOVERY_REQUIRED/);
 console.log("PASS HMAC rejects event payload corruption on fresh load");

 // New separately owned fixture tests authenticated external sealed head ahead of journal.
 const dir2=join(root,"second"),s2=new PersonalMemoryStore(dir2,{initialize:true,ownerStatus});
 s2.projectRegister({projectId:"gamma",rootLabel:"Gamma",operationId:uuid()});
 s2.close();
 const db2=new DatabaseSync(join(dir2,"memory.sqlite"));
 db2.exec("DELETE FROM events WHERE seq=1");db2.close();
 assert.throws(()=>new PersonalMemoryStore(dir2,{ownerStatus}),/MEMORY_RECOVERY_REQUIRED/);
 console.log("PASS separately sealed high-watermark rejects silent journal truncation");

 const insecure=join(root,"insecure");mkdirSync(insecure,{mode:0o755});chmodSync(insecure,0o755);
 assert.throws(()=>new PersonalMemoryStore(insecure,{initialize:true,ownerStatus}),/MEMORY_ROOT_UNSAFE/);
 assert.throws(()=>new PersonalMemoryStore(join(root,"not-there","nested"),{
  initialize:true,ownerStatus}),/MEMORY_PARENT_NOT_INITIALIZED/);
 assert.throws(()=>new PersonalMemoryStore(join(root,"chatagent","state"),{
  initialize:true,ownerStatus}),/MEMORY_CROSS_PRODUCT_ROOT_DENIED/);
 assert.throws(()=>new PersonalMemoryStore(join(root,"unpaired"),{
  initialize:true,ownerStatus:()=>({paired:false})}).projectContext({projectId:"alpha"}),
  /MEMORY_OWNER_REQUIRED/);
 console.log("PASS unsafe roots, former product roots and unpaired access fail closed");
 console.log("PERSONAL_MEMORY_STORE_TEST=PASS");
}catch(e){
 console.error("PERSONAL_MEMORY_STORE_TEST=FAIL "+e.stack);process.exitCode=1;
}finally{
 try{store?.close();}catch{}
 rmSync(root,{recursive:true,force:true});
 console.log("test_only_private_fixture_cleanup=COMPLETE");
}
