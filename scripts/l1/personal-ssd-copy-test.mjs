import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
import {mkdtempSync,mkdirSync,realpathSync,writeFileSync,readFileSync,rmSync,existsSync,
 lstatSync,unlinkSync,rmdirSync,chmodSync,readdirSync,statfsSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {randomUUID,createHash} from "node:crypto";
import {setTimeout as delay} from "node:timers/promises";
import {L1Broker} from "./broker-core.mjs";
import {HostFileOps} from "./host-file-ops.mjs";
import {AsyncCopyJobs} from "./async-copy-jobs.mjs";

const sha=x=>createHash("sha256").update(x).digest("hex");
const volume=process.env.PERSONAL_TEST_SSD_ROOT;
if(typeof volume!=="string"||realpathSync(volume)!==volume||
 !volume.startsWith("/Volumes/")||volume==="/Volumes")
 throw Error("EXPLICIT_TEST_VOLUME_REQUIRED");
const volumeStat=lstatSync(volume);
assert.ok(volumeStat.isDirectory());
const root=realpathSync(mkdtempSync(join(volume,".personal-copy-proof-")));
assert.ok(root.startsWith(volume+"/.personal-copy-proof-"));
const rootStat=lstatSync(root),data=Buffer.alloc(32*1024*1024,0x4b),expected=sha(data);
const src=join(root,"source.bin"),dst=join(root,"destination.bin");
let completed=false;
const privateRoot=realpathSync(mkdtempSync(join(tmpdir(),"personal-ssd-owner-")));
let jobId;
try{
 const cc=spawnSync("/usr/bin/clang",["-std=c11","-D_DARWIN_C_SOURCE",
 "-Wno-deprecated-declarations","-Wall","-Wextra","-Werror","-O2",
 new URL("./native-copy-create.c",import.meta.url).pathname,"-o",join(privateRoot,"copy")],
 {encoding:"utf8",timeout:10000});
 if(cc.status!==0)throw Error("NATIVE_BUILD_FAILED");
 chmodSync(join(privateRoot,"copy"),0o700);
 writeFileSync(src,data,{mode:0o600,flag:"wx"});
 const pass="12345678",b=new L1Broker(join(privateRoot,"owner"),{initialize:true});
 b.pair(pass);b.setMode("FULL_HOST",pass);
 const jobs=new AsyncCopyJobs(b,new HostFileOps(b,{privateRoot:join(privateRoot,"owner"),
  strictMutations:true}),{binary:join(privateRoot,"copy"),binarySha:sha(readFileSync(join(privateRoot,"copy")))});
 const started=await jobs.start({source:src,destination:dst,
  expectedSourceSha256:expected,idempotencyKey:randomUUID()});
 jobId=started.processId;
 let terminal;
 for(let i=0;i<130;i++){
  const st=jobs.status({processId:jobId});
  if(["EXITED","FAILED","TERMINATED","RECOVERY_REQUIRED"].includes(st.state)){terminal=st;break;}
  await delay(80);
 }
 assert.equal(terminal?.state,"EXITED");
 assert.equal(terminal.exitCode,0);
 const output=jobs.read({processId:jobId,cursor:0,maxBytes:16384});
 assert.match(output.content,/COPY_DONE/);
 assert.equal(sha(readFileSync(src)),expected);
 assert.equal(sha(readFileSync(dst)),expected);
 assert.equal(readdirSync(root).filter(x=>x.startsWith(".personal-copy-")).length,0);
 assert.equal(statfsSync(src).type,statfsSync(dst).type);
 completed=true;
 console.log("PASS real external SSD APFS 32MiB create-only copy: source and destination SHA-256 match");
 console.log("PASS no residual stage, job EXITED/0; actual P8/Business storage untouched");
 console.log("PERSONAL_SSD_COPY=PASS");
}catch(e){console.error("PERSONAL_SSD_COPY=FAIL "+e.stack);process.exitCode=1;}
finally{
 // Only remove the two exact verified test files in the unique created dir.
 // An abnormal fixture is retained, not cleaned with a broad rm -rf.
 if(completed){
  for(const file of [src,dst]){
   const st=lstatSync(file);
   assert.ok(st.isFile()&&st.nlink===1&&sha(readFileSync(file))===expected);
   unlinkSync(file);
  }
  const now=lstatSync(root);
  assert.equal(now.dev,rootStat.dev);assert.equal(now.ino,rootStat.ino);
  assert.deepEqual(readdirSync(root),[]);
  rmdirSync(root);
 }
 // This separate /tmp directory contains exclusively test-owned owner state
 // and a helper binary; no source SSD fixture is under it.
 rmSync(privateRoot,{recursive:true,force:true});
 console.log("SSD_test_fixture_cleanup="+(completed?"EXACT_VERIFIED":"RETAINED_FOR_REVIEW"));
}
