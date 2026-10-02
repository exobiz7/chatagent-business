import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import {spawn,spawnSync} from "node:child_process";
import {mkdtempSync,mkdirSync,realpathSync,writeFileSync,readFileSync,
 lstatSync,existsSync,unlinkSync,rmdirSync,chmodSync,readdirSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {randomUUID,createHash} from "node:crypto";
const root=realpathSync(mkdtempSync(join(tmpdir(),"personal-copy-kill-")));
const srcdir=join(root,"source"),destdir=join(root,"destination");
mkdirSync(srcdir,{mode:0o700});mkdirSync(destdir,{mode:0o700});
const source=join(srcdir,"fixture.bin"),dest=join(destdir,"published.bin");
const native=join(root,"native-copy"),stageId=randomUUID();
const stage=join(destdir,".personal-copy-"+stageId+".stage");
const data=Buffer.alloc(128*1024*1024,0x52);
writeFileSync(source,data,{mode:0o600,flag:"wx"});
const sha=v=>createHash("sha256").update(v).digest("hex");
const expected=sha(data);
const sourceStat=lstatSync(source);
const cc=spawnSync("/usr/bin/clang",["-std=c11","-D_DARWIN_C_SOURCE",
 "-Wno-deprecated-declarations","-Wall","-Wextra","-Werror","-O2",
 fileURLToPath(new URL("./native-copy-create.c",import.meta.url)),"-o",native],
 {encoding:"utf8",timeout:10000});
assert.equal(cc.status,0,cc.stderr);chmodSync(native,0o700);
let child,verified=false;
try{
 const firstOutput=await new Promise((resolve,reject)=>{
  child=spawn(native,[source,dest,expected,String(sourceStat.size),
   String(sourceStat.dev),String(sourceStat.ino),stageId],{stdio:["ignore","pipe","pipe"]});
  let seen="",settled=false;
  child.stdout.on("data",x=>{
   seen+=String(x);
   if(!settled&&seen.includes("COPY_STAGE_READY id="+stageId)){
    settled=true;
    child.kill("SIGKILL"); // EXACT process object for this isolated helper only
    resolve(seen);
   }
  });
  child.on("error",reject);
  child.on("close",(code,signal)=>{if(!settled)reject(Error("MISSING_STAGE_READY "+code+" "+signal));});
 });
 assert.match(firstOutput,/COPY_STAGE_READY/);
 await new Promise(resolve=>child.once("close",resolve));
 assert.equal(child.signalCode,"SIGKILL");
 assert.equal(existsSync(dest),false);
 const observed=lstatSync(stage);
 assert.ok(observed.isFile()&&observed.nlink===1&&observed.size<=sourceStat.size);
 const actual=sha(readFileSync(stage));
 assert.equal(actual.length,64);
 const after=lstatSync(stage);
 assert.equal(after.ino,observed.ino);assert.equal(after.dev,observed.dev);
 console.log("PASS test-only native helper SIGKILL leaves UUID-identifiable orphan stage, no published destination");
 console.log("PASS orphan stage independently bounded, hashed, inode-matched for operator reconciliation");
 verified=true;
 console.log("PERSONAL_COPY_SIGKILL_ORPHAN=PASS");
}catch(e){console.error("PERSONAL_COPY_SIGKILL_ORPHAN=FAIL "+e.stack);process.exitCode=1;}
finally{
 if(child&&child.exitCode===null&&child.signalCode===null)child.kill("SIGKILL");
 if(verified){
  const stageStat=lstatSync(stage),current=readdirSync(destdir);
  assert.equal(stageStat.nlink,1);assert.deepEqual(current,[".personal-copy-"+stageId+".stage"]);
  unlinkSync(stage);rmdirSync(destdir);
  assert.equal(sha(readFileSync(source)),expected);
  unlinkSync(source);rmdirSync(srcdir);
  unlinkSync(native);rmdirSync(root);
 }
 console.log("test_owned_fixture_cleanup="+(verified?"EXACT_VERIFIED":"RETAINED_FOR_REVIEW"));
}
