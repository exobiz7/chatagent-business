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
import {BusinessAuditLedger} from "./business-audit.mjs";
import {
 doctorBusiness,startBusiness,stopBusiness,statusBusiness,backupBusiness
} from "./business-ops.mjs";

const EXEC_IMAGE_REF="node@sha256:0e0ff40c39bc087845bfb27465a0df4ea419520094bc35842ff83dd8cbe6f9b6";
const EXEC_IMAGE_ID="sha256:0e0ff40c39bc087845bfb27465a0df4ea419520094bc35842ff83dd8cbe6f9b6";
const here=fileURLToPath(new URL(".",import.meta.url));
const repo=realpathSync(fileURLToPath(new URL("../../",import.meta.url)));
const l1=join(repo,"scripts/l1");
const root=realpathSync(mkdtempSync(join(tmpdir(),"chatagent-business-b5-")));
chmodSync(root,0o700);
const state=join(root,"state"),standardRoot=join(root,"standard-project");
const standard2Root=join(root,"standard-project-2"),safeRoot=join(root,"safe-project");
const binDir=join(root,"private-bin"),runtimeDir=join(root,"runtime"),logsDir=join(root,"logs");
const backupsDir=join(root,"backups"),restoreRootDir=join(root,"restores");
mkdirSync(standardRoot);mkdirSync(standard2Root);mkdirSync(safeRoot);mkdirSync(binDir,{mode:0o700});
mkdirSync(join(standardRoot,".git"));mkdirSync(join(standard2Root,".git"));
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
const whichDocker=spawnSync("/usr/bin/which",["docker"],{encoding:"utf8"});
assert.equal(whichDocker.status,0,whichDocker.stderr);
const dockerBinary=realpathSync(whichDocker.stdout.trim()),dockerSha256=fileSha(dockerBinary);
const imageInspect=spawnSync(dockerBinary,["image","inspect",EXEC_IMAGE_REF,"--format","{{.Id}}|{{.Architecture}}|{{.Os}}"],{encoding:"utf8"});
assert.equal(imageInspect.status,0,"Pinned B5 image must be locally present: "+imageInspect.stderr);
assert.equal(imageInspect.stdout.trim(),EXEC_IMAGE_ID+"|arm64|linux");

writeFileSync(join(standardRoot,"package.json"),JSON.stringify({
 name:"b5-fixture",version:"1.0.0",private:true,scripts:{test:"node test.js"}
},null,2)+"\n",{mode:0o600});
writeFileSync(join(standardRoot,"value.json"),'{"answer":41}\n',{mode:0o600});
writeFileSync(join(standardRoot,"test.js"),
 'const v=require("./value.json"); if(v.answer!==42){console.error("EXPECTED_42:"+v.answer);process.exit(2)} console.log("TEST_PASS_42")\n',
 {mode:0o600});

