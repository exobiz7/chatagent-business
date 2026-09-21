import assert from "node:assert/strict";
import {callL1} from "./l1-file-transport.mjs";
import {auditedFileRead} from "./file-effect-status.mjs";
const options={url:"http://127.0.0.1:3110",token:"fixture-only",body:{content:"fixture"}};
const lost=async()=>{throw Error("ECONNRESET: do not disclose transport details");};
const invalid=async()=>({ok:true,json:async()=>{throw SyntaxError("bad JSON");}});
const malformed=async()=>({ok:true,json:async()=>null});
const reply=(ok,content)=>async()=>({ok,json:async()=>content});
try{
 for(const route of ["file/create","file/write","file/replace","file/copy"]){
  for(const fetchImpl of [lost,invalid,malformed]){
   await assert.rejects(()=>callL1({...options,route,fetchImpl}),e=>
    e.message==="L1_MUTATION_RESPONSE_UNCERTAIN"&&e.effect==="UNCERTAIN"&&
    e.retryable===false&&!e.message.includes("ECONNRESET"));
  }
 }
 console.log("PASS F02-R1 file mutation fetch, JSON and malformed response are UNCERTAIN, never retryable");
 const result=await callL1({...options,route:"file/replace",
  fetchImpl:reply(true,{sha256:"fixture-digest",changed:true})});
 assert.deepEqual(result,{sha256:"fixture-digest",changed:true});
 for(const effect of ["COMMITTED","UNCERTAIN"]){
  await assert.rejects(()=>callL1({...options,route:"file/replace",
   fetchImpl:reply(false,{code:"HOST_FILE_AUDIT_UNCERTAIN",effect,audit:"UNCERTAIN"})}),e=>
   e.message==="HOST_FILE_AUDIT_UNCERTAIN"&&e.effect===effect&&
   e.retryable===false&&e.audit==="UNCERTAIN");
 }
 await assert.rejects(()=>callL1({...options,route:"file/replace",
  fetchImpl:reply(false,{code:"CAS_PRECONDITION_MISMATCH"})}),e=>
  e.message==="CAS_PRECONDITION_MISMATCH"&&e.effect===undefined);
 console.log("PASS F02-R1 normal L1 success, COMMITTED/UNCERTAIN and known rejection preserved");
 for(const route of ["file/read","file/hash","status","process/start","async-copy/start"]){
  for(const fetchImpl of [lost,invalid]){
   await assert.rejects(()=>callL1({...options,route,fetchImpl}),e=>
    e.effect===undefined&&e.retryable===undefined&&
    e.message!=="L1_MUTATION_RESPONSE_UNCERTAIN");
  }
 }
 console.log("PASS F02-R1 unrelated read/process/copy-start errors do not claim file mutation effect");
 const events=[];
 const broker={record:(event,metadata)=>events.push({event,metadata}),save:()=>{}};
 const read=await auditedFileRead(broker,"read","test-hash",async()=>({content:"fixture"}));
 assert.equal(read.content,"fixture");
 assert.deepEqual(events.map(e=>e.event),["HOST_FILE_COMPLETED"]);
 assert.deepEqual(events[0].metadata,{operation:"read",pathDigest:"test-hash"});
 await assert.rejects(()=>auditedFileRead(broker,"stat","test-hash",async()=>{
  throw Error("HOST_PATH_DENIED");
 }),/HOST_PATH_DENIED/);
 assert.deepEqual(events.map(e=>e.event),["HOST_FILE_COMPLETED","HOST_FILE_FAILED"]);
 const badAudit={record(){},save(){throw Error("EIO");}};
 await assert.rejects(()=>auditedFileRead(badAudit,"list","test-hash",async()=>({
  entries:[]})),e=>e.message==="HOST_FILE_READ_AUDIT_FAILED"&&
  e.audit==="UNCERTAIN"&&e.effect===undefined);
 await assert.rejects(()=>auditedFileRead(badAudit,"read","test-hash",
  async()=>{throw Error("ORIGINAL_READ_FAILED");}),e=>
  e.message==="ORIGINAL_READ_FAILED"&&e.audit==="UNCERTAIN");
 console.log("PASS read-only completion/failure audit restored; no fake mutation effect");
 console.log("PERSONAL_F02_R1_TEST=PASS");
}catch(e){console.error("PERSONAL_F02_R1_TEST=FAIL "+e.stack);process.exitCode=1;}
