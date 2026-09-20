// Test-only worker: parent SIGKILLs this exact process after real plaintext is ready.
import {readFileSync} from "node:fs";
import {createEncryptedMemoryArchive,restoreEncryptedMemoryArchive} from "./personal-memory-encrypted-archive.mjs";
const [mode,source,output,keyFile,helper,helperSha]=process.argv.slice(2);
const archiveKey=readFileSync(keyFile);
const onReady=({stageId})=>{
 process.stdout.write("PERSONAL_STAGE_PLAINTEXT_READY "+stageId+"\n");
 // The parent can now terminate *only this process*. Never resumes its work.
 setInterval(()=>{},10000);
};
if(mode==="archive"){
 await createEncryptedMemoryArchive({sourceDir:source,archivePath:output,archiveKey,
  ownerStatus:()=>({paired:true}),testHooks:{afterPlaintextReady:onReady}});
}else if(mode==="decrypt"){
 restoreEncryptedMemoryArchive({archivePath:source,destinationDir:output,archiveKey,
  ownerStatus:()=>({paired:true}),publishHelperPath:helper,publishHelperSha256:helperSha,
  testHooks:{afterPlaintextReady:onReady}});
}else{throw Error("INVALID_TEST_STAGE_MODE");}
