import {fileURLToPath} from "node:url";
import assert from "node:assert/strict";
import {spawn,spawnSync} from "node:child_process";
import {chmodSync,mkdtempSync,mkdirSync,readFileSync,realpathSync,rmSync,
 writeFileSync,lstatSync} from "node:fs";
import {join} from "node:path";
import {createHash,randomBytes,randomUUID} from "node:crypto";
import net from "node:net";
import {setTimeout as delay} from "node:timers/promises";
import {BusinessRegistry} from "./business-core.mjs";
import {BusinessContinuity} from "./business-continuity.mjs";

const here=fileURLToPath(new URL(".",import.meta.url));
const l1=fileURLToPath(new URL("../l1/",import.meta.url));
const root=realpathSync(mkdtempSync(join("/tmp","chatagent-business-b3-")));
const state=join(root,"state"),continuityRoot=join(state,"continuity");
const safeA=join(root,"safe-a"),safeB=join(root,"safe-b"),ro=join(root,"read-only");
const binDir=join(root,"private-bin");
mkdirSync(safeA);mkdirSync(safeB);mkdirSync(ro);mkdirSync(binDir,{mode:0o700});
const sha=v=>createHash("sha256").update(v).digest("hex");
const fileSha=p=>sha(readFileSync(p));
const log=x=>console.log("PASS "+x);
const reject=async(fn,code)=>{try{await fn();assert.fail("expected "+code);}
 catch(e){if(e?.code==="ERR_ASSERTION")throw e;assert.match(String(e?.message),new RegExp(code));return e;}};

const compile=(source,target,args=[])=>{
 const run=spawnSync("clang",["-Wall","-Wextra","-Werror","-O2",...args,source,"-o",target],{encoding:"utf8"});
 assert.equal(run.status,0,run.stderr);chmodSync(target,0o700);return fileSha(target);
};
const createBin=join(binDir,"create"),replaceBin=join(binDir,"replace"),mkdirBin=join(binDir,"mkdir");
const createSha=compile(join(l1,"native-create-excl.c"),createBin);
const replaceSha=compile(join(l1,"native-replace-cas.c"),replaceBin,["-framework","Security"]);
const mkdirSha=compile(join(here,"native-mkdir-excl.c"),mkdirBin);
const nativeEnv={
 CHATAGENT_BUSINESS_NATIVE_CREATE_BIN:createBin,
 CHATAGENT_BUSINESS_NATIVE_CREATE_SHA256:createSha,
 CHATAGENT_BUSINESS_NATIVE_REPLACE_BIN:replaceBin,
 CHATAGENT_BUSINESS_NATIVE_REPLACE_SHA256:replaceSha,
 CHATAGENT_BUSINESS_NATIVE_MKDIR_BIN:mkdirBin,
 CHATAGENT_BUSINESS_NATIVE_MKDIR_SHA256:mkdirSha
};

const registry=new BusinessRegistry(state,{initialize:true,organizationId:"acme",displayName:"ACME Labs"});
registry.addProject({projectId:"safe-a",displayName:"Safe A",hostRoot:safeA,profile:"SAFE"});
registry.addProject({projectId:"safe-b",displayName:"Safe B",hostRoot:safeB,profile:"SAFE"});
registry.addProject({projectId:"ro",displayName:"Read only",hostRoot:ro,profile:"READ_ONLY"});
mkdirSync(join(root,"disabled"));
registry.addProject({projectId:"disabled",displayName:"Disabled",hostRoot:join(root,"disabled"),profile:"SAFE",enabled:false});
let continuity=new BusinessContinuity(registry,{root:continuityRoot});
let server=null;

