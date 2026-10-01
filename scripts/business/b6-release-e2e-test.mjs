import {fileURLToPath} from "node:url";
import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
import {
 chmodSync,mkdtempSync,mkdirSync,readFileSync,realpathSync,rmSync,writeFileSync,
 symlinkSync,existsSync
} from "node:fs";
import {tmpdir} from "node:os";
import {dirname,join} from "node:path";
import {createHash,randomBytes,randomUUID} from "node:crypto";
import net from "node:net";
import {setTimeout as delay} from "node:timers/promises";
import {BusinessRegistry} from "./business-core.mjs";
import {BusinessContinuity} from "./business-continuity.mjs";
import {
 doctorBusiness,startBusiness,stopBusiness,statusBusiness,backupBusiness,restoreBusiness
} from "./business-ops.mjs";

const B5_COMMIT="167df3aa33fc5c7191ab1768545ca8a8d7f74f82";
const EXEC_IMAGE_REF="node@sha256:0e0ff40c39bc087845bfb27465a0df4ea419520094bc35842ff83dd8cbe6f9b6";
const EXEC_IMAGE_ID="sha256:0e0ff40c39bc087845bfb27465a0df4ea419520094bc35842ff83dd8cbe6f9b6";
const here=fileURLToPath(new URL(".",import.meta.url));
const repo=realpathSync(fileURLToPath(new URL("../../",import.meta.url)));
const l1=join(repo,"scripts/l1");
const root=realpathSync(mkdtempSync(join(tmpdir(),"chatagent-business-b6-")));
chmodSync(root,0o700);
const state=join(root,"state"),roRoot=join(root,"read-only"),safeRoot=join(root,"safe-project"),devRoot=join(root,"dev-project");
const binDir=join(root,"private-bin"),runtimeDir=join(root,"runtime"),logsDir=join(root,"logs");
const backupsDir=join(root,"backups"),restoreRootDir=join(root,"restores");
for(const d of [roRoot,safeRoot,devRoot,binDir])mkdirSync(d,{mode:d===binDir?0o700:0o755});
mkdirSync(join(devRoot,".git"));
const sha=v=>createHash("sha256").update(v).digest("hex");
const fileSha=p=>sha(readFileSync(p));
const log=x=>console.log("PASS "+x);
const compile=(source,target,args=[])=>{
 const r=spawnSync("/usr/bin/clang",["-Wall","-Wextra","-Werror","-O2",...args,source,"-o",target],{encoding:"utf8"});
 assert.equal(r.status,0,r.stderr);chmodSync(target,0o700);return fileSha(target);
};

const createBin=join(binDir,"create"),replaceBin=join(binDir,"replace"),mkdirBin=join(binDir,"mkdir"),publishBin=join(binDir,"publish");
const native={
 create:{path:createBin,sha256:compile(join(l1,"native-create-excl.c"),createBin)},
 replace:{path:replaceBin,sha256:compile(join(l1,"native-replace-cas.c"),replaceBin,["-framework","Security"])},
 mkdir:{path:mkdirBin,sha256:compile(join(here,"native-mkdir-excl.c"),mkdirBin)},
 publish:{path:publishBin,sha256:compile(join(l1,"native-restore-publish.c"),publishBin)}
};
const whichDocker=spawnSync("/usr/bin/which",["docker"],{encoding:"utf8"});
assert.equal(whichDocker.status,0,whichDocker.stderr);
const dockerBinary=realpathSync(whichDocker.stdout.trim()),dockerSha256=fileSha(dockerBinary);
const imageInspect=spawnSync(dockerBinary,["image","inspect",EXEC_IMAGE_REF,"--format","{{.Id}}|{{.Architecture}}|{{.Os}}"],{encoding:"utf8"});
assert.equal(imageInspect.status,0,imageInspect.stderr);
assert.equal(imageInspect.stdout.trim(),EXEC_IMAGE_ID+"|arm64|linux");

writeFileSync(join(roRoot,"policy.txt"),"READ_ONLY_POLICY\n",{mode:0o600});
writeFileSync(join(safeRoot,"notes.txt"),"SAFE_BASE\n",{mode:0o600});
writeFileSync(join(devRoot,"package.json"),JSON.stringify({
 name:"b6-dev-fixture",version:"1.0.0",private:true,scripts:{test:"node test.js"}
},null,2)+"\n",{mode:0o600});
writeFileSync(join(devRoot,"value.json"),'{"answer":41}\n',{mode:0o600});
writeFileSync(join(devRoot,"test.js"),
 'const v=require("./value.json"); if(v.answer!==42){console.error("EXPECTED_42:"+v.answer);process.exit(2)} console.log("TEST_PASS_42")\n',
 {mode:0o600});

