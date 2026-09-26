import assert from "node:assert/strict";
import {boundedJSONBody} from "./bounded-json-body.mjs";
import {auditedFileMutation,fileEffectDetails} from "./file-effect-status.mjs";
const payload=Buffer.from(JSON.stringify({content:"한글🌿💡-끝",argv:["/tmp/한글"]}),"utf8");
const old=chunks=>chunks.reduce((s,c)=>s+c,"");
try{
 const unicode=Buffer.from("한","utf8"),at=payload.indexOf(unicode);
 assert.ok(at>0);
 const parts=[payload.subarray(0,at+1),payload.subarray(at+1,at+2),payload.subarray(at+2)];
 assert.notEqual(JSON.parse(old(parts)).content,"한글🌿💡-끝");
 const fake={async *[Symbol.asyncIterator](){for(const part of parts)yield part;}};
 const decoded=await boundedJSONBody(fake,{maxBytes:payload.length});
 assert.equal(decoded.body.content,"한글🌿💡-끝");
 assert.deepEqual(decoded.body.argv,["/tmp/한글"]);
 assert.equal(decoded.bytes,payload.length);
 await assert.rejects(()=>boundedJSONBody(fake,{maxBytes:payload.length-1}),/PAYLOAD_LIMIT/);
 const invalid={async *[Symbol.asyncIterator](){yield Buffer.from([0x7b,0x22,0x78,0x22,0x3a,0x22,0xc3,0x22,0x7d]);}};
 await assert.rejects(()=>boundedJSONBody(invalid),/INVALID_UTF8/);
 console.log("PASS F01 actual old boundary corruption reproduced; strict byte-bounded decoder preserves Unicode");
 let save=0,executed=0;
 const broker={record(){},save(){save++;if(save===2)throw Error("EIO");}};
 await assert.rejects(()=>auditedFileMutation(broker,"replace","digest",async()=>{
  executed++;return {changed:true};
 }),e=>e.message==="HOST_FILE_AUDIT_UNCERTAIN"&&e.effect==="COMMITTED"&&e.retryable===false);
 assert.equal(executed,1);
 assert.deepEqual(fileEffectDetails(Object.assign(Error("HOST_FILE_AUDIT_UNCERTAIN"),{effect:"COMMITTED"})),
  {code:"HOST_FILE_AUDIT_UNCERTAIN",effect:"COMMITTED",retryable:false});
 const denied={record(){},save(){throw Error("EIO");}};
 await assert.rejects(()=>auditedFileMutation(denied,"create","digest",async()=>{
  executed++;}),/EIO/);
 assert.equal(executed,1);
 const auditUncertain={record(){},save(){save++;if(save>1)throw Error("EIO");}};
 save=0;
 await assert.rejects(()=>auditedFileMutation(auditUncertain,"replace","digest",
  async()=>{throw Error("CAS_POSTCOMMIT_UNCERTAIN");}),e=>
   e.message==="CAS_POSTCOMMIT_UNCERTAIN"&&e.audit==="UNCERTAIN");
 assert.deepEqual(fileEffectDetails(Error("CAS_POSTCOMMIT_UNCERTAIN")),
  {code:"CAS_POSTCOMMIT_UNCERTAIN",effect:"UNCERTAIN",retryable:false});
 console.log("PASS F02 post-effect audit failure is COMMITTED; primary uncertain status preserved");
 console.log("PERSONAL_F01_F02_CONTRACT=PASS");
}catch(e){console.error("PERSONAL_F01_F02_CONTRACT=FAIL "+e.stack);process.exitCode=1;}
