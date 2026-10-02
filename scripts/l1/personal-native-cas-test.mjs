import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,existsSync,
 chmodSync,realpathSync,rmSync,symlinkSync,linkSync,renameSync,readdirSync,statSync} from "node:fs";
import {join} from "node:path";
import {tmpdir} from "node:os";
import {createHash} from "node:crypto";
import {L1Broker} from "./broker-core.mjs";
import {HostFileOps} from "./host-file-ops.mjs";
const sha=x=>createHash("sha256").update(x).digest("hex");
const root=realpathSync(mkdtempSync(join(tmpdir(),"personal-cas-")));
const work=join(root,"work"),outside=join(root,"outside"),state=join(root,"state");
mkdirSync(work,{mode:0o700});mkdirSync(outside,{mode:0o700});
const binary=join(root,"native-cas");
const cc=spawnSync("/usr/bin/clang",["-std=c11","-D_DARWIN_C_SOURCE",
 "-Wall","-Wextra","-Werror","-O2",
 fileURLToPath(new URL("./native-replace-cas.c",import.meta.url)),"-o",binary],
 {encoding:"utf8",timeout:10000});
assert.equal(cc.status,0,cc.stderr);chmodSync(binary,0o700);
const pin=sha(readFileSync(binary));
const b=new L1Broker(state,{initialize:true});
b.pair("12345678");b.setMode("FULL_HOST","12345678");
const options={privateRoot:state,strictMutations:true,nativeReplaceBinary:binary,
 nativeReplaceSha256:pin};
