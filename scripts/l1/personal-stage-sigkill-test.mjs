import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import {spawn,spawnSync} from "node:child_process";
import {mkdtempSync,realpathSync,readFileSync,writeFileSync,
 rmSync,existsSync,chmodSync,lstatSync,unlinkSync} from "node:fs";
import {join} from "node:path";
import {randomUUID,randomBytes,createHash} from "node:crypto";
import {PersonalMemoryStore} from "./personal-memory-store.mjs";
import {createEncryptedMemoryArchive} from "./personal-memory-encrypted-archive.mjs";
import {createOwnedStage,inspectOwnedStage,cleanupOwnedStage} from "./personal-stage-recovery.mjs";

const root=realpathSync(mkdtempSync("/tmp/pm-stage-e2e-"));
const original=join(root,"own"),archive=join(root,"complete.enc"),
 keyFile=join(root,"archive.key"),helper=join(root,"publish");
const archiveKey=randomBytes(32),ownerStatus=()=>({paired:true,mode:"ASK"});
const digest=x=>createHash("sha256").update(x).digest("hex");
writeFileSync(keyFile,archiveKey,{mode:0o600,flag:"wx"});
const cc=spawnSync("/usr/bin/clang",["-std=c11","-D_DARWIN_C_SOURCE",
 "-Wall","-Wextra","-Werror","-O2",fileURLToPath(new URL("./native-restore-publish.c",import.meta.url)),
 "-o",helper],{encoding:"utf8",timeout:10000});
