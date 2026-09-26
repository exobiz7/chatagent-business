import {spawnSync} from "node:child_process";
import assert from "node:assert/strict";
import {mkdtempSync,realpathSync,readFileSync,rmSync,existsSync,lstatSync,chmodSync} from "node:fs";
import {join} from "node:path";
import {randomUUID,randomBytes,createHash} from "node:crypto";
import {PersonalMemoryStore} from "./personal-memory-store.mjs";
import {createEncryptedMemoryArchive,restoreEncryptedMemoryArchive,
 rotateEncryptedMemoryArchive} from "./personal-memory-encrypted-archive.mjs";
const root=realpathSync(mkdtempSync(join("/tmp","pm-aes-")));
const source=join(root,"original"),archive=join(root,"sealed.json"),restore=join(root,"restored");
const ownerStatus=()=>({paired:true,mode:"ASK"}),archiveKey=randomBytes(32);
const publishHelperPath=join(root,"publish");
const cc=spawnSync("/usr/bin/clang",["-std=c11","-D_DARWIN_C_SOURCE","-Wall","-Wextra","-Werror","-O2",
 new URL("./native-restore-publish.c",import.meta.url).pathname,"-o",publishHelperPath],
 {encoding:"utf8",timeout:10000});
assert.equal(cc.status,0,cc.stderr);chmodSync(publishHelperPath,0o700);
const publishHelperSha256=createHash("sha256").update(readFileSync(publishHelperPath)).digest("hex");
const publish={publishHelperPath,publishHelperSha256};
let store=null;
try{
 store=new PersonalMemoryStore(source,{initialize:true,ownerStatus});
 store.projectRegister({projectId:"personal-lab",rootLabel:"Personal",operationId:randomUUID()});
 const task=store.taskStart({projectId:"personal-lab",title:"Encrypted archive",operationId:randomUUID()});
 store.checkpointAppend({projectId:"personal-lab",taskId:task.taskId,expectedTaskRevision:0,
  operationId:randomUUID(),summary:"Confidential personal checkpoint",
  currentState:"Independent memory",nextActions:[],verification:"PASS"});
 const created=await createEncryptedMemoryArchive({sourceDir:source,archivePath:archive,
  archiveKey,ownerStatus,...publish});
 assert.equal(created.encrypted,true);assert.equal(created.containsPlaintextSealKey,false);
 const ciphertext=readFileSync(archive,"utf8");
 assert.equal(lstatSync(archive).mode&0o077,0);
 assert.doesNotMatch(ciphertext,/Confidential personal checkpoint|memory-seal.key|PersonalMemoryStore/);
 assert.equal(ciphertext.includes(readFileSync(join(source,"memory-seal.key")).toString("base64")),false);
 assert.equal(ciphertext.includes(readFileSync(join(source,"memory-head.json")).toString("base64")),false);
 await assert.rejects(()=>createEncryptedMemoryArchive({sourceDir:source,
  archivePath:join(root,"unsafe-reused-key.json"),
  archiveKey:readFileSync(join(source,"memory-seal.key")),ownerStatus}),
  /ARCHIVE_KEY_REUSE_DENIED/);
 assert.equal(existsSync(join(root,"unsafe-reused-key.json")),false);
 await assert.rejects(()=>createEncryptedMemoryArchive({sourceDir:source,archivePath:archive,
  archiveKey,ownerStatus,...publish}),/ARCHIVE_NEW_PATH_REQUIRED/);
 assert.throws(()=>restoreEncryptedMemoryArchive({archivePath:archive,destinationDir:join(root,"bad-key"),
  archiveKey:randomBytes(32),ownerStatus,...publish}),/ARCHIVE_AUTHENTICATION_FAILED/);
 assert.equal(existsSync(join(root,"bad-key")),false);
 const saved=readFileSync(archive,"utf8"),obj=JSON.parse(saved);
 const tampered=Buffer.from(obj.ciphertext,"base64");tampered[2]^=0x80;
 const alt=join(root,"tampered.json");
 const {writeFileSync}=await import("node:fs");
 writeFileSync(alt,JSON.stringify({...obj,ciphertext:tampered.toString("base64")})+"\n",{mode:0o600,flag:"wx"});
 assert.throws(()=>restoreEncryptedMemoryArchive({archivePath:alt,destinationDir:join(root,"tampered"),
  archiveKey,ownerStatus,...publish}),/ARCHIVE_AUTHENTICATION_FAILED/);
 assert.equal(existsSync(join(root,"tampered")),false);
 // The exact helper hash is mandatory; a wrong pin must not create a root.
 const untrusted=join(root,"untrusted-helper-root");
 assert.throws(()=>restoreEncryptedMemoryArchive({archivePath:archive,destinationDir:untrusted,
  archiveKey,ownerStatus,publishHelperPath,publishHelperSha256:"0".repeat(64)}),
  /BACKUP_HELPER_HASH_MISMATCH/);
 assert.equal(existsSync(untrusted),false);
 const done=restoreEncryptedMemoryArchive({archivePath:archive,destinationDir:restore,archiveKey,ownerStatus,...publish});
 assert.equal(done.verified,true);assert.equal(done.encryptedSource,true);
 const reopened=new PersonalMemoryStore(restore,{ownerStatus});
 assert.equal(reopened.taskGet({projectId:"personal-lab",taskId:task.taskId}).task.checkpoints[0].summary,
  "Confidential personal checkpoint");
 reopened.close();
 assert.throws(()=>restoreEncryptedMemoryArchive({archivePath:archive,destinationDir:restore,
  archiveKey,ownerStatus,...publish}),/ARCHIVE_NEW_PATH_REQUIRED/);
 const newKey=randomBytes(32),rotated=join(root,"rotated.json");
 assert.throws(()=>rotateEncryptedMemoryArchive({archivePath:archive,newArchivePath:rotated,
  oldArchiveKey:archiveKey,newArchiveKey:archiveKey,ownerStatus}),/ARCHIVE_ROTATION_SAME_KEY/);
 assert.throws(()=>rotateEncryptedMemoryArchive({archivePath:archive,newArchivePath:rotated,
  oldArchiveKey:randomBytes(32),newArchiveKey:newKey,ownerStatus}),/ARCHIVE_AUTHENTICATION_FAILED/);
 assert.equal(existsSync(rotated),false);
 const result=rotateEncryptedMemoryArchive({archivePath:archive,newArchivePath:rotated,
  oldArchiveKey:archiveKey,newArchiveKey:newKey,ownerStatus});
 assert.equal(result.rotated,true);assert.equal(result.oldArchiveRetained,true);
 const check=join(root,"rotation-check");
 assert.throws(()=>restoreEncryptedMemoryArchive({archivePath:rotated,destinationDir:check,
  archiveKey,ownerStatus,...publish}),/ARCHIVE_AUTHENTICATION_FAILED/);
 assert.equal(existsSync(check),false);
 assert.equal(restoreEncryptedMemoryArchive({archivePath:rotated,destinationDir:check,
  archiveKey:newKey,ownerStatus,...publish}).verified,true);
 const afterRotation=new PersonalMemoryStore(check,{ownerStatus});
 assert.equal(afterRotation.taskGet({projectId:"personal-lab",taskId:task.taskId})
  .task.checkpoints[0].summary,"Confidential personal checkpoint");
 afterRotation.close();
 assert.equal(existsSync(archive),true);
 assert.equal(readFileSync(archive,"utf8"),saved);
 assert.equal(existsSync(rotated),true);
 assert.notEqual(readFileSync(rotated,"utf8"),saved);
 console.log("PASS new-file offline archive rotation, old archive retained, wrong key rejected");
 console.log("PASS AES-256-GCM archive hides personal checkpoint and seal key");
 console.log("PASS wrong key / changed ciphertext refusal and verified new-root restore");
 console.log("PASS pinned native helper SHA mismatch denied before destination creation");
 console.log("PASS rotated-key restore reopens same checkpoint; original archive retained");
 console.log("PERSONAL_MEMORY_ENCRYPTED_ARCHIVE=PASS");
}catch(e){console.error("PERSONAL_MEMORY_ENCRYPTED_ARCHIVE=FAIL "+e.stack);process.exitCode=1;}
finally{try{store?.close();}catch{}rmSync(root,{recursive:true,force:true});console.log("isolated_fixture_cleanup=COMPLETE");}