const files=new HostFileOps(b,options);
try{
 const target=join(work,"editable.txt");
 writeFileSync(target,"BASE",{mode:0o644,flag:"wx"});
 const result=await files.replace({path:target,content:"UPDATED",
   expectedSha256:sha("BASE")});
 assert.equal(result.changed,true);assert.equal(result.sha256,sha("UPDATED"));
 assert.equal(result.commitMode,"DIRFD_DUAL_EXLOCK_RENAME_SWAP");
 assert.equal(readFileSync(target,"utf8"),"UPDATED");
 assert.equal(statSync(target).mode&0o777,0o644);
 const uncertainTarget=join(work,"postcommit.txt");
 writeFileSync(uncertainTarget,"BEFORE",{mode:0o600,flag:"wx"});
 const postcommit=new HostFileOps(b,{...options,testHooks:{
  beforePostcommitObservation:()=>{throw Error("EIO");}
 }});
 await assert.rejects(()=>postcommit.replace({path:uncertainTarget,content:"AFTER",
  expectedSha256:sha("BEFORE")}),/CAS_POSTCOMMIT_UNCERTAIN/);
 assert.equal(readFileSync(uncertainTarget,"utf8"),"AFTER");
 await assert.rejects(()=>files.replace({path:uncertainTarget,content:"RETRY",
  expectedSha256:sha("BEFORE")}),/CAS_PRECONDITION_MISMATCH/);
 console.log("PASS F02 post-commit observation failure is UNCERTAIN; effect not retried");
 console.log("PASS pinned native existing-file compare, atomic visibility, preserved mode");
 await assert.rejects(()=>files.replace({path:target,content:"BAD",
   expectedSha256:sha("BASE")}),/CAS_PRECONDITION_MISMATCH/);
 assert.equal(readFileSync(target,"utf8"),"UPDATED");
 await assert.rejects(()=>files.replace({path:join(work,"absent"),content:"X",
   expectedSha256:sha("X")}),/CAS_TARGET_MISSING/);
 assert.equal(existsSync(join(work,"absent")),false);
 assert.equal(readdirSync(work).some(x=>x.startsWith(".personal-cas-")),false);
 console.log("PASS wrong SHA and absent target refused without staged debris");
 const fake=new HostFileOps(b,{...options,nativeReplaceSha256:"0".repeat(64)});
 await assert.rejects(()=>fake.replace({path:target,content:"X",
   expectedSha256:sha("UPDATED")}),/CAS_BINARY_HASH_MISMATCH/);
 assert.equal(readFileSync(target,"utf8"),"UPDATED");
 const link=join(work,"symlink");
 symlinkSync(target,link);
 await assert.rejects(()=>files.replace({path:link,content:"X",
   expectedSha256:sha("UPDATED")}),/CAS_TARGET_UNSAFE/);
 const hard=join(work,"hard");linkSync(target,hard);
 await assert.rejects(()=>files.replace({path:target,content:"X",
   expectedSha256:sha("UPDATED")}),/CAS_TARGET_UNSAFE/);
 assert.equal(readFileSync(hard,"utf8"),"UPDATED");
 console.log("PASS bad helper hash, symlink and hardlinked target refused");
 const swapParent=join(work,"switch"),safeMoved=join(work,"saved");
 mkdirSync(swapParent,{mode:0o700});
 writeFileSync(join(swapParent,"original.txt"),"SAFE",{mode:0o600,flag:"wx"});
 writeFileSync(join(outside,"original.txt"),"OUTSIDE",{mode:0o600,flag:"wx"});
 const swapped=new HostFileOps(b,{...options,testHooks:{
  beforeNativeReplaceCommit:()=>{
   renameSync(swapParent,safeMoved);symlinkSync(outside,swapParent);
  }
 }});
 await assert.rejects(()=>swapped.replace({path:join(swapParent,"original.txt"),
   content:"X",expectedSha256:sha("SAFE")}),/CAS_PARENT_UNSAFE/);
 assert.equal(readFileSync(join(outside,"original.txt"),"utf8"),"OUTSIDE");
 assert.equal(readFileSync(join(safeMoved,"original.txt"),"utf8"),"SAFE");
 console.log("PASS parent symlink switch denied without redirecting replacement");
 const racing=new HostFileOps(b,{...options,testHooks:{
  beforeNativeReplaceCommit:()=>writeFileSync(join(work,"race.txt"),"OTHER")
 }});
 writeFileSync(join(work,"race.txt"),"FIRST",{mode:0o600,flag:"wx"});
 await assert.rejects(()=>racing.replace({path:join(work,"race.txt"),
   content:"THIRD",expectedSha256:sha("FIRST")}),/CAS_PRECONDITION_MISMATCH/);
 assert.equal(readFileSync(join(work,"race.txt"),"utf8"),"OTHER");
 const xattrTarget=join(work,"with-attribute.txt");
 writeFileSync(xattrTarget,"META_BASE",{mode:0o600,flag:"wx"});
 const setAttr=spawnSync("/usr/bin/xattr",["-w","com.example.chatagent.review","VALUE",xattrTarget],
  {encoding:"utf8",timeout:5000});
 assert.equal(setAttr.status,0,setAttr.stderr);
 const metadataResult=await files.replace({path:xattrTarget,content:"META_UPDATED",
  expectedSha256:sha("META_BASE")});
 assert.equal(metadataResult.changed,true);
 const getAttr=spawnSync("/usr/bin/xattr",["-p","com.example.chatagent.review",xattrTarget],
  {encoding:"utf8",timeout:5000});
 assert.equal(getAttr.status,0,getAttr.stderr);
 assert.equal(getAttr.stdout.trim(),"VALUE");
 console.log("PASS user xattr survives native replacement");
 const aclTarget=join(work,"with-acl.txt");
 writeFileSync(aclTarget,"ACL_BASE",{mode:0o600,flag:"wx"});
 const acl=spawnSync("/bin/chmod",["+a","user:"+process.env.USER+" allow read",aclTarget],
  {encoding:"utf8",timeout:5000});
 assert.equal(acl.status,0,acl.stderr);
 await assert.rejects(()=>files.replace({path:aclTarget,content:"ACL_UPDATED",
  expectedSha256:sha("ACL_BASE")}),/CAS_METADATA_UNSUPPORTED/);
 assert.equal(readFileSync(aclTarget,"utf8"),"ACL_BASE");
 assert.equal(readdirSync(work).some(x=>x.startsWith(".personal-cas-")),false);
 console.log("PASS unsupported ACL refused before effect; no orphan stage");
 // A parent directory ACL can be inherited by a newly created stage even when
 // the existing target is ACL-free. Safe Replace must reject that NEW inode
 // rather than silently widening the replacement file's permissions.
 const inheritedDir=join(work,"inherited-acl-dir");
 mkdirSync(inheritedDir,{mode:0o700});
 const inherit=spawnSync("/bin/chmod",["+a","everyone allow read,write,file_inherit,directory_inherit",inheritedDir],
  {encoding:"utf8",timeout:5000});
 assert.equal(inherit.status,0,inherit.stderr);
 const inheritedTarget=join(inheritedDir,"target.txt");
 writeFileSync(inheritedTarget,"INHERITED_BASE",{mode:0o600,flag:"wx"});
 const strip=spawnSync("/bin/chmod",["-N",inheritedTarget],{encoding:"utf8",timeout:5000});
 assert.equal(strip.status,0,strip.stderr);
 await assert.rejects(()=>files.replace({path:inheritedTarget,content:"INHERITED_NEW",
  expectedSha256:sha("INHERITED_BASE")}),/CAS_METADATA_UNSUPPORTED/);
 assert.equal(readFileSync(inheritedTarget,"utf8"),"INHERITED_BASE");
 assert.equal(readdirSync(inheritedDir).some(x=>x.startsWith(".personal-cas-")),false);
 console.log("PASS inherited stage ACL is refused; ACL-free original content remains unchanged");
 const flagged=join(work,"with-flags.txt");
 writeFileSync(flagged,"FLAG_BASE",{mode:0o600,flag:"wx"});
 const setFlag=spawnSync("/usr/bin/chflags",["uchg",flagged],{encoding:"utf8",timeout:5000});
 assert.equal(setFlag.status,0,setFlag.stderr);
 try{
  await assert.rejects(()=>files.replace({path:flagged,content:"FLAG_UPDATED",
   expectedSha256:sha("FLAG_BASE")}),/CAS_METADATA_UNSUPPORTED/);
  assert.equal(readFileSync(flagged,"utf8"),"FLAG_BASE");
 }finally{
  const unset=spawnSync("/usr/bin/chflags",["nouchg",flagged],{encoding:"utf8",timeout:5000});
  assert.equal(unset.status,0,unset.stderr);
 }
 console.log("PASS unsupported file flags refused before effect");
 // Compile-time, fixture-only F03 mutations occur AFTER staging and BEFORE
 // final verification. The production pinned helper is compiled without hooks.
 const drifts=[
  ["mode","PERSONAL_TEST_CAS_MODE_DRIFT"],
  ["xattr","PERSONAL_TEST_CAS_XATTR_DRIFT"],
  ["stage-xattr","PERSONAL_TEST_CAS_STAGE_XATTR_DRIFT"]
 ];
 for(const [name,macro] of drifts){
  const testBinary=join(root,"native-cas-f03-"+name);
  const built=spawnSync("/usr/bin/clang",["-std=c11","-D_DARWIN_C_SOURCE",
   "-Wall","-Wextra","-Werror","-O2","-D"+macro,
   fileURLToPath(new URL("./native-replace-cas.c",import.meta.url)),"-o",testBinary],
   {encoding:"utf8",timeout:10000});
  assert.equal(built.status,0,built.stderr);
  chmodSync(testBinary,0o700);
  const driftTarget=join(work,"f03-"+name+".txt");
  writeFileSync(driftTarget,"F03_BASE",{mode:0o600,flag:"wx"});
  if(name!=="mode"){
   const set=spawnSync("/usr/bin/xattr",["-w","com.example.chatagent.f03","ORIGINAL",driftTarget],
    {encoding:"utf8",timeout:5000});
   assert.equal(set.status,0,set.stderr);
  }
  const run=spawnSync(testBinary,[driftTarget,sha("F03_BASE")],{
   input:"F03_REPLACE",encoding:"utf8",timeout:10000});
  assert.equal(run.status,2,name+" "+run.stderr);
  assert.equal(run.stderr.trim(),"CAS_TARGET_CHANGED",name);
  assert.equal(readFileSync(driftTarget,"utf8"),"F03_BASE",name);
  assert.equal(readdirSync(work).some(x=>x.startsWith(".personal-cas-")),false,name);
  if(name==="mode")assert.equal(statSync(driftTarget).mode&0o777,0o700);
  else{
   const get=spawnSync("/usr/bin/xattr",["-p","com.example.chatagent.f03",driftTarget],
    {encoding:"utf8",timeout:5000});
   assert.equal(get.status,0,get.stderr);
   assert.equal(get.stdout.trim(),name==="xattr"?"CHANGED":"ORIGINAL",name);
  }
 }
 console.log("PASS F03 deterministic mode/source-xattr/stage-xattr drift refuses stale metadata without replacing target");
 // Exercise the exact historical final-check -> commit window. Safe Replace v2
 // must detect the displaced inode/content after RENAME_SWAP, atomically restore
 // the intervening writer, remove only its own staged inode, and report conflict.
 for(const [name,macro] of [["path-race","PERSONAL_TEST_CAS_PATH_RACE"],
                            ["content-race","PERSONAL_TEST_CAS_CONTENT_RACE"]]){
  const testBinary=join(root,"native-cas-f03-"+name);
  const built=spawnSync("/usr/bin/clang",["-std=c11","-D_DARWIN_C_SOURCE",
   "-Wall","-Wextra","-Werror","-O2","-D"+macro,
   fileURLToPath(new URL("./native-replace-cas.c",import.meta.url)),"-o",testBinary],
   {encoding:"utf8",timeout:10000});
  assert.equal(built.status,0,built.stderr);chmodSync(testBinary,0o700);
  const raceTarget=join(work,"f03-window-"+name+".txt");
  writeFileSync(raceTarget,"F03_WINDOW_BASE",{mode:0o600,flag:"wx"});
  const run=spawnSync(testBinary,[raceTarget,sha("F03_WINDOW_BASE")],{
   input:"F03_WINDOW_REPLACE",encoding:"utf8",timeout:10000});
  assert.equal(run.status,2,name+" "+run.stderr);
  assert.equal(run.stderr.trim(),"CAS_TARGET_CHANGED",name);
  assert.equal(readFileSync(raceTarget,"utf8"),"RACE_WINDOW",name);
  assert.equal(readdirSync(work).some(x=>x.startsWith(".personal-cas-")),false,name);
 }
 console.log("PASS F03 exact pre-swap path/content races are detected after atomic exchange and rolled back");
 // A raw writer that changes the public leaf AFTER our atomic swap makes safe
 // rollback impossible. The helper must never report success or delete the
 // displaced original; it returns non-retryable uncertainty with recovery data
 // still present under the private random stage name.
 {
  const testBinary=join(root,"native-cas-f03-postswap-race");
  const built=spawnSync("/usr/bin/clang",["-std=c11","-D_DARWIN_C_SOURCE",
   "-Wall","-Wextra","-Werror","-O2","-DPERSONAL_TEST_CAS_POSTSWAP_PATH_RACE",
   fileURLToPath(new URL("./native-replace-cas.c",import.meta.url)),"-o",testBinary],
   {encoding:"utf8",timeout:10000});
  assert.equal(built.status,0,built.stderr);chmodSync(testBinary,0o700);
  const raceTarget=join(work,"f03-postswap-race.txt");
  writeFileSync(raceTarget,"POSTSWAP_BASE",{mode:0o600,flag:"wx"});
  const run=spawnSync(testBinary,[raceTarget,sha("POSTSWAP_BASE")],{
   input:"POSTSWAP_REPLACE",encoding:"utf8",timeout:10000});
  assert.equal(run.status,2,run.stderr);
  assert.equal(run.stderr.trim(),"CAS_ROLLBACK_UNCERTAIN");
  assert.equal(readFileSync(raceTarget,"utf8"),"POSTSWAP_RACE");
  const recovery=readdirSync(work).filter(x=>x.startsWith(".personal-cas-"));
  assert.equal(recovery.length,1,JSON.stringify(recovery));
  assert.equal(readFileSync(join(work,recovery[0]),"utf8"),"POSTSWAP_BASE");
  rmSync(join(work,recovery[0]));
 }
 console.log("PASS hostile post-swap leaf race is fail-closed UNCERTAIN and preserves displaced original for recovery");
 {
  const testBinary=join(root,"native-cas-f03-postswap-content-race");
  const built=spawnSync("/usr/bin/clang",["-std=c11","-D_DARWIN_C_SOURCE",
   "-Wall","-Wextra","-Werror","-O2","-DPERSONAL_TEST_CAS_POSTSWAP_CONTENT_RACE",
   fileURLToPath(new URL("./native-replace-cas.c",import.meta.url)),"-o",testBinary],
   {encoding:"utf8",timeout:10000});
  assert.equal(built.status,0,built.stderr);chmodSync(testBinary,0o700);
  const raceTarget=join(work,"f03-postswap-content-race.txt");
  writeFileSync(raceTarget,"POSTSWAP_CONTENT_BASE",{mode:0o600,flag:"wx"});
  const run=spawnSync(testBinary,[raceTarget,sha("POSTSWAP_CONTENT_BASE")],{
   input:"POSTSWAP_CONTENT_REPLACE",encoding:"utf8",timeout:10000});
  assert.equal(run.status,2,run.stderr);
  assert.equal(run.stderr.trim(),"CAS_TARGET_CHANGED");
  assert.equal(readFileSync(raceTarget,"utf8"),"POSTSWAP_CONTENT_BASE");
  assert.equal(readdirSync(work).some(x=>x.startsWith(".personal-cas-")),false);
 }
 console.log("PASS hostile post-swap content mutation of NEW inode is detected and original is atomically restored");
 const concurrentTarget=join(work,"concurrent.txt");
 writeFileSync(concurrentTarget,"CONCURRENT_BASE",{mode:0o600,flag:"wx"});
 const candidates=Array.from({length:8},(_,i)=>"CONCURRENT_WIN_"+i);
 const outcomes=await Promise.allSettled(candidates.map(content=>files.replace({
  path:concurrentTarget,content,expectedSha256:sha("CONCURRENT_BASE")})));
 const won=outcomes.map((x,i)=>({x,i})).filter(({x})=>x.status==="fulfilled");
 assert.equal(won.length,1,JSON.stringify(outcomes));
 assert.equal(readFileSync(concurrentTarget,"utf8"),candidates[won[0].i]);
 for(const {x} of outcomes.map((x,i)=>({x,i})).filter(({x})=>x.status==="rejected"))
  assert.match(String(x.reason?.message),/CAS_(PRECONDITION_MISMATCH|TARGET_CHANGED)/);
 assert.equal(readdirSync(work).some(x=>x.startsWith(".personal-cas-")),false);
 console.log("PASS dual O_EXLOCK lock-coupling serializes same-target helper processes: exactly one expected-SHA writer commits");
 console.log("PASS pre-commit external edit rejects stale digest, preserves intervening content");
 console.log("PERSONAL_NATIVE_CAS_TEST=PASS");
}catch(e){console.error("PERSONAL_NATIVE_CAS_TEST=FAIL "+e.stack);process.exitCode=1;}
finally{rmSync(root,{recursive:true,force:true});console.log("isolated_fixture_cleanup=COMPLETE");}
