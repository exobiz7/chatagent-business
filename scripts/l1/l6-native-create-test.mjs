import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,renameSync,symlinkSync,existsSync,realpathSync,rmSync,chmodSync,copyFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {createHash,randomUUID} from "node:crypto";
import {L1Broker} from "./broker-core.mjs";
import {HostFileOps} from "./host-file-ops.mjs";
import {nativeCreateOnly} from "./native-create-only.mjs";

const sha=x=>createHash("sha256").update(x).digest("hex");
const root=realpathSync(mkdtempSync(join(tmpdir(),"chatagent-l6-native-")));
const state=join(root,"owner"),work=join(root,"work"),outside=join(root,"outside");
mkdirSync(work,{mode:0o700});mkdirSync(outside,{mode:0o700});
const binary=join(root,"native-create-excl");
const compiled=spawnSync("/usr/bin/clang",["-std=c11","-D_DARWIN_C_SOURCE","-Wall","-Wextra","-Werror","-O2",
 new URL("./native-create-excl.c",import.meta.url).pathname,"-o",binary],{encoding:"utf8",timeout:10000});
if(compiled.status!==0)throw Error("NATIVE_BUILD_FAILED "+compiled.stderr);
chmodSync(binary,0o700);
const binarySha=sha(readFileSync(binary));
const b=new L1Broker(state,{initialize:true});
b.pair("12345678");b.setMode("FULL_HOST","12345678");
const files=new HostFileOps(b,{privateRoot:state,strictMutations:true,
 nativeCreateBinary:binary,nativeCreateSha256:binarySha});
try{
 const created=await files.create({path:join(work,"native.txt"),content:"DESCRIPTOR_SAFE"});
 assert.equal(created.changed,true);
 assert.equal(created.commitMode,"DIRFD_O_EXCL");
 assert.equal(created.sha256,sha("DESCRIPTOR_SAFE"));
 assert.equal(readFileSync(join(work,"native.txt"),"utf8"),"DESCRIPTOR_SAFE");
 console.log("PASS native descriptor-anchored create, hash and returned path");
 await assert.rejects(()=>files.create({path:join(work,"native.txt"),content:"OVERWRITTEN"}),
  /NATIVE_DESTINATION_EXISTS/);
 assert.equal(readFileSync(join(work,"native.txt"),"utf8"),"DESCRIPTOR_SAFE");
 console.log("PASS atomic existing destination refusal");
 await assert.rejects(()=>nativeCreateOnly({binary,expectedBinarySha256:"0".repeat(64),
  target:join(work,"bad.txt"),buffer:Buffer.from("X")}),/NATIVE_BINARY_HASH_MISMATCH/);
 assert.equal(existsSync(join(work,"bad.txt")),false);
 console.log("PASS hash-pinned binary selection");
 const unsafeParent=join(root,"unsafe");
 mkdirSync(unsafeParent,{mode:0o755});chmodSync(unsafeParent,0o755);
 const unsafeBinary=join(unsafeParent,"native-create-excl");
 copyFileSync(binary,unsafeBinary);chmodSync(unsafeBinary,0o700);
 await assert.rejects(()=>nativeCreateOnly({binary:unsafeBinary,expectedBinarySha256:binarySha,
  target:join(work,"unsafe-helper.txt"),buffer:Buffer.from("X")}),/NATIVE_BINARY_PARENT_UNSAFE/);
 assert.equal(existsSync(join(work,"unsafe-helper.txt")),false);
 const flood=join(root,"flood-helper");
 writeFileSync(flood,"#!/bin/sh\nprintf '"+"X".repeat(700)+"'\n",{mode:0o700});
 chmodSync(flood,0o700);
 await assert.rejects(()=>nativeCreateOnly({binary:flood,expectedBinarySha256:sha(readFileSync(flood)),
  target:join(work,"flood.txt"),buffer:Buffer.from("X")}),/NATIVE_OUTPUT_LIMIT/);
 assert.equal(existsSync(join(work,"flood.txt")),false);
 console.log("PASS unsafe helper parent and excessive helper output rejected");
 const parent=join(work,"switch"),moved=join(work,"moved");
 mkdirSync(parent,{mode:0o700});
 const attacker=new HostFileOps(b,{privateRoot:state,strictMutations:true,
  nativeCreateBinary:binary,nativeCreateSha256:binarySha,testHooks:{
   beforeNativeCreateCommit:async()=>{
    renameSync(parent,moved);
    symlinkSync(outside,parent);
   }
  }});
 await assert.rejects(()=>attacker.create({path:join(parent,"escape.txt"),content:"ESCAPE"}),
  /NATIVE_SYMLINK_OR_PARENT_DENIED/);
 assert.equal(existsSync(join(outside,"escape.txt")),false);
 assert.equal(existsSync(join(moved,"escape.txt")),false);
 console.log("PASS parent symlink swap fails closed without redirecting write");

 const strict=new HostFileOps(b,{privateRoot:state,strictMutations:true,
  nativeCreateBinary:binary,nativeCreateSha256:binarySha});
 await assert.rejects(()=>strict.replace({path:join(work,"native.txt"),
   content:"REPLACE",expectedSha256:created.sha256}),/ATOMIC_REPLACE_UNAVAILABLE/);
 assert.equal(readFileSync(join(work,"native.txt"),"utf8"),"DESCRIPTOR_SAFE");
 console.log("PASS native create does not enable unsafe existing-target replacement");

 const large=Buffer.alloc(262145,0x61);
 await assert.rejects(()=>nativeCreateOnly({binary,expectedBinarySha256:binarySha,
   target:join(work,"oversized.txt"),buffer:large}),/INVALID_NATIVE_CREATE_CONFIG/);
 assert.equal(existsSync(join(work,"oversized.txt")),false);
 console.log("PASS bounded input before effect");
 console.log("L6_NATIVE_CREATE_TEST=PASS");
}catch(error){
 console.error("L6_NATIVE_CREATE_TEST=FAIL "+error.stack);
 process.exitCode=1;
}finally{
 rmSync(root,{recursive:true,force:true});
 console.log("isolated_fixture_cleanup=COMPLETE");
}