const registry=new BusinessRegistry(state,{initialize:true,organizationId:"acme",displayName:"ACME Labs"});
registry.addProject({projectId:"dev",displayName:"Development",hostRoot:standardRoot,profile:"STANDARD"});
registry.addProject({projectId:"dev2",displayName:"Development 2",hostRoot:standard2Root,profile:"STANDARD"});
registry.addProject({projectId:"safe",displayName:"Safe",hostRoot:safeRoot,profile:"SAFE"});
const authFile=join(root,"business.key"),token=randomBytes(32).toString("base64url");
writeFileSync(authFile,token,{mode:0o600});
const freePort=()=>new Promise((resolve,rejectPort)=>{
 const s=net.createServer();s.once("error",rejectPort);
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
const ownerId=sha(realpathSync(state)+"\0acme").slice(0,24);

let started=false;

try{
 const doctor=await doctorBusiness(configPath);
 assert.equal(doctor.ok,true);
 assert.equal(doctor.phase,"B5");
 assert.equal(doctor.checks.find(x=>x.name==="profile").status,"STANDARD_ENABLED");
 const execCheck=doctor.checks.find(x=>x.name==="exec_plane");
 assert.equal(execCheck.status,"READY_B5");assert.equal(execCheck.platform,"arm64/linux");
 assert.equal(execCheck.imageId,EXEC_IMAGE_ID);
 log("Doctor validates pinned Docker CLI and pinned ARM64 Linux exec image");

 const start=await startBusiness(configPath);started=true;
 assert.equal(start.state,"RUNNING");assert.equal(start.phase,"B5");assert.equal(start.execReady,true);
 const running=await statusBusiness(configPath);
 assert.equal(running.state,"RUNNING");assert.equal(running.phase,"B5");
 assert.equal(running.execReady,true);assert.equal(running.execHealthy,true);
 log("B5 operator starts an instance-bound STANDARD-capable runtime");

 let rpcId=0;
 const post=async(payload,headers={})=>{
  const r=await fetch("http://127.0.0.1:"+port+"/mcp",{
   method:"POST",headers:{"content-type":"application/json","accept":"application/json, text/event-stream",
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
  if(first.isError)return first;
  let value=first.value,output=decode(value),cursor=value.nextSeq;
  for(let i=0;i<120&&(value.state==="running"||value.hasMore);i++){
   const next=await call("read_process",{projectId:"dev",sessionId:value.sessionId,
    afterSeq:cursor,waitMs:500,maxOutputBytes:524288});
   assert.equal(next.isError,false);
   value=next.value;output+=decode(value);cursor=value.nextSeq;
  }
  assert.notEqual(value.state,"running","exec session did not settle");
  return {isError:false,value,output};
 };

 let response=await rpc("initialize",{protocolVersion:"2025-03-26",capabilities:{},
  clientInfo:{name:"business-b5-test",version:"1"}});
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
 const status=await call("business_status",{});
 assert.equal(status.value.phase,"B5");assert.equal(status.value.exec,"READY_B5");
 assert.equal(status.value.ops,"LOCAL_OPERATOR_B5");
 log("B5 publishes the accepted fixed 17-tool contract");

 const safeDenied=await call("exec_command",{projectId:"safe",command:"echo DENIED"});
 assert.equal(safeDenied.isError,true);assert.equal(safeDenied.value.code,"BUSINESS_PROFILE_DENIED");
 const cwdDenied=await call("exec_command",{projectId:"dev",command:"pwd",cwd:"../"});
 assert.equal(cwdDenied.isError,true);assert.equal(cwdDenied.value.code,"EXEC_CWD_INVALID");
 response=await rpc("tools/call",{name:"exec_command",arguments:{
  projectId:"dev",command:"env",env:{HOST_SECRET:"x"}
 }});
 assert.equal(response.status,200);
 assert.equal(response.body.result?.isError===true||response.body.error!==undefined,true);
 log("SAFE profile, cwd escape and caller environment injection are denied");

 const isolationCommand=[
  "printf 'UID='; id -u",
  "if [ -S /var/run/docker.sock ] || [ -S /run/docker.sock ]; then echo DOCKER_SOCKET_PRESENT; exit 20; else echo DOCKER_SOCKET_ABSENT; fi",
  "node -e 'const b=Object.keys(process.env).filter(k=>/(TOKEN|CREDENTIAL|SECRET|API_KEY)/i.test(k)); console.log(\"SECRET_ENV_KEYS=\"+b.join(\",\")); process.exit(b.length?21:0)'",
  "if touch /usr/local/B5_ROOTFS_TEST 2>/dev/null; then echo ROOTFS_WRITABLE; exit 22; else echo ROOTFS_BLOCKED; fi",
  "printf 'PIDS='; cat /sys/fs/cgroup/pids.max",
  "node -e 'const n=require(\"net\");const s=n.connect({host:\"1.1.1.1\",port:53});let done=false;const end=(code,msg)=>{if(done)return;done=true;console.log(msg);s.destroy();process.exit(code)};s.on(\"connect\",()=>end(23,\"NETWORK_CONNECTED\"));s.on(\"error\",e=>end(0,\"NETWORK_BLOCKED:\"+e.code));setTimeout(()=>end(24,\"NETWORK_TIMEOUT\"),1200)'"
 ].join("\n");
 const isolated=await runToEnd(isolationCommand,{yieldTimeMs:5000,timeoutMs:10000});
 assert.equal(isolated.isError,false);assert.equal(isolated.value.state,"completed");
 assert.equal(isolated.value.exitCode,0,isolated.output);
 assert.match(isolated.output,/UID=(\d+)/);
 const isolatedUid=Number(isolated.output.match(/UID=(\d+)/)[1]);assert.notEqual(isolatedUid,0);
 assert.match(isolated.output,/DOCKER_SOCKET_ABSENT/);
 assert.match(isolated.output,/SECRET_ENV_KEYS=\s*(?:\n|$)/);
 assert.match(isolated.output,/ROOTFS_BLOCKED/);
 assert.match(isolated.output,/PIDS=128/);
 assert.match(isolated.output,/NETWORK_BLOCKED:/);
 assert.equal(isolated.output.includes(token),false);
 log("actual container is non-root, read-only-rootfs, pids-bounded, network-none, socket/secret-free");

 const gitDenied=await runToEnd("printf x > .git/B5_WRITE_SHOULD_FAIL",{yieldTimeMs:5000});
 assert.equal(gitDenied.value.state,"completed");assert.notEqual(gitDenied.value.exitCode,0);
 assert.equal(existsSync(join(standardRoot,".git","B5_WRITE_SHOULD_FAIL")),false);
 log(".git is a nested read-only mount inside the writable selected project");

 const longRun=await call("exec_command",{projectId:"dev",command:"sleep 8",yieldTimeMs:0,timeoutMs:12000});
 assert.equal(longRun.isError,false);assert.equal(longRun.value.state,"running");
 const wrongProject=await call("read_process",{projectId:"dev2",sessionId:longRun.value.sessionId,waitMs:0});
 assert.equal(wrongProject.isError,true);assert.equal(wrongProject.value.code,"EXEC_SESSION_UNKNOWN");
 const safeRead=await call("read_process",{projectId:"safe",sessionId:longRun.value.sessionId,waitMs:0});
 assert.equal(safeRead.isError,true);assert.equal(safeRead.value.code,"BUSINESS_PROFILE_DENIED");
 const busy=await call("exec_command",{projectId:"dev",command:"echo SECOND",yieldTimeMs:0});
 assert.equal(busy.isError,true);assert.equal(busy.value.code,"EXEC_BUSY");
 const terminated=await call("terminate_process",{projectId:"dev",sessionId:longRun.value.sessionId});
 assert.equal(terminated.isError,false,JSON.stringify(terminated.value));assert.equal(terminated.value.state,"terminated");
 const terminatedRead=await call("read_process",{projectId:"dev",sessionId:longRun.value.sessionId,waitMs:0});
 assert.equal(terminatedRead.isError,false);assert.equal(terminatedRead.value.state,"terminated");
 log("session ownership, one-running-process capacity and explicit terminate are enforced");

 const timed=await call("exec_command",{projectId:"dev",command:"sleep 5",yieldTimeMs:0,timeoutMs:1000});
 assert.equal(timed.isError,false);assert.equal(timed.value.state,"running");
 let timedState=timed.value;
 for(let i=0;i<30&&timedState.state==="running";i++){
  await delay(150);
  const read=await call("read_process",{projectId:"dev",sessionId:timed.value.sessionId,waitMs:100});
  assert.equal(read.isError,false);timedState=read.value;
 }
 assert.equal(timedState.state,"timed_out");
 log("bounded timeout stops the owned container session");

 const huge=await call("exec_command",{projectId:"dev",
  command:"node -e 'process.stdout.write(\"X\".repeat(3*1024*1024))'",
  yieldTimeMs:0,timeoutMs:10000,maxOutputBytes:1024});
 assert.equal(huge.isError,false);
 await delay(1200);
 let hugeRead=await call("read_process",{projectId:"dev",sessionId:huge.value.sessionId,
  afterSeq:0,waitMs:1000,maxOutputBytes:1024});
 assert.equal(hugeRead.isError,false);
 for(let i=0;i<20&&hugeRead.value.state==="running";i++){
  await delay(100);
  hugeRead=await call("read_process",{projectId:"dev",sessionId:huge.value.sessionId,
   afterSeq:0,waitMs:200,maxOutputBytes:1024});
 }
 assert.equal(hugeRead.value.state,"completed");
 assert.equal(hugeRead.value.exitCode,0);
 assert.equal(hugeRead.value.truncated,true);
 assert.ok(Buffer.from(hugeRead.value.outputBase64,"base64").length<=1024);
 assert.equal(hugeRead.value.hasMore,true);
 log("retained output and per-read output are both bounded with explicit truncation");

 const source=await call("read_file",{projectId:"dev",relativePath:"value.json"});
 assert.equal(source.isError,false);assert.equal(source.value.content,'{"answer":41}\n');
 const failedTest=await runToEnd("npm test",{yieldTimeMs:10000,timeoutMs:30000});
 assert.equal(failedTest.value.state,"completed");assert.equal(failedTest.value.exitCode,2);
 assert.match(failedTest.output,/EXPECTED_42:41/);
 const beforeHash=await call("hash_file",{projectId:"dev",relativePath:"value.json"});
 assert.equal(beforeHash.isError,false);
 const repaired=await call("replace_file",{projectId:"dev",relativePath:"value.json",
  content:'{"answer":42}\n',expectedSha256:beforeHash.value.sha256});
 assert.equal(repaired.isError,false);
 assert.equal(readFileSync(join(standardRoot,"value.json"),"utf8"),'{"answer":42}\n');
 const passedTest=await runToEnd("npm test",{yieldTimeMs:10000,timeoutMs:30000});
 assert.equal(passedTest.value.state,"completed");assert.equal(passedTest.value.exitCode,0,passedTest.output);
 assert.match(passedTest.output,/TEST_PASS_42/);
 log("accepted dev loop passes: read -> failing test -> Safe Replace repair -> rerun pass");

 const commandMarker="EXEC_COMMAND_MARKER_"+randomUUID();
 const markerRun=await runToEnd("echo "+commandMarker,{yieldTimeMs:5000});
 assert.equal(markerRun.value.exitCode,0);assert.match(markerRun.output,new RegExp(commandMarker));
 const auditPath=join(state,"audit","audit.jsonl");
 const ledger=new BusinessAuditLedger(join(state,"audit"));
 const events=ledger.readRecent(200);
 assert.ok(events.some(e=>e.tool==="exec_command"&&e.projectId==="dev"&&e.resultCode==="OK"&&e.effectClass==="EXEC_START"));
 assert.ok(events.some(e=>e.tool==="exec_command"&&e.projectId==="safe"&&e.resultCode==="BUSINESS_PROFILE_DENIED"));
 assert.ok(events.some(e=>e.tool==="terminate_process"&&e.projectId==="dev"&&e.resultCode==="OK"&&e.effectClass==="EXEC_TERMINATE"));
 const auditText=readFileSync(auditPath,"utf8");
 for(const secret of [token,commandMarker,"npm test","EXPECTED_42"])
  assert.equal(auditText.includes(secret),false);
 log("exec audit records effect metadata/results without command text, output or credential");

 const persistent=await call("exec_command",{projectId:"dev",command:"sleep 30",yieldTimeMs:0,timeoutMs:60000});
 assert.equal(persistent.isError,false);assert.equal(persistent.value.state,"running");
 const stopped=await stopBusiness(configPath);started=false;
 assert.equal(stopped.state,"STOPPED");
 const ownedAfterStop=spawnSync(dockerBinary,["ps","-aq",
  "--filter","label=chatagent.business.product=ChatAgentBusiness",
  "--filter","label=chatagent.business.owner="+ownerId],{encoding:"utf8",timeout:10000});
 assert.equal(ownedAfterStop.status,0,ownedAfterStop.stderr);
 assert.equal(ownedAfterStop.stdout.trim(),"");
 log("runtime Stop terminates and removes owned exec containers");

 const restarted=await startBusiness(configPath);started=true;
 assert.equal(restarted.phase,"B5");assert.equal(restarted.execReady,true);
 response=await rpc("initialize",{protocolVersion:"2025-03-26",capabilities:{},
  clientInfo:{name:"business-b5-restart-test",version:"1"}});
 assert.equal(response.status,200);assert.ok(!response.body.error,JSON.stringify(response.body));
 const oldSession=await call("read_process",{projectId:"dev",sessionId:persistent.value.sessionId,waitMs:0});
 assert.equal(oldSession.isError,true);assert.equal(oldSession.value.code,"EXEC_SESSION_UNKNOWN");
 log("exec sessions are intentionally non-durable across control-plane recreation");

 await stopBusiness(configPath);started=false;
 const backup=await backupBusiness(configPath,"b5-backup");
 assert.equal(backup.verified,true);
 const nonSecret=JSON.parse(readFileSync(join(backupsDir,"b5-backup","non-secret-config.json"),"utf8"));
 assert.equal(nonSecret.execEnabled,true);
 assert.equal(nonSecret.execImageRef,EXEC_IMAGE_REF);assert.equal(nonSecret.execImageId,EXEC_IMAGE_ID);
 assert.equal(JSON.stringify(nonSecret).includes(dockerBinary),false);
 assert.equal(JSON.stringify(nonSecret).includes(authFile),false);
 assert.equal(JSON.stringify(nonSecret).includes(token),false);
 log("offline operational backup records pinned exec image identity but no Docker/auth absolute path or credential");

 const brokenPath=join(root,"operator-broken-exec.json");
 const broken={...config,exec:{...config.exec,imageId:"sha256:"+"0".repeat(64)}};
 writeFileSync(brokenPath,JSON.stringify(broken,null,2)+"\n",{mode:0o600});
 const brokenDoctor=await doctorBusiness(brokenPath);
 assert.equal(brokenDoctor.ok,false);
 assert.equal(brokenDoctor.checks.find(x=>x.name==="exec_plane").status,"EXEC_IMAGE_ID_MISMATCH");
 log("Doctor detects exec image identity mismatch before Start");

 const unsafeModePath=join(root,"operator-safe-with-exec.json");
 const unsafeMode={...config,safePilotMode:true};
 writeFileSync(unsafeModePath,JSON.stringify(unsafeMode,null,2)+"\n",{mode:0o600});
 const unsafeDoctor=await doctorBusiness(unsafeModePath);
 assert.equal(unsafeDoctor.ok,false);
 assert.equal(unsafeDoctor.checks.find(x=>x.name==="profile").status,"OPS_SAFE_PILOT_EXEC_DENIED");
 log("SAFE-pilot mode cannot silently enable the STANDARD exec plane");

 console.log("BUSINESS_B5_ISOLATED_STANDARD_EXEC=PASS");
}catch(e){
 console.error("BUSINESS_B5_ISOLATED_STANDARD_EXEC=FAIL "+e.stack);
 process.exitCode=1;
}finally{
 try{if(started)await stopBusiness(configPath);}catch{}
 try{
  const ids=spawnSync(dockerBinary,["ps","-aq",
   "--filter","label=chatagent.business.product=ChatAgentBusiness",
   "--filter","label=chatagent.business.owner="+ownerId],{encoding:"utf8",timeout:10000});
  if(ids.status===0){
   for(const id of ids.stdout.trim().split(/\s+/).filter(Boolean))
    spawnSync(dockerBinary,["rm","-f",id],{encoding:"utf8",timeout:10000});
  }
 }catch{}
 await delay(300);
 rmSync(root,{recursive:true,force:true});
 console.log("test_only_fixture_cleanup=COMPLETE");
}