const registry=new BusinessRegistry(state,{initialize:true,organizationId:"release-org",displayName:"Release Org"});
registry.addProject({projectId:"docs",displayName:"Docs",hostRoot:roRoot,profile:"READ_ONLY"});
registry.addProject({projectId:"ops",displayName:"Operations",hostRoot:safeRoot,profile:"SAFE"});
registry.addProject({projectId:"dev",displayName:"Development",hostRoot:devRoot,profile:"STANDARD"});

const authFile=join(root,"business.key"),token=randomBytes(32).toString("base64url");
writeFileSync(authFile,token,{mode:0o600});
const freePort=()=>new Promise((resolve,reject)=>{
 const s=net.createServer();s.once("error",reject);
 s.listen(0,"127.0.0.1",()=>{const p=s.address().port;s.close(()=>resolve(p));});
});
const port=await freePort(),configPath=join(root,"operator.json");
const config={
 schemaVersion:1,expectedNodeVersion:process.version,nodeBinary:process.execPath,repoRoot:repo,
 stateDir:state,authFile,port,continuityEnabled:true,auditEnabled:true,safePilotMode:false,
 runtimeDir,logsDir,backupsDir,restoreRootDir,tunnelHealthUrl:null,native,
 exec:{enabled:true,dockerBinary,dockerSha256,imageRef:EXEC_IMAGE_REF,imageId:EXEC_IMAGE_ID}
};
writeFileSync(configPath,JSON.stringify(config,null,2)+"\n",{mode:0o600});