try{
 assert.equal(lstatSync(continuityRoot).mode&0o077,0);
 for(const name of ["memory.sqlite","memory-head.json","memory-seal.key"])
  assert.equal(lstatSync(join(continuityRoot,name)).mode&0o077,0);
 log("continuity store is owner-private HMAC-sealed SQLite state");

 const roOpen=continuity.open({projectId:"ro"});
 assert.equal(roOpen.freshness,"FRESH");assert.deepEqual(roOpen.recentTasks,[]);
 await reject(()=>continuity.startTask({projectId:"ro",objective:"Denied",operationId:randomUUID()}),
  "BUSINESS_PROFILE_DENIED");
 await reject(()=>continuity.startTask({projectId:"disabled",objective:"Denied",operationId:randomUUID()}),
  "BUSINESS_PROJECT_DISABLED");
 log("READ_ONLY may open continuity context but cannot start work; disabled project is denied");

 await reject(()=>continuity.startTask({projectId:"safe-a",objective:"password=do-not-store",
  operationId:randomUUID()}),"BUSINESS_CONTINUITY_INVALID_OR_SENSITIVE_TEXT");
 const opStartA=randomUUID();
 const taskA=continuity.startTask({projectId:"safe-a",objective:"Prepare launch plan",operationId:opStartA});
 assert.equal(taskA.organizationId,"acme");assert.equal(taskA.revision,0);assert.equal(taskA.status,"ACTIVE");
 const dupA=continuity.startTask({projectId:"safe-a",objective:"Prepare launch plan",operationId:opStartA});
 assert.equal(dupA.taskId,taskA.taskId);assert.equal(dupA.duplicate,true);
 await reject(()=>continuity.startTask({projectId:"safe-a",objective:"Different task",operationId:opStartA}),
  "BUSINESS_CONTINUITY_IDEMPOTENCY_CONFLICT");
 log("task start is project-scoped, secret-rejecting and idempotent");

 const taskB=continuity.startTask({projectId:"safe-b",objective:"Independent finance task",
  operationId:randomUUID()});
 await reject(()=>continuity.open({projectId:"safe-b",taskId:taskA.taskId}),
  "BUSINESS_CONTINUITY_TASK_NOT_FOUND");

 const cpOp=randomUUID();
 const cpA=continuity.checkpoint({
  projectId:"safe-a",taskId:taskA.taskId,expectedTaskRevision:0,operationId:cpOp,
  summary:"Launch plan drafted",currentState:"Reviewing channel sequence",
  nextActions:["Approve channel order","Prepare evidence pack"],
  verification:"Draft checked against accepted plan",
  decisions:["Use staged rollout"],facts:["Budget owner confirmed"],artifacts:["docs/launch.md"]
 });
 assert.equal(cpA.revision,1);
 const cpDup=continuity.checkpoint({
  projectId:"safe-a",taskId:taskA.taskId,expectedTaskRevision:0,operationId:cpOp,
  summary:"Launch plan drafted",currentState:"Reviewing channel sequence",
  nextActions:["Approve channel order","Prepare evidence pack"],
  verification:"Draft checked against accepted plan",
  decisions:["Use staged rollout"],facts:["Budget owner confirmed"],artifacts:["docs/launch.md"]
 });
 assert.equal(cpDup.duplicate,true);
 await reject(()=>continuity.checkpoint({
  projectId:"safe-a",taskId:taskA.taskId,expectedTaskRevision:0,operationId:randomUUID(),
  summary:"Stale",currentState:"Stale",nextActions:[],verification:"Stale"}),
  "BUSINESS_CONTINUITY_REVISION_CONFLICT");
 await reject(()=>continuity.checkpoint({
  projectId:"safe-a",taskId:taskA.taskId,expectedTaskRevision:1,operationId:randomUUID(),
  summary:"Sensitive",currentState:"Safe",nextActions:[],verification:"Safe",
  decisions:["api_key=do-not-store"]}),"BUSINESS_CONTINUITY_INVALID_OR_SENSITIVE_TEXT");
 log("checkpoint preserves revision CAS, idempotency, decisions/facts and secret rejection");

 const handoff1=continuity.prepareHandoff({projectId:"safe-a",taskId:taskA.taskId});
 assert.equal(handoff1.freshness,"FRESH");
 assert.equal(handoff1.freshnessBasis,"CONTINUITY_STATE_ONLY");
 assert.equal(handoff1.contextOnly,true);assert.equal(handoff1.authority,"NONE");
 assert.equal(handoff1.gitObservation,null);
 assert.match(handoff1.contextDigest,/^sha256:[a-f0-9]{64}$/);
 assert.equal(handoff1.lastCheckpoint.summary,"Launch plan drafted");
 assert.deepEqual(handoff1.decisions,["Use staged rollout"]);
 const handoff1Again=continuity.prepareHandoff({projectId:"safe-a",taskId:taskA.taskId});
 assert.equal(handoff1Again.contextDigest,handoff1.contextDigest);
 const fresh=continuity.open({projectId:"safe-a",taskId:taskA.taskId,
  expectedContextDigest:handoff1.contextDigest});
 assert.equal(fresh.freshness,"FRESH");assert.equal(fresh.freshnessReason,"CONTEXT_DIGEST_MATCH");
 log("canonical handoff digest is deterministic and context-only");

 continuity.checkpoint({
  projectId:"safe-b",taskId:taskB.taskId,expectedTaskRevision:0,operationId:randomUUID(),
  summary:"Unrelated project changed",currentState:"Finance review",
  nextActions:["Continue finance review"],verification:"Independent",
  decisions:["Keep separate"],facts:["No launch dependency"]
 });
 const unrelated=continuity.open({projectId:"safe-a",taskId:taskA.taskId,
  expectedContextDigest:handoff1.contextDigest});
 assert.equal(unrelated.freshness,"FRESH");
 assert.equal(unrelated.contextDigest,handoff1.contextDigest);
 assert.ok(unrelated.storeSeq>handoff1.storeSeq);
 log("unrelated project advancement does not falsely stale task handoff");

 const cpA2=continuity.checkpoint({
  projectId:"safe-a",taskId:taskA.taskId,expectedTaskRevision:1,operationId:randomUUID(),
  summary:"Launch plan approved",currentState:"Ready for handoff",
  nextActions:["Prepare campaign assets"],verification:"Owner approval recorded",
  decisions:["Proceed with staged rollout"],facts:["Launch date fixed"],artifacts:["docs/launch-final.md"]
 });
 assert.equal(cpA2.revision,2);
 const stale=continuity.open({projectId:"safe-a",taskId:taskA.taskId,
  expectedContextDigest:handoff1.contextDigest});
 assert.equal(stale.freshness,"STALE");assert.equal(stale.freshnessReason,"TASK_STATE_CHANGED");
 const handoff2=continuity.prepareHandoff({projectId:"safe-a",taskId:taskA.taskId});
 assert.notEqual(handoff2.contextDigest,handoff1.contextDigest);
 log("related checkpoint changes make prior handoff STALE");

 const bigTask=continuity.startTask({projectId:"safe-a",objective:"Bounded handoff stress",
  operationId:randomUUID()});
 const long=(ch,n)=>ch.repeat(n);
 continuity.checkpoint({
  projectId:"safe-a",taskId:bigTask.taskId,expectedTaskRevision:0,operationId:randomUUID(),
  summary:long("S",500),currentState:long("C",500),
  nextActions:Array.from({length:5},(_,i)=>String(i)+long("N",248)),
  verification:long("V",500),
  decisions:Array.from({length:8},(_,i)=>String(i)+long("가",248)),
  facts:Array.from({length:8},(_,i)=>String(i)+long("나",248)),
  artifacts:Array.from({length:5},(_,i)=>"artifact-"+i+"-"+long("다",108))
 });
 const bounded=continuity.prepareHandoff({projectId:"safe-a",taskId:bigTask.taskId});
 assert.ok(Buffer.byteLength(JSON.stringify(bounded))<=8192);
 assert.equal(bounded.truncated,true);
 assert.ok(bounded.omitted.facts+bounded.omitted.artifacts+bounded.omitted.decisions>0);
 assert.equal(bounded.lastCheckpoint.summary.length,500);
 assert.equal(bounded.nextActions.length,5);
 log("handoff deterministically prunes optional fields to the 8 KiB target");

 const recentA=continuity.open({projectId:"safe-a"});
 assert.equal(recentA.recentTasks.some(t=>t.taskId===taskB.taskId),false);
 assert.equal(recentA.recentTasks.some(t=>t.taskId===taskA.taskId),true);
 log("project-scoped discovery does not leak unrelated project tasks");

 continuity.close();
 continuity=new BusinessContinuity(registry,{root:continuityRoot});
 const resumed=continuity.open({projectId:"safe-a",taskId:taskA.taskId,
  expectedContextDigest:handoff2.contextDigest});
 assert.equal(resumed.freshness,"FRESH");
 assert.equal(resumed.lastCheckpoint.currentState,"Ready for handoff");
 log("fresh client after store reopen resumes the same persisted task");

 const completeOp=randomUUID();
 const completed=continuity.completeTask({projectId:"safe-a",taskId:taskA.taskId,
  expectedTaskRevision:2,operationId:completeOp});
 assert.equal(completed.status,"COMPLETED");assert.equal(completed.revision,3);
 const completedDup=continuity.completeTask({projectId:"safe-a",taskId:taskA.taskId,
  expectedTaskRevision:2,operationId:completeOp});
 assert.equal(completedDup.duplicate,true);
 await reject(()=>continuity.checkpoint({
  projectId:"safe-a",taskId:taskA.taskId,expectedTaskRevision:3,operationId:randomUUID(),
  summary:"No more writes",currentState:"Completed",nextActions:[],verification:"None"}),
  "BUSINESS_CONTINUITY_TASK_COMPLETED");
 const completedOpen=continuity.open({projectId:"safe-a",taskId:taskA.taskId,
  expectedContextDigest:handoff2.contextDigest});
 assert.equal(completedOpen.freshness,"STALE");assert.equal(completedOpen.taskStatus,"COMPLETED");
 log("completion is immutable and makes the prior active-task handoff stale");

 const brokenRoot=join(state,"continuity-broken");
 const broken=new BusinessContinuity(registry,{root:brokenRoot});
 const brokenTask=broken.startTask({projectId:"safe-a",objective:"Integrity fixture",
  operationId:randomUUID()});
 writeFileSync(join(brokenRoot,"memory-head.json"),"{broken");
 const unver=broken.open({projectId:"safe-a",taskId:brokenTask.taskId});
 assert.equal(unver.freshness,"UNVERIFIED");
 assert.equal(unver.freshnessReason,"MEMORY_UNAVAILABLE");
 assert.equal(unver.contextDigest,null);
 broken.close();
 log("continuity integrity failure returns explicit UNVERIFIED instead of fresh context");

 continuity.close();continuity=null;

 const freePort=()=>new Promise((resolve,rejectPort)=>{
  const s=net.createServer();s.once("error",rejectPort);
  s.listen(0,"127.0.0.1",()=>{const p=s.address().port;s.close(()=>resolve(p));});
 });
 const authFile=join(root,"business.key"),token=randomBytes(32).toString("base64url");
 writeFileSync(authFile,token,{mode:0o600});
 const port=await freePort();
 server=spawn(process.execPath,[join(here,"business-mcp-server.mjs")],{
  env:{...process.env,...nativeEnv,
   CHATAGENT_BUSINESS_STATE_DIR:state,
   CHATAGENT_BUSINESS_AUTH_FILE:authFile,
   CHATAGENT_BUSINESS_PORT:String(port),
   CHATAGENT_BUSINESS_CONTINUITY_ENABLED:"1"},
  stdio:["ignore","pipe","pipe"]
 });

 let serverErr="";server.stderr.on("data",x=>serverErr+=String(x).slice(0,1000));
 for(let i=0;i<80;i++){
  if(server.exitCode!==null)throw Error("B3_MCP_EARLY_EXIT "+serverErr);
  try{
   const h=await fetch("http://127.0.0.1:"+port+"/health",{signal:AbortSignal.timeout(300)});
   if(h.ok){
    const status=await h.json();
    assert.equal(status.phase,"B3");assert.equal(status.safeFilesReady,true);
    assert.equal(status.continuityReady,true);break;
   }
  }catch(e){if(i===79)throw e;}
  await delay(75);
 }

 let rpcId=0;
 const post=async(payload,headers={})=>{
  const r=await fetch("http://127.0.0.1:"+port+"/mcp",{
   method:"POST",headers:{"content-type":"application/json","accept":"application/json, text/event-stream",
    "x-chatagent-business-credential":token,...headers},
   body:JSON.stringify(payload),signal:AbortSignal.timeout(10000)
  });
  return {status:r.status,body:await r.json()};
 };
 const rpc=async(method,params={})=>post({jsonrpc:"2.0",id:++rpcId,method,params});
 const call=async(name,args)=>{
  const r=await rpc("tools/call",{name,arguments:args});
  assert.equal(r.status,200);assert.ok(!r.body.error,JSON.stringify(r.body));
  return {value:r.body.result.structuredContent,isError:r.body.result.isError===true};
 };

 let response=await rpc("initialize",{protocolVersion:"2025-03-26",capabilities:{},
  clientInfo:{name:"business-b3-test",version:"1"}});
 assert.equal(response.status,200);assert.ok(!response.body.error,JSON.stringify(response.body));
 response=await rpc("tools/list",{});
 const names=response.body.result.tools.map(x=>x.name);
 assert.equal(names.length,14);
 for(const name of ["continuity_open","continuity_start_task","continuity_checkpoint",
  "continuity_prepare_handoff","continuity_complete_task"])assert.ok(names.includes(name));
 for(const forbidden of ["search_memory","record_decision","record_fact","validate_handoff","set_profile"])
  assert.equal(names.includes(forbidden),false);
 log("B3 MCP publishes exactly 14 status/read/safe/continuity tools with no extra memory surface");

 const status=await call("business_status",{});
 assert.equal(status.value.phase,"B3");assert.equal(status.value.continuity,"READY_B3");
 assert.equal(JSON.stringify(status.value).includes(continuityRoot),false);

 const mcpTask=await call("continuity_start_task",{projectId:"safe-a",
  objective:"Conversation A campaign handoff",operationId:randomUUID()});
 assert.equal(mcpTask.isError,false);assert.equal(mcpTask.value.status,"ACTIVE");
 const mcpCp=await call("continuity_checkpoint",{projectId:"safe-a",taskId:mcpTask.value.taskId,
  expectedTaskRevision:0,operationId:randomUUID(),summary:"Campaign draft ready",
  currentState:"Waiting for fresh conversation review",nextActions:["Resume in fresh chat"],
  verification:"Continuity canary",decisions:["Keep scope bounded"],facts:["B3 local canary"]});
 assert.equal(mcpCp.isError,false);assert.equal(mcpCp.value.revision,1);

 const mcpHandoff=await call("continuity_prepare_handoff",{projectId:"safe-a",taskId:mcpTask.value.taskId});
 assert.equal(mcpHandoff.isError,false);assert.equal(mcpHandoff.value.freshness,"FRESH");
 assert.match(mcpHandoff.value.contextDigest,/^sha256:[a-f0-9]{64}$/);

 const freshConversation=await call("continuity_open",{projectId:"safe-a",taskId:mcpTask.value.taskId,
  expectedContextDigest:mcpHandoff.value.contextDigest});
 assert.equal(freshConversation.isError,false);
 assert.equal(freshConversation.value.freshness,"FRESH");
 assert.equal(freshConversation.value.objective,"Conversation A campaign handoff");
 assert.deepEqual(freshConversation.value.nextActions,["Resume in fresh chat"]);
 log("Conversation A handoff resumes in a fresh stateless MCP call with no hidden chat history");

 const wrongProject=await call("continuity_open",{projectId:"safe-b",taskId:mcpTask.value.taskId});
 assert.equal(wrongProject.isError,true);
 assert.equal(wrongProject.value.code,"BUSINESS_CONTINUITY_TASK_NOT_FOUND");

 const roStart=await call("continuity_start_task",{projectId:"ro",objective:"Denied",
  operationId:randomUUID()});
 assert.equal(roStart.isError,true);assert.equal(roStart.value.code,"BUSINESS_PROFILE_DENIED");

 const secretCp=await call("continuity_checkpoint",{projectId:"safe-a",taskId:mcpTask.value.taskId,
  expectedTaskRevision:1,operationId:randomUUID(),summary:"Secret test",currentState:"No effect",
  nextActions:[],verification:"No effect",facts:["password=must-not-store"]});
 assert.equal(secretCp.isError,true);
 assert.equal(secretCp.value.code,"BUSINESS_CONTINUITY_INVALID_OR_SENSITIVE_TEXT");
 log("MCP project mismatch, READ_ONLY mutation and secret propagation are denied");

 response=await rpc("tools/call",{name:"continuity_open",
  arguments:{projectId:"safe-a",taskId:mcpTask.value.taskId,profile:"STANDARD"}});
 assert.equal(response.status,200);
 assert.equal(response.body.result?.isError===true||response.body.error!==undefined,true);

 response=await post({jsonrpc:"2.0",id:++rpcId,method:"tools/list",params:{}},
  {"x-chatagent-business-profile":"STANDARD"});
 assert.equal(response.status,400);assert.equal(response.body.error.message,"AUTHORITY_INPUT_FORBIDDEN");
 log("continuity tool/header profile injection remains fail-closed");

 console.log("BUSINESS_B3_SHARED_CONTINUITY=PASS");
}catch(e){
 console.error("BUSINESS_B3_SHARED_CONTINUITY=FAIL "+e.stack);
 process.exitCode=1;
}finally{
 if(server)server.kill("SIGTERM");
 try{continuity?.close();}catch{}
 await delay(350);
 rmSync(root,{recursive:true,force:true});
 console.log("test_only_fixture_cleanup=COMPLETE");
}
