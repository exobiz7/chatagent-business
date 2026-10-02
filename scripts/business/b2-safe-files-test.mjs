import {fileURLToPath} from "node:url";
import assert from "node:assert/strict";
import {spawn,spawnSync} from "node:child_process";
import {chmodSync,mkdtempSync,mkdirSync,readFileSync,realpathSync,rmSync,symlinkSync,writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {createHash,randomBytes,randomUUID} from "node:crypto";
import net from "node:net";
import {setTimeout as delay} from "node:timers/promises";
import {BusinessRegistry} from "./business-core.mjs";
import {BusinessFileOps} from "./business-file-ops.mjs";

const here=fileURLToPath(new URL(".",import.meta.url));
const l1=fileURLToPath(new URL("../l1/",import.meta.url));
const root=realpathSync(mkdtempSync(join(tmpdir(),"chatagent-business-b2-")));
const state=join(root,"state"),safeRoot=join(root,"safe project"),roRoot=join(root,"read-only");
const outside=join(root,"outside"),binDir=join(root,"private-bin");
mkdirSync(safeRoot);mkdirSync(roRoot);mkdirSync(outside);mkdirSync(binDir,{mode:0o700});
const sha=v=>createHash("sha256").update(v).digest("hex");
const fileSha=p=>sha(readFileSync(p));
const log=x=>console.log("PASS "+x);
const reject=async(fn,code)=>{
 try{await fn();assert.fail("expected "+code);}catch(e){if(e?.code==="ERR_ASSERTION")throw e;assert.match(String(e?.message),new RegExp(code));return e;}
};

const compile=(source,target,args=[])=>{
 const run=spawnSync("clang",["-Wall","-Wextra","-Werror","-O2",...args,source,"-o",target],{encoding:"utf8"});
 assert.equal(run.status,0,run.stderr);chmodSync(target,0o700);return fileSha(target);
};
const createBin=join(binDir,"create"),replaceBin=join(binDir,"replace"),mkdirBin=join(binDir,"mkdir");
const createSha=compile(join(l1,"native-create-excl.c"),createBin);
const replaceSha=compile(join(l1,"native-replace-cas.c"),replaceBin,["-framework","Security"]);
const mkdirSha=compile(join(here,"native-mkdir-excl.c"),mkdirBin);
const nativeConfig={
 nativeCreateBinary:createBin,nativeCreateSha256:createSha,
 nativeReplaceBinary:replaceBin,nativeReplaceSha256:replaceSha,
 nativeMkdirBinary:mkdirBin,nativeMkdirSha256:mkdirSha
};

const registry=new BusinessRegistry(state,{initialize:true,organizationId:"acme",displayName:"ACME Labs"});
registry.addProject({projectId:"safe",displayName:"Safe",hostRoot:safeRoot,profile:"SAFE"});
registry.addProject({projectId:"ro",displayName:"Read only",hostRoot:roRoot,profile:"READ_ONLY"});
const files=new BusinessFileOps(registry,nativeConfig);
writeFileSync(join(safeRoot,"existing.txt"),"BASE\n",{mode:0o600});
writeFileSync(join(roRoot,"readonly.txt"),"READ ONLY\n",{mode:0o600});
writeFileSync(join(outside,"secret.txt"),"OUTSIDE\n",{mode:0o600});

const freePort=()=>new Promise((resolve,rejectPort)=>{
 const s=net.createServer();s.once("error",rejectPort);
 s.listen(0,"127.0.0.1",()=>{const p=s.address().port;s.close(()=>resolve(p));});
});
let server=null;

try{
 const listed=await files.listDirectory({projectId:"safe"});
 assert.equal(listed.entries.some(e=>e.name==="existing.txt"&&e.type==="file"),true);
 const stat=await files.statPath({projectId:"safe",relativePath:"existing.txt"});
 assert.equal(stat.kind,"file");
 const read=await files.readFile({projectId:"safe",relativePath:"existing.txt"});
 assert.equal(read.content,"BASE\n");
 const baseHash=await files.hashFile({projectId:"safe",relativePath:"existing.txt"});
 assert.equal(baseHash.sha256,sha("BASE\n"));
 log("READ list/stat/read/hash use projectId + relativePath without host-root output");

 const made=await files.makeDirectory({projectId:"safe",relativePath:"src"});
 assert.equal(made.commitMode,"DIRFD_MKDIR_EXCL");
 const created=await files.createFile({projectId:"safe",relativePath:"src/new.txt",content:"alpha beta\n"});
 assert.equal(created.commitMode,"DIRFD_O_EXCL");
 assert.equal(created.sha256,sha("alpha beta\n"));
 const replaced=await files.replaceFile({projectId:"safe",relativePath:"src/new.txt",
  content:"alpha gamma\n",expectedSha256:created.sha256});
 assert.equal(replaced.commitMode,"DIRFD_DUAL_EXLOCK_RENAME_SWAP");
 assert.equal(replaced.sha256,sha("alpha gamma\n"));
 const patched=await files.applyPatch({projectId:"safe",relativePath:"src/new.txt",
  expectedSha256:replaced.sha256,oldText:"gamma",newText:"delta"});
 assert.equal(patched.patch.appliedOccurrences,1);
 const finalHash=await files.hashFile({projectId:"safe",relativePath:"src/new.txt"});
 assert.equal(finalHash.sha256,sha("alpha delta\n"));
 assert.equal(readFileSync(join(safeRoot,"src/new.txt"),"utf8"),"alpha delta\n");
 log("Business file E2E read -> mkdir/create -> replace -> patch -> hash verify");

 await reject(()=>files.createFile({projectId:"ro",relativePath:"nope.txt",content:"X"}),"BUSINESS_PROFILE_DENIED");
 assert.equal((await files.readFile({projectId:"ro",relativePath:"readonly.txt"})).content,"READ ONLY\n");
 log("READ_ONLY can read but cannot invoke SAFE mutation");

 await reject(()=>files.readFile({projectId:"safe",relativePath:"../outside/secret.txt"}),"BUSINESS_RELATIVE_PATH_INVALID");
 await reject(()=>files.readFile({projectId:"safe",relativePath:join(outside,"secret.txt")}),"BUSINESS_RELATIVE_PATH_INVALID");
 const escape=join(safeRoot,"escape");symlinkSync(outside,escape);
 await reject(()=>files.readFile({projectId:"safe",relativePath:"escape/secret.txt"}),"BUSINESS_SYMLINK_DENIED");
 await reject(()=>files.createFile({projectId:"safe",relativePath:"escape/new.txt",content:"X"}),"BUSINESS_SYMLINK_DENIED");
 log("absolute/root traversal and symlink escape are denied");

 mkdirSync(join(safeRoot,".git"));
 writeFileSync(join(safeRoot,".git/config"),"[core]\n",{mode:0o600});
 await reject(()=>files.readFile({projectId:"safe",relativePath:".git/config"}),"BUSINESS_GIT_PATH_DENIED");
 await reject(()=>files.createFile({projectId:"safe",relativePath:".git/new",content:"X"}),"BUSINESS_GIT_PATH_DENIED");
 log(".git direct file access is denied");

 await reject(()=>files.createFile({projectId:"safe",relativePath:"existing.txt",content:"NO"}),"BUSINESS_DESTINATION_EXISTS");
 await reject(()=>files.makeDirectory({projectId:"safe",relativePath:"src"}),"BUSINESS_DESTINATION_EXISTS");
 await reject(()=>files.replaceFile({projectId:"safe",relativePath:"missing.txt",content:"X",
  expectedSha256:sha("none")}),"BUSINESS_TARGET_MISSING");
 log("create/mkdir existing and replace missing fail without effect");

 const stalePath=join(safeRoot,"stale.txt");writeFileSync(stalePath,"STALE_BASE",{mode:0o600});
 const staleSha=sha("STALE_BASE");
 writeFileSync(stalePath,"EXTERNAL_CHANGE",{mode:0o600});
 await reject(()=>files.replaceFile({projectId:"safe",relativePath:"stale.txt",content:"SHOULD_NOT_COMMIT",
  expectedSha256:staleSha}),"BUSINESS_WRITE_CONFLICT");
 assert.equal(readFileSync(stalePath,"utf8"),"EXTERNAL_CHANGE");
 log("stale SHA refuses before replacement effect");

 const concurrentPath=join(safeRoot,"concurrent.txt");writeFileSync(concurrentPath,"CONCURRENT_BASE",{mode:0o600});
 const concurrentSha=sha("CONCURRENT_BASE");
 const outcomes=await Promise.allSettled([
  files.replaceFile({projectId:"safe",relativePath:"concurrent.txt",content:"WINNER_A",expectedSha256:concurrentSha}),
  files.replaceFile({projectId:"safe",relativePath:"concurrent.txt",content:"WINNER_B",expectedSha256:concurrentSha})
 ]);
 assert.equal(outcomes.filter(x=>x.status==="fulfilled").length,1);
 assert.equal(outcomes.filter(x=>x.status==="rejected"&&x.reason?.message==="BUSINESS_WRITE_CONFLICT").length,1);
 assert.ok(["WINNER_A","WINNER_B"].includes(readFileSync(concurrentPath,"utf8")));
 log("concurrent same-SHA replace commits exactly one winner");

 const fifo=join(safeRoot,"pipe");
 const fifoRun=spawnSync("/usr/bin/mkfifo",[fifo],{encoding:"utf8"});
 assert.equal(fifoRun.status,0,fifoRun.stderr);
 await reject(()=>files.hashFile({projectId:"safe",relativePath:"pipe"}),"BUSINESS_NOT_REGULAR_FILE");
 await reject(()=>files.replaceFile({projectId:"safe",relativePath:"pipe",content:"X",
  expectedSha256:sha("X")}),"BUSINESS_TARGET_UNSUPPORTED");
 log("special-file hash/replace fail closed without blocking");

 const patchPath=join(safeRoot,"patch.txt"),patchBase="hello TOKEN\n";
 writeFileSync(patchPath,patchBase,{mode:0o600});
 await reject(()=>files.applyPatch({projectId:"safe",relativePath:"patch.txt",
  expectedSha256:sha("wrong"),oldText:"TOKEN",newText:"VALUE"}),"BUSINESS_WRITE_CONFLICT");
 assert.equal(readFileSync(patchPath,"utf8"),patchBase);
 await reject(()=>files.applyPatch({projectId:"safe",relativePath:"patch.txt",
  expectedSha256:sha(patchBase),oldText:"MISSING",newText:"VALUE"}),"BUSINESS_PATCH_CONTEXT_MISMATCH");
 const overflowBase="x".repeat(200000)+"TOKEN";
 writeFileSync(join(safeRoot,"overflow.txt"),overflowBase,{mode:0o600});
 await reject(()=>files.applyPatch({projectId:"safe",relativePath:"overflow.txt",
  expectedSha256:sha(overflowBase),oldText:"TOKEN",newText:"Y".repeat(100000)}),"BUSINESS_PATCH_OVERFLOW");
 const binaryPatch=Buffer.from([0xff,0xfe,0xfd]);
 writeFileSync(join(safeRoot,"binary.dat"),binaryPatch,{mode:0o600});
 await reject(()=>files.applyPatch({projectId:"safe",relativePath:"binary.dat",
  expectedSha256:sha(binaryPatch),oldText:"x",newText:"y"}),"BUSINESS_PATCH_TEXT_INVALID");
 log("patch requires current SHA, exact context, strict UTF-8 and bounded result");

 const uncertainPath=join(safeRoot,"uncertain.txt");writeFileSync(uncertainPath,"BEFORE",{mode:0o600});
 const uncertain=new BusinessFileOps(registry,{...nativeConfig,testHooks:{
  beforePostcommitObservation:async()=>{throw Error("fixture postcommit observation failure");}
 }});
 const uncertainty=await reject(()=>uncertain.replaceFile({projectId:"safe",relativePath:"uncertain.txt",
  content:"AFTER",expectedSha256:sha("BEFORE")}),"BUSINESS_REPLACE_UNCERTAIN");
 assert.equal(uncertainty.effect,"UNCERTAIN");assert.equal(uncertainty.retryable,false);
 assert.equal(readFileSync(uncertainPath,"utf8"),"AFTER");
 await reject(()=>files.replaceFile({projectId:"safe",relativePath:"uncertain.txt",
  content:"RETRY",expectedSha256:sha("BEFORE")}),"BUSINESS_WRITE_CONFLICT");
 assert.equal(readFileSync(uncertainPath,"utf8"),"AFTER");
 log("post-commit uncertainty is non-retryable; old precondition cannot replay effect");

 const authFile=join(root,"business.key"),token=randomBytes(32).toString("base64url");
 writeFileSync(authFile,token,{mode:0o600});
 const port=await freePort();
 server=spawn(process.execPath,[join(here,"business-mcp-server.mjs")],{
  env:{...process.env,CHATAGENT_BUSINESS_STATE_DIR:state,
   CHATAGENT_BUSINESS_AUTH_FILE:authFile,CHATAGENT_BUSINESS_PORT:String(port),
   CHATAGENT_BUSINESS_NATIVE_CREATE_BIN:createBin,
   CHATAGENT_BUSINESS_NATIVE_CREATE_SHA256:createSha,
   CHATAGENT_BUSINESS_NATIVE_REPLACE_BIN:replaceBin,
   CHATAGENT_BUSINESS_NATIVE_REPLACE_SHA256:replaceSha,
   CHATAGENT_BUSINESS_NATIVE_MKDIR_BIN:mkdirBin,
   CHATAGENT_BUSINESS_NATIVE_MKDIR_SHA256:mkdirSha},
  stdio:["ignore","pipe","pipe"]
 });
 let serverErr="";server.stderr.on("data",x=>serverErr+=String(x).slice(0,1000));
 for(let i=0;i<80;i++){
  if(server.exitCode!==null)throw Error("B2_MCP_EARLY_EXIT "+serverErr);
  try{
   const h=await fetch("http://127.0.0.1:"+port+"/health",{signal:AbortSignal.timeout(300)});
   if(h.ok){const status=await h.json();assert.equal(status.phase,"B2");assert.equal(status.safeFilesReady,true);break;}
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
  clientInfo:{name:"business-b2-test",version:"1"}});
 assert.equal(response.status,200);assert.ok(!response.body.error,JSON.stringify(response.body));
 response=await rpc("tools/list",{});
 const names=response.body.result.tools.map(x=>x.name);
 assert.deepEqual(names,["business_status","list_directory","stat_path","read_file","hash_file",
  "make_directory","create_file","replace_file","apply_patch"]);
 assert.equal(names.some(x=>x.includes("exec")||x.includes("continuity")||x==="set_profile"),false);
 log("B2 MCP publishes fixed 9-tool status/read/safe surface only");

 const mcpStatus=await call("business_status",{});
 assert.equal(mcpStatus.value.phase,"B2");assert.equal(mcpStatus.value.safeFiles,"READY_B2");
 assert.equal(JSON.stringify(mcpStatus.value).includes(safeRoot),false);

 const mcpRead=await call("read_file",{projectId:"ro",relativePath:"readonly.txt"});
 assert.equal(mcpRead.isError,false);assert.equal(mcpRead.value.content,"READ ONLY\n");
 const denied=await call("create_file",{projectId:"ro",relativePath:"denied.txt",content:"X"});
 assert.equal(denied.isError,true);assert.equal(denied.value.code,"BUSINESS_PROFILE_DENIED");

 const mcpCreated=await call("create_file",{projectId:"safe",relativePath:"mcp.txt",content:"one two\n"});
 assert.equal(mcpCreated.isError,false);
 const mcpReplaced=await call("replace_file",{projectId:"safe",relativePath:"mcp.txt",
  content:"one three\n",expectedSha256:mcpCreated.value.sha256});
 assert.equal(mcpReplaced.isError,false);
 const mcpPatched=await call("apply_patch",{projectId:"safe",relativePath:"mcp.txt",
  expectedSha256:mcpReplaced.value.sha256,oldText:"three",newText:"four"});
 assert.equal(mcpPatched.isError,false);
 const mcpHash=await call("hash_file",{projectId:"safe",relativePath:"mcp.txt"});
 assert.equal(mcpHash.value.sha256,sha("one four\n"));
 log("actual B2 MCP read/create/replace/patch/hash workflow passes");

 const absDenied=await call("read_file",{projectId:"safe",relativePath:join(outside,"secret.txt")});
 assert.equal(absDenied.isError,true);assert.equal(absDenied.value.code,"BUSINESS_RELATIVE_PATH_INVALID");

 response=await rpc("tools/call",{name:"business_status",arguments:{profile:"STANDARD"}});
 assert.equal(response.status,200);
 assert.equal(response.body.result?.isError===true||response.body.error!==undefined,true);

 response=await post({jsonrpc:"2.0",id:++rpcId,method:"tools/list",params:{}},
  {"x-chatagent-business-profile":"STANDARD"});
 assert.equal(response.status,400);assert.equal(response.body.error.message,"AUTHORITY_INPUT_FORBIDDEN");
 log("MCP absolute path and profile injection remain fail-closed");

 console.log("BUSINESS_B2_SAFE_FILES=PASS");
}catch(e){
 console.error("BUSINESS_B2_SAFE_FILES=FAIL "+e.stack);
 process.exitCode=1;
}finally{
 if(server)server.kill("SIGTERM");
 await delay(300);
 rmSync(root,{recursive:true,force:true});
 console.log("test_only_fixture_cleanup=COMPLETE");
}
