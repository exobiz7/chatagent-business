// Test-only worker: parent SIGKILLs this exact process after real plaintext is ready.
import {readFileSync,writeSync} from "node:fs";
import {createEncryptedMemoryArchive,restoreEncryptedMemoryArchive} from "./personal-memory-encrypted-archive.mjs";
const [mode,source,output,keyFile,helper,helperSha]=process.argv.slice(2);
const archiveKey=readFileSync(keyFile);
const onReady=({stageId})=>{
 // Synchronous pipe write and bounded, blocking test-only hold: the source
 // cannot finish/publish before the parent kills this exact child PID.
 writeSync(1,"PERSONAL_STAGE_PLAINTEXT_READY "+stageId+"\n");
 Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,15000);
 throw Error("TEST_HOLD_EXPIRED_WITHOUT_SIGKILL");
};
if(mode==="archive"){
 await createEncryptedMemoryArchive({sourceDir:source,archivePath:output,archiveKey,
  ownerStatus:()=>({paired:true}),testHooks:{afterPlaintextReady:onReady}});
}else if(mode==="decrypt"){
 restoreEncryptedMemoryArchive({archivePath:source,destinationDir:output,archiveKey,
  ownerStatus:()=>({paired:true}),publishHelperPath:helper,publishHelperSha256:helperSha,
  testHooks:{afterPlaintextReady:onReady}});
}else{throw Error("INVALID_TEST_STAGE_MODE");}
