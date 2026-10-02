import {fileURLToPath} from "node:url";
import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
import {
 chmodSync,mkdtempSync,mkdirSync,readFileSync,realpathSync,rmSync,writeFileSync,
 existsSync,readdirSync,lstatSync
} from "node:fs";
import {tmpdir} from "node:os";
import {dirname,join} from "node:path";
import {createHash,randomBytes,randomUUID} from "node:crypto";
import net from "node:net";
import {setTimeout as delay} from "node:timers/promises";
import {BusinessRegistry} from "./business-core.mjs";
import {BusinessContinuity} from "./business-continuity.mjs";
import {BusinessAuditLedger} from "./business-audit.mjs";
import {
 doctorBusiness,startBusiness,stopBusiness,statusBusiness,backupBusiness,restoreBusiness
} from "./business-ops.mjs";

const here=fileURLToPath(new URL(".",import.meta.url));
const repo=realpathSync(fileURLToPath(new URL("../../",import.meta.url)));
const l1=join(repo,"scripts/l1");
const root=realpathSync(mkdtempSync(join(tmpdir(),"chatagent-business-b4-")));
chmodSync(root,0o700);
const state=join(root,"state"),safeRoot=join(root,"safe-project"),roRoot=join(root,"read-only");
const binDir=join(root,"private-bin"),runtimeDir=join(root,"runtime"),logsDir=join(root,"logs");
const backupsDir=join(root,"backups"),restoreRootDir=join(root,"restores");
mkdirSync(safeRoot);mkdirSync(roRoot);mkdirSync(binDir,{mode:0o700});
const sha=v=>createHash("sha256").update(v).digest("hex");
const fileSha=p=>sha(readFileSync(p));
const log=x=>console.log("PASS "+x);
const reject=async(fn,code)=>{try{await fn();assert.fail("expected "+code);}
 catch(e){if(e?.code==="ERR_ASSERTION")throw e;assert.match(String(e?.message),new RegExp(code));return e;}};

const compile=(source,target,args=[])=>{
 const r=spawnSync("/usr/bin/clang",["-Wall","-Wextra","-Werror","-O2",...args,source,"-o",target],{encoding:"utf8"});
 assert.equal(r.status,0,r.stderr);chmodSync(target,0o700);return fileSha(target);
};
const createBin=join(binDir,"create"),replaceBin=join(binDir,"replace"),mkdirBin=join(binDir,"mkdir");
const publishBin=join(binDir,"publish");
const native={
 create:{path:createBin,sha256:compile(join(l1,"native-create-excl.c"),createBin)},
 replace:{path:replaceBin,sha256:compile(join(l1,"native-replace-cas.c"),replaceBin,["-framework","Security"])},
 mkdir:{path:mkdirBin,sha256:compile(join(here,"native-mkdir-excl.c"),mkdirBin)},
 publish:{path:publishBin,sha256:compile(join(l1,"native-restore-publish.c"),publishBin)}
};

const registry=new BusinessRegistry(state,{initialize:true,organizationId:"acme",displayName:"ACME Labs"});
registry.addProject({projectId:"safe",displayName:"Safe",hostRoot:safeRoot,profile:"SAFE"});
registry.addProject({projectId:"ro",displayName:"Read only",hostRoot:roRoot,profile:"READ_ONLY"});
const authFile=join(root,"business.key"),token=randomBytes(32).toString("base64url");
writeFileSync(authFile,token,{mode:0o600});
const freePort=()=>new Promise((resolve,rejectPort)=>{
 const s=net.createServer();s.once("error",rejectPort);
 s.listen(0,"127.0.0.1",()=>{const p=s.address().port;s.close(()=>resolve(p));});
});
const port=await freePort();
const configPath=join(root,"operator.json");
const config={
 schemaVersion:1,expectedNodeVersion:process.version,nodeBinary:process.execPath,repoRoot:repo,
 stateDir:state,authFile,port,continuityEnabled:true,auditEnabled:true,safePilotMode:true,
 runtimeDir,logsDir,backupsDir,restoreRootDir,tunnelHealthUrl:null,native
};
writeFileSync(configPath,JSON.stringify(config,null,2)+"\n",{mode:0o600});

