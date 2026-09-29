import { fileURLToPath } from "node:url";
import {spawnSync} from "node:child_process";
import assert from "node:assert/strict";
import {mkdtempSync,realpathSync,mkdirSync,readFileSync,writeFileSync,rmSync,existsSync,chmodSync,statSync,renameSync} from "node:fs";
import {join} from "node:path";
import {randomUUID,createHash} from "node:crypto";
import {PersonalMemoryStore} from "./personal-memory-store.mjs";
import {backupPersonalMemory,restorePersonalMemory} from "./personal-memory-backup.mjs";
const root=realpathSync(mkdtempSync(join("/tmp","pm-backup-")));
const original=join(root,"own"),bundle=join(root,"backup"),restored=join(root,"restored");
const ownerStatus=()=>({paired:true,mode:"ASK"}),uuid=randomUUID;
const publishHelperPath=join(root,"publish");
const cc=spawnSync("/usr/bin/clang",["-std=c11","-D_DARWIN_C_SOURCE","-Wall","-Wextra","-Werror","-O2",
 fileURLToPath(new URL("./native-restore-publish.c",import.meta.url)),"-o",publishHelperPath],
 {encoding:"utf8",timeout:10000});
assert.equal(cc.status,0,cc.stderr);chmodSync(publishHelperPath,0o700);
const publishHelperSha256=createHash("sha256").update(readFileSync(publishHelperPath)).digest("hex");
const publish={publishHelperPath,publishHelperSha256};
const run=async()=>{
 let store=new PersonalMemoryStore(original,{initialize:true,ownerStatus});
 try{
  store.projectRegister({projectId:"alpha",rootLabel:"Private",operationId:uuid()});
  const task=store.taskStart({projectId:"alpha",title:"Backup task",operationId:uuid()});
  store.checkpointAppend({projectId:"alpha",taskId:task.taskId,expectedTaskRevision:0,
   operationId:uuid(),summary:"Snapshot checked",currentState:"Self-owned key",
   nextActions:["Recover"],verification:"PASS"});
  const backed=await backupPersonalMemory({sourceDir:original,destinationDir:bundle,ownerStatus});
  assert.equal(backed.seq,3);assert.equal(backed.verified,true);
  assert.equal(statSync(bundle).mode&0o077,0);
  assert.equal(statSync(join(bundle,"memory-seal.key")).mode&0o077,0);
  assert.equal(statSync(join(bundle,"memory.sqlite")).mode&0o077,0);
  await assert.rejects(()=>backupPersonalMemory({sourceDir:original,destinationDir:bundle,ownerStatus}),
    /BACKUP_DESTINATION_EXISTS/);
  console.log("PASS independent SQLite snapshot, sealed manifest, private backup and no overwrite");
  const result=restorePersonalMemory({backupDir:bundle,destinationDir:restored,ownerStatus,...publish});
  assert.equal(result.seq,3);assert.equal(result.verified,true);
  await assert.rejects(async()=>restorePersonalMemory({backupDir:bundle,destinationDir:restored,ownerStatus,...publish}),
    /BACKUP_DESTINATION_EXISTS/);
  const newStore=new PersonalMemoryStore(restored,{ownerStatus});
  assert.equal(newStore.taskGet({projectId:"alpha",taskId:task.taskId}).task.checkpoints.length,1);
  newStore.close();
  console.log("PASS verified new-root restore, same task/checkpoint and no existing-root replacement");
  // Destination is introduced after preflight: native RENAME_EXCL must refuse.
  const racing=join(root,"destination-race");
  assert.throws(()=>restorePersonalMemory({backupDir:bundle,destinationDir:racing,
   ownerStatus,...publish,testHooks:{beforePublish:({destinationDir})=>{
    mkdirSync(destinationDir,{mode:0o700});
    writeFileSync(join(destinationDir,"protected"),"ORIGINAL",{mode:0o600});
   }}}),/BACKUP_DESTINATION_EXISTS/);
  assert.equal(readFileSync(join(racing,"protected"),"utf8"),"ORIGINAL");
  console.log("PASS native conditional directory publish denies between-check destination collision");
  // A swapped staging directory must never be recursively removed.
  const blocked=join(root,"blocked-restore"),quarantine=join(root,"retained-original-stage");
  let replacement=null;
  assert.throws(()=>restorePersonalMemory({backupDir:bundle,destinationDir:blocked,
   ownerStatus,...publish,testHooks:{
    beforePublish:({destinationDir})=>{
     mkdirSync(destinationDir,{mode:0o700});
     writeFileSync(join(destinationDir,"protected"),"ORIGINAL",{mode:0o600,flag:"wx"});
    },
    beforeCleanup:({path})=>{
     replacement=path;
     renameSync(path,quarantine);
     mkdirSync(path,{mode:0o700});
     writeFileSync(join(path,"protected"),"REPLACEMENT",{mode:0o600,flag:"wx"});
    }
   }}),e=>e.message==="BACKUP_DESTINATION_EXISTS"&&e.cleanupState==="UNCERTAIN"&&
      e.stagePath===replacement);
  assert.equal(readFileSync(join(blocked,"protected"),"utf8"),"ORIGINAL");
  assert.equal(readFileSync(join(replacement,"protected"),"utf8"),"REPLACEMENT");
  assert.ok(existsSync(join(quarantine,"memory.sqlite")));
  console.log("PASS substituted restore stage retained; existing target untouched");

  const manifest=join(bundle,"backup-manifest.json"),before=readFileSync(manifest);
  writeFileSync(manifest,before.toString().replace('"schemaVersion":1','"schemaVersion":2'));
  assert.throws(()=>restorePersonalMemory({backupDir:bundle,
   destinationDir:join(root,"tamper"),ownerStatus,...publish}),/BACKUP_MANIFEST_INVALID|BACKUP_MANIFEST_TAMPERED/);
  assert.equal(existsSync(join(root,"tamper")),false);
  writeFileSync(manifest,before);
  const key=join(bundle,"memory-seal.key");const keyBefore=readFileSync(key);
  writeFileSync(key,Buffer.alloc(32,0));
  assert.throws(()=>restorePersonalMemory({backupDir:bundle,
   destinationDir:join(root,"keychanged"),ownerStatus,...publish}),/BACKUP_MANIFEST_TAMPERED|MEMORY_RECOVERY_REQUIRED/);
  assert.equal(existsSync(join(root,"keychanged")),false);
  writeFileSync(key,keyBefore);
  console.log("PASS tampered manifest/key refusal without any destination creation");
  const interrupted=join(root,"interrupted");
  await assert.rejects(()=>backupPersonalMemory({sourceDir:original,destinationDir:interrupted,
   ownerStatus,testHooks:{beforeSnapshot:()=>{throw Error("TEST_INTERRUPTED");}}}),
   /TEST_INTERRUPTED/);
  assert.equal(existsSync(interrupted),false);
  // Preserve the primary operation error and an unexpected entry, with no sweep.
  const intruded=join(root,"interrupted-with-foreign-entry");
  await assert.rejects(()=>backupPersonalMemory({sourceDir:original,
   destinationDir:intruded,ownerStatus,testHooks:{
    beforeSnapshot:()=>{throw Error("TEST_EXPECTED_ABORT");},
    beforeCleanup:({path})=>{
     writeFileSync(join(path,"unrelated"),"PRESERVE",{mode:0o600,flag:"wx"});
    }
   }}),e=>e.message==="TEST_EXPECTED_ABORT"&&e.cleanupState==="UNCERTAIN"&&
       e.stagePath===intruded);
  assert.equal(readFileSync(join(intruded,"unrelated"),"utf8"),"PRESERVE");
  console.log("PASS interrupted backup cleanup refuses unexpected entry");

  await assert.rejects(()=>backupPersonalMemory({sourceDir:original,
   destinationDir:join(root,"unpaired"),ownerStatus:()=>({paired:false})}),/BACKUP_OWNER_REQUIRED/);
  const concurrentlyChanged=join(root,"changed-source");
  await assert.rejects(()=>backupPersonalMemory({sourceDir:original,
   destinationDir:concurrentlyChanged,ownerStatus,testHooks:{beforeSnapshot:()=>{
    store.taskStart({projectId:"alpha",title:"Concurrent source write",operationId:uuid()});
   }}}),/BACKUP_SOURCE_CHANGED/);
  assert.equal(existsSync(concurrentlyChanged),false);
  console.log("PASS source-sequence mismatch rejects non-quiescent snapshot with no published backup");
  console.log("PASS fail-closed interrupted backup and owner gate");
  console.log("PERSONAL_MEMORY_BACKUP_TEST=PASS");
 }finally{store.close();}
};
try{await run();}
catch(e){console.error("PERSONAL_MEMORY_BACKUP_TEST=FAIL "+e.stack);process.exitCode=1;}
finally{rmSync(root,{recursive:true,force:true});console.log("isolated_fixture_cleanup=COMPLETE");}