let started=false,rollbackWorktree=null;
try{
 const doctor=await doctorBusiness(configPath);
 assert.equal(doctor.ok,true);assert.equal(doctor.phase,"B5");
 log("G1/G5 preflight Doctor passes on the release-candidate runtime");

 const start=await startBusiness(configPath);started=true;
 assert.equal(start.state,"RUNNING");assert.equal(start.phase,"B5");assert.equal(start.execReady,true);
 const status=await statusBusiness(configPath);
 assert.equal(status.state,"RUNNING");assert.equal(status.phase,"B5");

 let rpcId=0;
 const post=async(payload,headers={})=>{
  const r=await fetch("http://127.0.0.1:"+port+"/mcp",{
   method:"POST",
   headers:{"content-type":"application/json","accept":"application/json, text/event-stream",
    "x-chatagent-business-credential":token,...headers},
   body:JSON.stringify(payload),signal:AbortSignal.timeout(30000)
  });
  return {status:r.status,body:await r.json()};
 };
 const rpc=async(method,params={})=>post({jsonrpc:"2.0",id:++rpcId,method,params});
 const call=async(name,args)=>{
  const r=await rpc("tools/call",{name,arguments:args});
  assert.equal(r.status,200);assert.ok(!r.body.error,JSON.stringify(r.body));
  return {value:r.body.result.structuredContent,isError:r.body.result.isError===true};
 };
 const decode=v=>Buffer.from(v.outputBase64??"","base64").toString("utf8");
 const runToEnd=async(command,args={})=>{
  const first=await call("exec_command",{projectId:"dev",command,...args});
  assert.equal(first.isError,false,JSON.stringify(first.value));
  let value=first.value,output=decode(value),cursor=value.nextSeq;
  for(let i=0;i<120&&(value.state==="running"||value.hasMore);i++){
   const next=await call("read_process",{projectId:"dev",sessionId:value.sessionId,
    afterSeq:cursor,waitMs:500,maxOutputBytes:524288});
   assert.equal(next.isError,false,JSON.stringify(next.value));
   value=next.value;output+=decode(value);cursor=value.nextSeq;
  }
  assert.notEqual(value.state,"running","exec session did not settle");
  return {value,output};
 };

 let response=await rpc("initialize",{protocolVersion:"2025-03-26",capabilities:{},
  clientInfo:{name:"business-b6-release-e2e",version:"1"}});
 assert.equal(response.status,200);assert.ok(!response.body.error,JSON.stringify(response.body));
 response=await rpc("tools/list",{});
 const names=response.body.result.tools.map(x=>x.name);
 assert.deepEqual(names,[
  "business_status","list_directory","stat_path","read_file","hash_file",
  "make_directory","create_file","replace_file","apply_patch",
  "continuity_open","continuity_start_task","continuity_checkpoint",
  "continuity_prepare_handoff","continuity_complete_task",
  "exec_command","read_process","terminate_process"
 ]);
 assert.equal(names.some(n=>/delete|set_profile|docker|service|install|git_push|git_commit/.test(n)),false);
 log("G1 contract exposes the exact fixed 17-tool v1 candidate and no legacy/forbidden surface");

 // E1 Read
 const projectStatus=await call("business_status",{});
 assert.equal(projectStatus.isError,false);
 assert.deepEqual(projectStatus.value.projects.map(p=>p.projectId),["dev","docs","ops"]);
 const listed=await call("list_directory",{projectId:"docs"});
 assert.equal(listed.isError,false);assert.equal(listed.value.entries.some(e=>e.name==="policy.txt"),true);
 const read=await call("read_file",{projectId:"docs",relativePath:"policy.txt"});
 assert.equal(read.isError,false);assert.equal(read.value.content,"READ_ONLY_POLICY\n");
 const readHash=await call("hash_file",{projectId:"docs",relativePath:"policy.txt"});
 assert.equal(readHash.isError,false);assert.equal(readHash.value.sha256,sha("READ_ONLY_POLICY\n"));
 log("E1 READ project status/list/read/hash passes");

 // E2 SAFE mutation
 const created=await call("create_file",{projectId:"ops",relativePath:"release-canary.txt",content:"CANARY_V1\n"});
 assert.equal(created.isError,false);
 const replacement=await call("replace_file",{projectId:"ops",relativePath:"release-canary.txt",
  content:"CANARY_V2\n",expectedSha256:created.value.sha256});
 assert.equal(replacement.isError,false);
 const verified=await call("hash_file",{projectId:"ops",relativePath:"release-canary.txt"});
 assert.equal(verified.value.sha256,sha("CANARY_V2\n"));
 assert.equal(readFileSync(join(safeRoot,"release-canary.txt"),"utf8"),"CANARY_V2\n");
 log("E2 SAFE create + Safe Replace + hash/postcondition verification passes");

 // E3 Continuity A -> fresh B
 const task=await call("continuity_start_task",{projectId:"ops",objective:"B6 release handoff",
  operationId:randomUUID()});
 assert.equal(task.isError,false);
 const checkpoint=await call("continuity_checkpoint",{projectId:"ops",taskId:task.value.taskId,
  expectedTaskRevision:0,operationId:randomUUID(),summary:"Release canary state",
  currentState:"Ready for fresh conversation",nextActions:["Resume and verify digest"],
  verification:"B6 Conversation A",decisions:["Keep v1 contract fixed"],facts:["G1-G3 local gates active"]});
 assert.equal(checkpoint.isError,false);assert.equal(checkpoint.value.revision,1);
 const handoff=await call("continuity_prepare_handoff",{projectId:"ops",taskId:task.value.taskId});
 assert.equal(handoff.isError,false);assert.equal(handoff.value.freshness,"FRESH");
 const freshB=await call("continuity_open",{projectId:"ops",taskId:task.value.taskId,
  expectedContextDigest:handoff.value.contextDigest});
 assert.equal(freshB.isError,false);assert.equal(freshB.value.freshness,"FRESH");
 assert.equal(freshB.value.objective,"B6 release handoff");
 log("E3 Conversation A -> fresh stateless Conversation B continuity passes");

 // E4 STANDARD edit -> test -> repair -> rerun
 const source=await call("read_file",{projectId:"dev",relativePath:"value.json"});
 assert.equal(source.isError,false);assert.equal(source.value.content,'{"answer":41}\n');
 const failedTest=await runToEnd("npm test",{yieldTimeMs:10000,timeoutMs:30000});
 assert.equal(failedTest.value.state,"completed");assert.equal(failedTest.value.exitCode,2);
 assert.match(failedTest.output,/EXPECTED_42:41/);
 const before=await call("hash_file",{projectId:"dev",relativePath:"value.json"});
 assert.equal(before.isError,false);
 const repair=await call("replace_file",{projectId:"dev",relativePath:"value.json",
  content:'{"answer":42}\n',expectedSha256:before.value.sha256});
 assert.equal(repair.isError,false);
 const passedTest=await runToEnd("npm test",{yieldTimeMs:10000,timeoutMs:30000});
 assert.equal(passedTest.value.state,"completed");assert.equal(passedTest.value.exitCode,0,passedTest.output);
 assert.match(passedTest.output,/TEST_PASS_42/);
 for(let i=0;i<4;i++){
  const h=await call("hash_file",{projectId:"dev",relativePath:"value.json"});
  assert.equal(h.isError,false);
  const swap=await call("replace_file",{projectId:"dev",relativePath:"value.json",
   content:'{"answer":42}\n',expectedSha256:h.value.sha256});
  assert.equal(swap.isError,false);
  const immediate=await runToEnd("node -e 'const v=require(\"./value.json\"); if(v.answer!==42) process.exit(9); console.log(\"IMMEDIATE_OK\")'",
   {yieldTimeMs:5000,timeoutMs:15000});
  assert.equal(immediate.value.exitCode,0,immediate.output);
  assert.match(immediate.output,/IMMEDIATE_OK/);
 }
 log("E4 STANDARD edit/test/repair passes plus repeated immediate Safe Replace -> exec mount-settling stress");

 // E5 Safety
 const stale=await call("replace_file",{projectId:"ops",relativePath:"release-canary.txt",
  content:"STALE_SHOULD_NOT_COMMIT\n",expectedSha256:created.value.sha256});
 assert.equal(stale.isError,true);assert.equal(stale.value.code,"BUSINESS_WRITE_CONFLICT");
 assert.equal(readFileSync(join(safeRoot,"release-canary.txt"),"utf8"),"CANARY_V2\n");
 const escape=await call("read_file",{projectId:"ops",relativePath:"../read-only/policy.txt"});
 assert.equal(escape.isError,true);assert.equal(escape.value.code,"BUSINESS_RELATIVE_PATH_INVALID");
 const safeExec=await call("exec_command",{projectId:"ops",command:"echo SHOULD_NOT_RUN"});
 assert.equal(safeExec.isError,true);assert.equal(safeExec.value.code,"BUSINESS_PROFILE_DENIED");
 response=await post({jsonrpc:"2.0",id:++rpcId,method:"tools/list",params:{}},
  {"x-chatagent-business-profile":"STANDARD"});
 assert.equal(response.status,400);assert.equal(response.body.error.message,"AUTHORITY_INPUT_FORBIDDEN");
 response=await rpc("tools/call",{name:"delete_file",arguments:{projectId:"ops",relativePath:"release-canary.txt"}});
 assert.equal(response.status,200);
 assert.equal(response.body.result?.isError===true||response.body.error!==undefined,true);
 assert.equal(existsSync(join(safeRoot,"release-canary.txt")),true);
 log("E5 stale write/path escape/profile elevation/delete absence/SAFE exec refusal all fail closed");

 // E6 Restart -> continuity
 await stopBusiness(configPath);started=false;
 const stopped=await statusBusiness(configPath);assert.equal(stopped.state,"STOPPED");
 const restarted=await startBusiness(configPath);started=true;
 assert.equal(restarted.phase,"B5");
 const postRestart=await call("continuity_open",{projectId:"ops",taskId:task.value.taskId,
  expectedContextDigest:handoff.value.contextDigest});
 assert.equal(postRestart.isError,false);assert.equal(postRestart.value.freshness,"FRESH");
 assert.equal(postRestart.value.objective,"B6 release handoff");
 log("E6 runtime restart preserves the correct continuity task/context");

 // G3 release-boundary backup -> disposable restore
 await stopBusiness(configPath);started=false;
 const backup=await backupBusiness(configPath,"b6-rc-backup");
 assert.equal(backup.verified,true);assert.equal(backup.excludesDeploymentCredential,true);
 const restored=await restoreBusiness(configPath,"b6-rc-backup","b6-restored");
 assert.equal(restored.verified,true);assert.equal(restored.credentialRestored,false);
 const restoredState=join(restoreRootDir,"b6-restored");
 const restoredRegistry=new BusinessRegistry(restoredState);
 assert.equal(restoredRegistry.organization().organizationId,"release-org");
 assert.deepEqual(restoredRegistry.list().map(p=>[p.projectId,p.profile]),[
  ["dev","STANDARD"],["docs","READ_ONLY"],["ops","SAFE"]
 ]);
 const restoredContinuity=new BusinessContinuity(restoredRegistry,{root:join(restoredState,"continuity")});
 const restoredContext=restoredContinuity.open({projectId:"ops",taskId:task.value.taskId,
  expectedContextDigest:handoff.value.contextDigest});
 assert.equal(restoredContext.freshness,"FRESH");
 restoredContinuity.close();
 assert.equal(readFileSync(join(backupsDir,"b6-rc-backup","business-backup-manifest.json"),"utf8").includes(token),false);
 log("G3 offline backup -> disposable restore preserves registry/continuity and excludes deployment credential");

 // Release rollback rehearsal: boot previous B5 code against restored operational state.
 rollbackWorktree=join(root,"rollback-b5-worktree");
 let wr=spawnSync("/usr/bin/git",["-C",repo,"worktree","add","--detach",rollbackWorktree,B5_COMMIT],{
  encoding:"utf8",timeout:30000
 });
 assert.equal(wr.status,0,wr.stderr);
 symlinkSync(join(repo,"node_modules"),join(rollbackWorktree,"node_modules"),"dir");
 const rollbackAuth=join(root,"rollback.key"),rollbackToken=randomBytes(32).toString("base64url");
 writeFileSync(rollbackAuth,rollbackToken,{mode:0o600});
 const rollbackPort=await freePort(),rollbackConfigPath=join(root,"rollback-operator.json");
 const rollbackConfig={
  ...config,repoRoot:rollbackWorktree,stateDir:restoredState,authFile:rollbackAuth,port:rollbackPort,
  runtimeDir:join(root,"rollback-runtime"),logsDir:join(root,"rollback-logs"),
  backupsDir:join(root,"rollback-backups"),restoreRootDir:join(root,"rollback-restores")
 };
 writeFileSync(rollbackConfigPath,JSON.stringify(rollbackConfig,null,2)+"\n",{mode:0o600});
 const rollbackOps=join(rollbackWorktree,"scripts/business/business-ops.mjs");
 const runRollback=(command,args=[])=>{
  const r=spawnSync(process.execPath,[rollbackOps,command,...args],{
   encoding:"utf8",timeout:30000,
   env:{...process.env,CHATAGENT_BUSINESS_OPERATOR_CONFIG:rollbackConfigPath}
  });
  assert.equal(r.status,0,r.stderr);
  return JSON.parse(r.stdout);
 };
 const rollbackDoctor=runRollback("doctor");assert.equal(rollbackDoctor.ok,true);
 const rollbackStart=runRollback("start");assert.equal(rollbackStart.state,"RUNNING");assert.equal(rollbackStart.phase,"B5");
 const rollbackStatus=runRollback("status");assert.equal(rollbackStatus.state,"RUNNING");assert.equal(rollbackStatus.phase,"B5");
 const rollbackStop=runRollback("stop");assert.equal(rollbackStop.state,"STOPPED");
 log("release rollback rehearsal boots the previous B5 stable code against restored state and stops cleanly");

 console.log("BUSINESS_B6_LOCAL_RELEASE_E2E=PASS");
}catch(e){
 console.error("BUSINESS_B6_LOCAL_RELEASE_E2E=FAIL "+e.stack);
 process.exitCode=1;
}finally{
 try{if(started)await stopBusiness(configPath);}catch{}
 if(rollbackWorktree){
  try{spawnSync("/usr/bin/git",["-C",repo,"worktree","remove","--force",rollbackWorktree],{encoding:"utf8",timeout:30000});}catch{}
 }
 try{
  const ids=spawnSync(dockerBinary,["ps","-aq","--filter","label=chatagent.business.product=ChatAgentBusiness"],{
   encoding:"utf8",timeout:10000
  });
  if(ids.status===0){
   for(const id of ids.stdout.trim().split(/\s+/).filter(Boolean))
    spawnSync(dockerBinary,["rm","-f",id],{encoding:"utf8",timeout:10000});
  }
 }catch{}
 await delay(300);
 rmSync(root,{recursive:true,force:true});
 console.log("test_only_fixture_cleanup=COMPLETE");
}