let started=false,restoredStarted=false,standardConfigPath=null;
try{
 const rotation=new BusinessAuditLedger(join(root,"audit-rotation"),{maxBytes:1024,maxArchives:2});
 for(let i=0;i<12;i++)rotation.append({
  organizationId:"acme",projectId:"safe",profile:"SAFE",tool:"create_file",effectClass:"CREATE",
  targetRelativePath:"x".repeat(300)+i,preconditionDigest:null,resultCode:"OK"
 });
 const rotationFiles=readdirSync(join(root,"audit-rotation")).filter(n=>n.startsWith("audit."));
 assert.ok(rotationFiles.includes("audit.1.jsonl"));
 assert.ok(rotationFiles.filter(n=>/^audit\.\d+\.jsonl$/.test(n)).length<=2);
 log("audit ledger rotates only bounded internal archive slots");

 const pre=await doctorBusiness(configPath);
 assert.equal(pre.ok,true);
 assert.equal(pre.checks.find(x=>x.name==="profile").status,"SAFE_PILOT");
 assert.equal(pre.checks.find(x=>x.name==="continuity").status,"WILL_INITIALIZE_ON_START");
 assert.equal(pre.checks.find(x=>x.name==="audit").status,"WILL_INITIALIZE_ON_START");
 assert.equal(pre.checks.find(x=>x.name==="exec_plane").status,"NOT_IMPLEMENTED_B4");
 log("Doctor passes stopped SAFE pilot preflight without pretending exec exists");

 const start=await startBusiness(configPath);started=true;
 assert.equal(start.state,"RUNNING");assert.equal(start.phase,"B4");
 assert.equal(start.safePilotMode,true);assert.equal(start.auditReady,true);
 const running=await statusBusiness(configPath);
 assert.equal(running.state,"RUNNING");assert.equal(running.healthy,true);assert.equal(running.phase,"B4");
 log("Start/Status launch owned B4 runtime with instance-bound health");

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
  clientInfo:{name:"business-b4-test",version:"1"}});
 assert.equal(response.status,200);assert.ok(!response.body.error,JSON.stringify(response.body));
 response=await rpc("tools/list",{});
 const names=response.body.result.tools.map(x=>x.name);
 assert.equal(names.length,14);assert.equal(names.some(n=>n.includes("exec")),false);
 const status=await call("business_status",{});
 assert.equal(status.value.phase,"B4");assert.equal(status.value.audit,"READY_B4");
 assert.equal(status.value.ops,"LOCAL_OPERATOR_B4");assert.equal(status.value.exec,"NOT_IMPLEMENTED_B4");
 log("SAFE pilot MCP remains 14 tools with B4 audit/ops readiness and no exec surface");

 const contentMarker="CONTENT_MARKER_"+randomUUID();
 const created=await call("create_file",{projectId:"safe",relativePath:"pilot.txt",content:contentMarker});
 assert.equal(created.isError,false);
 const replaced=await call("replace_file",{projectId:"safe",relativePath:"pilot.txt",
  content:"UPDATED_PILOT",expectedSha256:created.value.sha256});
 assert.equal(replaced.isError,false);
 const roDenied=await call("create_file",{projectId:"ro",relativePath:"denied.txt",content:"DENIED"});
 assert.equal(roDenied.isError,true);assert.equal(roDenied.value.code,"BUSINESS_PROFILE_DENIED");
 const objectiveMarker="OBJECTIVE_MARKER_"+randomUUID();
 const task=await call("continuity_start_task",{projectId:"safe",objective:objectiveMarker,
  operationId:randomUUID()});
 assert.equal(task.isError,false);
 const checkpoint=await call("continuity_checkpoint",{projectId:"safe",taskId:task.value.taskId,
  expectedTaskRevision:0,operationId:randomUUID(),summary:"Pilot checkpoint summary",
  currentState:"SAFE pilot active",nextActions:["Restart and resume"],verification:"B4 local pilot"});
 assert.equal(checkpoint.isError,false);
 const handoff=await call("continuity_prepare_handoff",{projectId:"safe",taskId:task.value.taskId});
 assert.equal(handoff.isError,false);assert.equal(handoff.value.freshness,"FRESH");
 log("actual SAFE file + continuity pilot workflow passes through B4 runtime");

 const auditPath=join(state,"audit","audit.jsonl");
 const ledger=new BusinessAuditLedger(join(state,"audit"));
 let events=ledger.readRecent(100);
 assert.ok(events.some(e=>e.tool==="create_file"&&e.projectId==="safe"&&e.resultCode==="OK"));
 assert.ok(events.some(e=>e.tool==="replace_file"&&e.preconditionDigest===created.value.sha256&&e.resultCode==="OK"));
 assert.ok(events.some(e=>e.tool==="create_file"&&e.projectId==="ro"&&e.resultCode==="BUSINESS_PROFILE_DENIED"));
 assert.ok(events.some(e=>e.tool==="continuity_start_task"&&e.resultCode==="OK"));
 assert.ok(events.some(e=>e.tool==="continuity_checkpoint"&&e.resultCode==="OK"));
 assert.equal(events.some(e=>["read_file","hash_file","continuity_prepare_handoff"].includes(e.tool)),false);
 const auditText=readFileSync(auditPath,"utf8");
 for(const secret of [token,contentMarker,objectiveMarker,"Pilot checkpoint summary"])
  assert.equal(auditText.includes(secret),false);
 log("audit records effect metadata and denials without content, objectives or deployment credential");

 chmodSync(auditPath,0o400);
 const uncertain=await call("create_file",{projectId:"safe",relativePath:"audit-uncertain.txt",content:"COMMITTED_ONCE"});
 assert.equal(uncertain.isError,true);
 assert.equal(uncertain.value.code,"BUSINESS_AUDIT_UNCERTAIN");
 assert.equal(uncertain.value.effect,"COMMITTED");
 assert.equal(uncertain.value.audit,"UNCERTAIN");
 assert.equal(uncertain.value.retryable,false);
 assert.equal(readFileSync(join(safeRoot,"audit-uncertain.txt"),"utf8"),"COMMITTED_ONCE");
 chmodSync(auditPath,0o600);
 const noReplay=await call("create_file",{projectId:"safe",relativePath:"audit-uncertain.txt",content:"RETRY"});
 assert.equal(noReplay.isError,true);assert.equal(noReplay.value.code,"BUSINESS_DESTINATION_EXISTS");
 assert.equal(readFileSync(join(safeRoot,"audit-uncertain.txt"),"utf8"),"COMMITTED_ONCE");
 log("committed mutation + audit failure is explicit non-retryable audit uncertainty");

 const firstStop=await stopBusiness(configPath);started=false;
 assert.equal(firstStop.state,"STOPPED");
 assert.equal((await statusBusiness(configPath)).state,"STOPPED");
 writeFileSync(join(logsDir,"business.log"),"L".repeat(1100000),{mode:0o600});
 const restarted=await startBusiness(configPath);started=true;
 assert.equal(restarted.state,"RUNNING");assert.equal(restarted.phase,"B4");
 assert.equal(existsSync(join(logsDir,"business.log.1")),true);
 assert.ok(lstatSync(join(logsDir,"business.log.1")).size>1024*1024);
 const resumed=await call("continuity_open",{projectId:"safe",taskId:task.value.taskId,
  expectedContextDigest:handoff.value.contextDigest});
 assert.equal(resumed.isError,false);assert.equal(resumed.value.freshness,"FRESH");
 const cp2=await call("continuity_checkpoint",{projectId:"safe",taskId:task.value.taskId,
  expectedTaskRevision:1,operationId:randomUUID(),summary:"Restart survived",
  currentState:"Runtime restarted cleanly",nextActions:["Backup and restore"],
  verification:"Fresh MCP call after restart"});
 assert.equal(cp2.isError,false);assert.equal(cp2.value.revision,2);
 const handoff2=await call("continuity_prepare_handoff",{projectId:"safe",taskId:task.value.taskId});
 assert.equal(handoff2.isError,false);assert.equal(handoff2.value.freshness,"FRESH");
 assert.notEqual(handoff2.value.contextDigest,handoff.value.contextDigest);
 events=new BusinessAuditLedger(join(state,"audit")).readRecent(100);
 assert.ok(events.filter(e=>e.tool==="continuity_checkpoint"&&e.resultCode==="OK").length>=2);
 log("Stop/Start preserves continuity and audit; Start performs bounded log rotation");

 await stopBusiness(configPath);started=false;
 const backup=await backupBusiness(configPath,"pilot-backup");
 assert.equal(backup.verified,true);assert.equal(backup.excludesDeploymentCredential,true);
 assert.equal(backup.containsContinuitySealKey,true);
 const backupDir=join(backupsDir,"pilot-backup");
 assert.equal(existsSync(join(backupDir,"business-backup-manifest.json")),true);

 const allFiles=dir=>{
  const out=[];
  for(const name of readdirSync(dir)){
   const path=join(dir,name),st=lstatSync(path);
   if(st.isDirectory())out.push(...allFiles(path));
   else if(st.isFile())out.push(path);
  }
  return out;
 };
 for(const file of allFiles(backupDir))
  assert.equal(readFileSync(file).includes(Buffer.from(token)),false);
 const manifest=JSON.parse(readFileSync(join(backupDir,"business-backup-manifest.json"),"utf8"));
 assert.equal(manifest.excludesDeploymentCredential,true);
 assert.equal(manifest.containsContinuitySealKey,true);
 assert.equal(manifest.includesNonSecretConfig,true);
 assert.equal(existsSync(join(backupDir,"non-secret-config.json")),true);
 const nonSecret=JSON.parse(readFileSync(join(backupDir,"non-secret-config.json"),"utf8"));
 assert.equal(nonSecret.safePilotMode,true);assert.equal(nonSecret.auditEnabled,true);
 assert.equal("authFile" in nonSecret,false);assert.equal("stateDir" in nonSecret,false);
 assert.equal(Object.keys(manifest.files).some(n=>n.includes("business.key")||n.includes("credential")),false);
 log("offline backup is verified, excludes deployment credential and preserves non-secret operator policy");

 const restore=await restoreBusiness(configPath,"pilot-backup","pilot-restore");
 assert.equal(restore.verified,true);assert.equal(restore.credentialRestored,false);
 const restoredState=join(restoreRootDir,"pilot-restore");
 const restoredRegistry=new BusinessRegistry(restoredState);
 assert.equal(restoredRegistry.organization().organizationId,"acme");
 assert.equal(restoredRegistry.inspect("safe").profile,"SAFE");
 const restoredContinuity=new BusinessContinuity(restoredRegistry,{root:join(restoredState,"continuity")});
 const restoredTask=restoredContinuity.open({projectId:"safe",taskId:task.value.taskId,
  expectedContextDigest:handoff2.value.contextDigest});
 assert.equal(restoredTask.freshness,"FRESH");
 assert.equal(restoredTask.lastCheckpoint.currentState,"Runtime restarted cleanly");
 restoredContinuity.close();
 assert.ok(new BusinessAuditLedger(join(restoredState,"audit")).readRecent(100).length>=events.length);
 await reject(()=>restoreBusiness(configPath,"pilot-backup","pilot-restore"),"BUSINESS_BACKUP_DESTINATION_EXISTS");
 log("disposable restore reproduces registry, continuity and audit into a new root without overwrite");

 const restoredPort=await freePort();
 const restoredConfigPath=join(root,"operator-restored.json");
 const restoredConfig={...config,stateDir:restoredState,port:restoredPort,
  runtimeDir:join(root,"restored-runtime"),logsDir:join(root,"restored-logs"),
  backupsDir:join(root,"restored-backups"),restoreRootDir:join(root,"restored-restores")};
 writeFileSync(restoredConfigPath,JSON.stringify(restoredConfig,null,2)+"\n",{mode:0o600});
 const restoredDoctor=await doctorBusiness(restoredConfigPath);
 assert.equal(restoredDoctor.ok,true);
 const restoredStart=await startBusiness(restoredConfigPath);restoredStarted=true;
 assert.equal(restoredStart.state,"RUNNING");assert.equal(restoredStart.phase,"B4");
 let restoredRpcId=0;
 const restoredPost=async(payload)=>{
  const r=await fetch("http://127.0.0.1:"+restoredPort+"/mcp",{
   method:"POST",headers:{"content-type":"application/json","accept":"application/json, text/event-stream",
    "x-chatagent-business-credential":token},
   body:JSON.stringify(payload),signal:AbortSignal.timeout(10000)
  });
  return {status:r.status,body:await r.json()};
 };
 const restoredCall=async(name,args)=>{
  const r=await restoredPost({jsonrpc:"2.0",id:++restoredRpcId,method:"tools/call",
   params:{name,arguments:args}});
  assert.equal(r.status,200);assert.ok(!r.body.error,JSON.stringify(r.body));
  return {value:r.body.result.structuredContent,isError:r.body.result.isError===true};
 };
 const restoredOpen=await restoredCall("continuity_open",{projectId:"safe",taskId:task.value.taskId,
  expectedContextDigest:handoff2.value.contextDigest});
 assert.equal(restoredOpen.isError,false);assert.equal(restoredOpen.value.freshness,"FRESH");
 assert.equal(restoredOpen.value.lastCheckpoint.currentState,"Runtime restarted cleanly");
 await stopBusiness(restoredConfigPath);restoredStarted=false;
 log("restored state starts as a separate B4 runtime using separately provisioned credential");

 const brokenConfigPath=join(root,"operator-broken.json");
 const brokenConfig={...config,native:{...native,create:{...native.create,sha256:"0".repeat(64)}}};
 writeFileSync(brokenConfigPath,JSON.stringify(brokenConfig,null,2)+"\n",{mode:0o600});
 const brokenDoctor=await doctorBusiness(brokenConfigPath);
 assert.equal(brokenDoctor.ok,false);
 const nativeCheck=brokenDoctor.checks.find(x=>x.name==="native_helpers");
 assert.equal(nativeCheck.ok,false);assert.equal(nativeCheck.status,"OPS_NATIVE_HELPER_HASH_MISMATCH");
 assert.equal(JSON.stringify(brokenDoctor).includes(token),false);
 log("Doctor identifies an intentionally broken pinned-helper fixture without leaking secrets");

 const nonPilotConfigPath=join(root,"operator-non-pilot.json");
 const nonPilotConfig={...config,safePilotMode:false,
  runtimeDir:join(root,"non-pilot-runtime"),logsDir:join(root,"non-pilot-logs"),
  backupsDir:join(root,"non-pilot-backups"),restoreRootDir:join(root,"non-pilot-restores")};
 writeFileSync(nonPilotConfigPath,JSON.stringify(nonPilotConfig,null,2)+"\n",{mode:0o600});
 const nonPilotDoctor=await doctorBusiness(nonPilotConfigPath);
 assert.equal(nonPilotDoctor.ok,false);
 assert.equal(nonPilotDoctor.checks.find(x=>x.name==="profile").status,"OPS_B4_SAFE_PILOT_MODE_REQUIRED");
 await reject(()=>startBusiness(nonPilotConfigPath),"OPS_PREFLIGHT_FAILED");
 log("B4 operator refuses non-SAFE-pilot mode until the later STANDARD execution unit exists");

 const stdState=join(root,"std-state"),stdProject=join(root,"standard-project");
 mkdirSync(stdProject);
 const stdRegistry=new BusinessRegistry(stdState,{initialize:true,organizationId:"std-org",displayName:"STD Org"});
 stdRegistry.addProject({projectId:"dev",displayName:"Dev",hostRoot:stdProject,profile:"STANDARD"});
 const stdPort=await freePort();
 standardConfigPath=join(root,"operator-standard.json");
 const stdConfig={...config,stateDir:stdState,port:stdPort,
  runtimeDir:join(root,"std-runtime"),logsDir:join(root,"std-logs"),
  backupsDir:join(root,"std-backups"),restoreRootDir:join(root,"std-restores")};
 writeFileSync(standardConfigPath,JSON.stringify(stdConfig,null,2)+"\n",{mode:0o600});
 const stdDoctor=await doctorBusiness(standardConfigPath);
 assert.equal(stdDoctor.ok,false);
 assert.equal(stdDoctor.checks.find(x=>x.name==="profile").status,"OPS_SAFE_PILOT_STANDARD_PROJECT_DENIED");
 await reject(()=>startBusiness(standardConfigPath),"OPS_PREFLIGHT_FAILED");
 assert.equal((await statusBusiness(standardConfigPath)).state,"STOPPED");
 log("SAFE pilot startup refuses enabled STANDARD projects before any runtime effect");

 const wrapperEnv={...process.env,CHATAGENT_BUSINESS_OPERATOR_CONFIG:configPath,
  PATH:dirname(process.execPath)+":"+(process.env.PATH??"")};
 const runWrapper=(name,args=[])=>{
  const wrapper=join(repo,"ops",name+".command");
  assert.equal((lstatSync(wrapper).mode&0o111)!==0,true);
  const result=spawnSync(wrapper,args,{encoding:"utf8",timeout:15000,env:wrapperEnv});
  assert.equal(result.status,0,result.stderr);
  return JSON.parse(result.stdout);
 };
 assert.equal(runWrapper("Status").state,"STOPPED");
 assert.equal(runWrapper("Doctor").ok,true);
 const wrappedStart=runWrapper("Start");
 assert.equal(wrappedStart.state,"RUNNING");assert.equal(wrappedStart.phase,"B4");
 assert.equal(runWrapper("Status").state,"RUNNING");
 assert.equal(runWrapper("Stop").state,"STOPPED");
 const wrappedBackup=runWrapper("Backup",["wrapper-backup"]);
 assert.equal(wrappedBackup.verified,true);
 const wrappedRestore=runWrapper("Restore",["wrapper-backup","wrapper-restore"]);
 assert.equal(wrappedRestore.verified,true);assert.equal(wrappedRestore.credentialRestored,false);
 assert.equal(new BusinessRegistry(join(restoreRootDir,"wrapper-restore")).organization().organizationId,"acme");
 log("all six clickable operator command wrappers execute against the disposable SAFE config");

 const finalDoctor=await doctorBusiness(configPath);
 assert.equal(finalDoctor.ok,true);
 assert.equal(finalDoctor.checks.find(x=>x.name==="continuity").status,"OK");
 assert.equal(finalDoctor.checks.find(x=>x.name==="audit").status,"OK");
 assert.equal(finalDoctor.checks.find(x=>x.name==="tunnel").status,"NOT_CONFIGURED_B4");
 assert.equal(finalDoctor.checks.find(x=>x.name==="exec_plane").status,"NOT_IMPLEMENTED_B4");
 for(const output of [pre,start,running,backup,restore,restoredDoctor,finalDoctor])
  assert.equal(JSON.stringify(output).includes(token),false);
 log("final Doctor verifies persisted state/audit while keeping tunnel/exec boundaries explicit");

 console.log("BUSINESS_B4_AUDIT_OPS_SAFE_PILOT=PASS");
}catch(e){
 console.error("BUSINESS_B4_AUDIT_OPS_SAFE_PILOT=FAIL "+e.stack);
 process.exitCode=1;
}finally{
 try{if(started)await stopBusiness(configPath);}catch{}
 try{
  if(restoredStarted){
   const restoredConfigPath=join(root,"operator-restored.json");
   await stopBusiness(restoredConfigPath);
  }
 }catch{}
 try{
  if(standardConfigPath&&existsSync(standardConfigPath)){
   const s=await statusBusiness(standardConfigPath);
   if(["RUNNING","RUNNING_UNHEALTHY"].includes(s.state))await stopBusiness(standardConfigPath);
  }
 }catch{}
 await delay(250);
 rmSync(root,{recursive:true,force:true});
 console.log("test_only_fixture_cleanup=COMPLETE");
}
