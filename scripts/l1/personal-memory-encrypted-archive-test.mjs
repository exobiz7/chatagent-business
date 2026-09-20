import assert from "node:assert/strict";
import {mkdtempSync,realpathSync,readFileSync,rmSync,existsSync,lstatSync} from "node:fs";
import {join} from "node:path";
import {randomUUID,randomBytes} from "node:crypto";
import {PersonalMemoryStore} from "./personal-memory-store.mjs";
import {createEncryptedMemoryArchive,restoreEncryptedMemoryArchive} from "./personal-memory-encrypted-archive.mjs";
const root=realpathSync(mkdtempSync(join("/tmp","pm-aes-")));
const source=join(root,"original"),archive=join(root,"sealed.json"),restore=join(root,"restored");
const ownerStatus=()=>({paired:true,mode:"ASK"}),archiveKey=randomBytes(32);
let store=null;
try{
 store=new PersonalMemoryStore(source,{initialize:true,ownerStatus});
 store.projectRegister({projectId:"personal-lab",rootLabel:"Personal",operationId:randomUUID()});
 const task=store.taskStart({projectId:"personal-lab",title:"Encrypted archive",operationId:randomUUID()});
 store.checkpointAppend({projectId:"personal-lab",taskId:task.taskId,expectedTaskRevision:0,
  operationId:randomUUID(),summary:"Confidential personal checkpoint",
  currentState:"Independent memory",nextActions:[],verification:"PASS"});
 const created=await createEncryptedMemoryArchive({sourceDir:source,archivePath:archive,
  archiveKey,ownerStatus});
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
  archiveKey,ownerStatus}),/ARCHIVE_NEW_PATH_REQUIRED/);
 assert.throws(()=>restoreEncryptedMemoryArchive({archivePath:archive,destinationDir:join(root,"bad-key"),
  archiveKey:randomBytes(32),ownerStatus}),/ARCHIVE_AUTHENTICATION_FAILED/);
 assert.equal(existsSync(join(root,"bad-key")),false);
 const saved=readFileSync(archive,"utf8"),obj=JSON.parse(saved);
 const tampered=Buffer.from(obj.ciphertext,"base64");tampered[2]^=0x80;
 const alt=join(root,"tampered.json");
 const {writeFileSync}=await import("node:fs");
 writeFileSync(alt,JSON.stringify({...obj,ciphertext:tampered.toString("base64")})+"\n",{mode:0o600,flag:"wx"});
 assert.throws(()=>restoreEncryptedMemoryArchive({archivePath:alt,destinationDir:join(root,"tampered"),
  archiveKey,ownerStatus}),/ARCHIVE_AUTHENTICATION_FAILED/);
 assert.equal(existsSync(join(root,"tampered")),false);
 const done=restoreEncryptedMemoryArchive({archivePath:archive,destinationDir:restore,archiveKey,ownerStatus});
 assert.equal(done.verified,true);assert.equal(done.encryptedSource,true);
 const reopened=new PersonalMemoryStore(restore,{ownerStatus});
 assert.equal(reopened.taskGet({projectId:"personal-lab",taskId:task.taskId}).task.checkpoints[0].summary,
  "Confidential personal checkpoint");
 reopened.close();
 assert.throws(()=>restoreEncryptedMemoryArchive({archivePath:archive,destinationDir:restore,
  archiveKey,ownerStatus}),/ARCHIVE_NEW_PATH_REQUIRED/);
 console.log("PASS AES-256-GCM archive hides personal checkpoint and seal key");
 console.log("PASS wrong key / changed ciphertext refusal and verified new-root restore");
 console.log("PERSONAL_MEMORY_ENCRYPTED_ARCHIVE=PASS");
}catch(e){console.error("PERSONAL_MEMORY_ENCRYPTED_ARCHIVE=FAIL "+e.stack);process.exitCode=1;}
finally{try{store?.close();}catch{}rmSync(root,{recursive:true,force:true});console.log("isolated_fixture_cleanup=COMPLETE");}
