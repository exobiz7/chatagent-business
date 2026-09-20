import {promises as fs,constants as C} from "node:fs";
import {createHash} from "node:crypto";
import {isAbsolute} from "node:path";

const [source,devText,inoText,sizeText,mtimeText]=process.argv.slice(2);
if(typeof source!=="string"||!isAbsolute(source)||
 [devText,inoText,sizeText,mtimeText].some(x=>typeof x!=="string"||!/^\d+(?:\.\d+)?$/.test(x)))
 throw Error("INVALID_ASYNC_HASH_INPUT");
const expected={dev:Number(devText),ino:Number(inoText),size:Number(sizeText),mtimeMs:Number(mtimeText)};
if(!Object.values(expected).every(Number.isFinite)||!Number.isSafeInteger(expected.size)||
 expected.size<0||expected.size>32*1024*1024*1024)
 throw Error("INVALID_ASYNC_HASH_BOUNDS");
const file=await fs.open(source,C.O_RDONLY|C.O_NOFOLLOW);
let progress=0;
try{
 const original=await file.stat();
 if(!original.isFile()||original.dev!==expected.dev||
    original.ino!==expected.ino||original.size!==expected.size||
    original.mtimeMs!==expected.mtimeMs)throw Error("ASYNC_HASH_SOURCE_CHANGED");
 const hash=createHash("sha256"),buf=Buffer.alloc(1024*1024);
 while(progress<expected.size){
  const {bytesRead}=await file.read(buf,0,Math.min(buf.length,expected.size-progress),progress);
  if(bytesRead<=0)throw Error("ASYNC_HASH_SHORT_READ");
  hash.update(buf.subarray(0,bytesRead));progress+=bytesRead;
  if(progress%(8*1024*1024)<buf.length)
   process.stdout.write(JSON.stringify({event:"HASH_PROGRESS",bytesRead:progress,totalBytes:expected.size})+"\n");
 }
 const last=await file.stat();
 if(last.dev!==original.dev||last.ino!==original.ino||
    last.size!==original.size||last.mtimeMs!==original.mtimeMs)
  throw Error("ASYNC_HASH_SOURCE_CHANGED");
 process.stdout.write(JSON.stringify({event:"HASH_DONE",bytes:progress,sha256:hash.digest("hex")})+"\n");
}catch(error){
 process.stderr.write("ASYNC_HASH_FAILED: "+String(error.message).slice(0,90)+"\n");
 process.exitCode=3;
}finally{await file.close();}
