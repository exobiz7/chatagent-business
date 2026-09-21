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
 new URL("./native-replace-cas.c",import.meta.url).pathname,"-o",binary],
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
 assert.equal(result.commitMode,"DIRFD_EXPECTED_SHA_RENAME");
 assert.equal(readFileSync(target,"utf8"),"UPDATED");
 assert.equal(statSync(target).mode&0o777,0o644);
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
 console.log("PASS pre-commit external edit rejects stale digest, preserves intervening content");
 console.log("PERSONAL_NATIVE_CAS_TEST=PASS");
}catch(e){console.error("PERSONAL_NATIVE_CAS_TEST=FAIL "+e.stack);process.exitCode=1;}
finally{rmSync(root,{recursive:true,force:true});console.log("isolated_fixture_cleanup=COMPLETE");}