assert.equal(cc.status,0,cc.stderr);chmodSync(helper,0o700);
const helperSha=digest(readFileSync(helper));
let child=null,completed=false;
const runCrash=async(mode,source,destination)=>{
 const receipt=await new Promise((resolve,reject)=>{
  let output="",settled=false;
  child=spawn(process.execPath,[fileURLToPath(new URL("./personal-stage-crash-worker.mjs",import.meta.url)),
   mode,source,destination,keyFile,helper,helperSha],{stdio:["ignore","pipe","pipe"]});
  let errors="";
  child.stderr.on("data",chunk=>{errors=(errors+String(chunk)).slice(-900);});
  child.stdout.on("data",chunk=>{
   output+=String(chunk);
   const match=output.match(/PERSONAL_STAGE_PLAINTEXT_READY ([a-f0-9-]{36})/);
   if(match&&!settled){settled=true;resolve(match[1]);}
  });
  child.once("error",reject);
  child.once("close",(code,signal)=>{
   if(!settled){settled=true;reject(Error("WORKER_EARLY_EXIT "+code+" "+signal+" "+errors));}
  });
  setTimeout(()=>{if(!settled){settled=true;reject(Error("WORKER_TIMEOUT"));}},7000).unref();
 });
 assert.ok(child?.pid);child.kill("SIGKILL");
 await new Promise(resolve=>child.once("close",resolve));
 assert.equal(child.signalCode,"SIGKILL");child=null;
 assert.equal(existsSync(destination),false);
 const input={parentDir:root,kind:mode==="archive"?"archive":"decrypt",
  id:receipt,targetPath:destination,archiveKey};
 const inspected=inspectOwnedStage(input);
 assert.equal(inspected.state,"VERIFIED_OWNED_STAGE");
 assert.equal(inspected.stageIno.length>0,true);
 assert.equal(inspected.fileCount>=4,true);
 assert.throws(()=>inspectOwnedStage({...input,archiveKey:randomBytes(32)}),/STAGE_NOT_OWNED/);
 assert.throws(()=>inspectOwnedStage({...input,targetPath:destination+"-unrelated"}),/STAGE_NOT_OWNED/);
 assert.throws(()=>inspectOwnedStage({...input,id:randomUUID()}),/ENOENT/);
 assert.throws(()=>cleanupOwnedStage({...input,expectedFingerprint:digest("INCORRECT"),
  expectedDev:inspected.stageDev,expectedIno:inspected.stageIno,
  confirmation:"DELETE_VERIFIED_PERSONAL_STAGE"}),/STAGE_PRECONDITION_MISMATCH/);
 assert.throws(()=>cleanupOwnedStage({...input,expectedFingerprint:inspected.fingerprint,
  expectedDev:inspected.stageDev,expectedIno:inspected.stageIno,
  confirmation:"WRONG"}),/STAGE_CONFIRMATION_REQUIRED/);
 const cleaned=cleanupOwnedStage({...input,expectedFingerprint:inspected.fingerprint,
  expectedDev:inspected.stageDev,expectedIno:inspected.stageIno,
  confirmation:"DELETE_VERIFIED_PERSONAL_STAGE"});
 assert.equal(cleaned.state,"CLEANED");
 assert.equal(existsSync(destination),false);
 console.log("PASS SIGKILL "+mode+" exact owned plaintext stage inspected / no generic delete");
};
try{
 const store=new PersonalMemoryStore(original,{initialize:true,ownerStatus});
 store.projectRegister({projectId:"personal",rootLabel:"Local",operationId:randomUUID()});
 store.close();
 await runCrash("archive",original,join(root,"killed.enc"));
 await createEncryptedMemoryArchive({sourceDir:original,archivePath:archive,archiveKey,ownerStatus});
 await runCrash("decrypt",archive,join(root,"killed-root"));
 assert.ok(existsSync(archive));
 // A completed archive must not be mistaken for a failed creation if
 // its transient plaintext-stage cleanup cannot finish.
 const committed=join(root,"committed-cleanup-failure.enc");
 let stuckId=null;
 await assert.rejects(()=>createEncryptedMemoryArchive({
  sourceDir:original,archivePath:committed,archiveKey,ownerStatus,
  testHooks:{afterPlaintextReady:({stageId})=>{
   stuckId=stageId;
   writeFileSync(join(root,".personal-archive-working-"+stageId,"unexpected"),
    "owned test interference",{mode:0o600,flag:"wx"});
  }}
 }),e=>e.message==="ARCHIVE_STAGE_CLEANUP_UNCERTAIN"&&
    e.effect==="COMMITTED"&&e.stageId===stuckId);
 assert.ok(existsSync(committed));
 const stuck=join(root,".personal-archive-working-"+stuckId);
 unlinkSync(join(stuck,"unexpected"));
 const input={parentDir:root,kind:"archive",id:stuckId,targetPath:committed,archiveKey};
 const v=inspectOwnedStage(input);
 cleanupOwnedStage({...input,expectedFingerprint:v.fingerprint,
  expectedDev:v.stageDev,expectedIno:v.stageIno,confirmation:"DELETE_VERIFIED_PERSONAL_STAGE"});
 assert.equal(existsSync(stuck),false);
 console.log("PASS committed archive preserved when transient cleanup is uncertain");
 // A partial cleanup must preserve the durable intent, not recurse into new entries.
 const pending=createOwnedStage({parentDir:root,kind:"decrypt",
  targetPath:join(root,"operator-review"),archiveKey});
 const args={parentDir:root,kind:"decrypt",id:pending.id,
  targetPath:join(root,"operator-review"),archiveKey};
 const before=inspectOwnedStage(args);
 assert.throws(()=>cleanupOwnedStage({...args,expectedFingerprint:before.fingerprint,
  expectedDev:before.stageDev,expectedIno:before.stageIno,
  confirmation:"DELETE_VERIFIED_PERSONAL_STAGE",
  testHooks:{afterCleanupIntent:()=>writeFileSync(join(pending.stage,"unexpected"),
   "late entry",{mode:0o600,flag:"wx"})}}),/STAGE_CLEANUP_UNCERTAIN/);
 assert.throws(()=>inspectOwnedStage(args),/STAGE_CLEANUP_UNCERTAIN/);
 assert.ok(existsSync(join(pending.stage,".personal-stage-cleanup-issued.json")));
 console.log("PASS interrupted cleanup intent retained for manual review");
 completed=true;
 console.log("PERSONAL_STAGE_SIGKILL_RECOVERY=PASS");
}catch(e){console.error("PERSONAL_STAGE_SIGKILL_RECOVERY=FAIL "+e.stack);process.exitCode=1;}
finally{
 if(child?.exitCode===null&&child?.signalCode===null)child.kill("SIGKILL");
 if(completed)rmSync(root,{recursive:true,force:true});
 console.log("isolated_fixture_cleanup="+(completed?"COMPLETE":"RETAINED_FOR_REVIEW"));
}
