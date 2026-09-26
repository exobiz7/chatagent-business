import assert from "node:assert/strict";
import {callL1} from "./l1-file-transport.mjs";
import {auditedFileRead,fileEffectDetails} from "./file-effect-status.mjs";
const options={url:"http://127.0.0.1:3110",token:"fixture-only",body:{content:"fixture"}};
const lost=async()=>{throw Error("ECONNRESET: do not disclose transport details");};
const invalid=async()=>({ok:true,json:async()=>{throw SyntaxError("bad JSON");}});
const malformed=async()=>({ok:true,json:async()=>null});
const reply=(ok,content)=>async()=>({ok,json:async()=>content});
const validSha="a".repeat(64);
const receipt=route=>route==="file/copy"
 ?{source:"/tmp/fixture-source",destination:"/tmp/fixture-destination",bytes:7,sha256:validSha,changed:true}
 :{path:"/tmp/fixture-target",bytes:7,sha256:validSha,changed:true};
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
  fetchImpl:reply(true,{...receipt("file/replace"),commitMode:"DIRFD_DUAL_EXLOCK_RENAME_SWAP"})});
 assert.deepEqual(result,{...receipt("file/replace"),commitMode:"DIRFD_DUAL_EXLOCK_RENAME_SWAP"});
 for(const {code,effect} of [
  {code:"HOST_FILE_AUDIT_UNCERTAIN",effect:"COMMITTED"},
  {code:"CAS_POSTCOMMIT_UNCERTAIN",effect:"UNCERTAIN"}
 ]){
  await assert.rejects(()=>callL1({...options,route:"file/replace",
   fetchImpl:reply(false,{code,effect,retryable:false,audit:"UNCERTAIN"})}),e=>
   e.message===code&&e.effect===effect&&
   e.retryable===false&&e.audit==="UNCERTAIN");
 }
 assert.deepEqual(fileEffectDetails(Error("CAS_POSTCOMMIT_UNCERTAIN")),
  {code:"CAS_POSTCOMMIT_UNCERTAIN",effect:"UNCERTAIN",retryable:false});
 assert.deepEqual(fileEffectDetails(Error("CAS_ROLLBACK_UNCERTAIN")),
  {code:"CAS_ROLLBACK_UNCERTAIN",effect:"UNCERTAIN",retryable:false});
 assert.deepEqual(fileEffectDetails(Object.assign(Error("HOST_FILE_AUDIT_UNCERTAIN"),
  {effect:"COMMITTED"})),{code:"HOST_FILE_AUDIT_UNCERTAIN",effect:"COMMITTED",retryable:false});
 await assert.rejects(()=>callL1({...options,route:"file/replace",
  fetchImpl:reply(false,{code:"CAS_PRECONDITION_MISMATCH"})}),e=>
  e.message==="CAS_PRECONDITION_MISMATCH"&&e.effect===undefined);
 for(const route of ["file/create","file/write","file/replace","file/copy"]){
  const good=receipt(route);
  assert.deepEqual(await callL1({...options,route,fetchImpl:reply(true,good)}),good);
  for(const malformedResult of [
   {},{unrelated:true},{...good,bytes:"7"},{...good,sha256:"bad"},
   {...good,changed:false},{...good,changed:undefined},
   {...good,path:"",source:route==="file/copy"?"":good.source},
   {...good,code:"HOST_FILE_COMPLETED"}, {...good,effect:"COMMITTED"}
  ]){
   await assert.rejects(()=>callL1({...options,route,
    fetchImpl:reply(true,malformedResult)}),e=>
    e.message==="L1_MUTATION_RESPONSE_UNCERTAIN"&&e.effect==="UNCERTAIN"&&e.retryable===false);
  }
  for(const malformedError of [
   {},{unrelated:true},{code:42},{code:"not-a-code"},
   {code:"CAS_PRECONDITION_MISMATCH",retryable:true},
   {code:"HOST_FILE_AUDIT_UNCERTAIN",effect:"COMMITTED"},
   {code:"HOST_FILE_AUDIT_UNCERTAIN",effect:"COMMITTED",retryable:false,audit:"BAD"},
   {code:"CAS_PRECONDITION_MISMATCH",changed:true,bytes:7,sha256:validSha},
   {code:"CAS_POSTCOMMIT_UNCERTAIN"},
   {code:"HOST_FILE_AUDIT_UNCERTAIN"},
   {code:"CAS_POSTCOMMIT_UNCERTAIN",effect:"COMMITTED",retryable:false},
   {code:"HOST_FILE_AUDIT_UNCERTAIN",effect:"UNCERTAIN",retryable:false},
   {code:"CAS_PRECONDITION_MISMATCH",effect:"COMMITTED",retryable:false},
   {code:"CAS_PRECONDITION_MISMATCH",effect:"UNCERTAIN",retryable:false},
   {code:"PRECONDITION_MISMATCH",effect:"COMMITTED",retryable:false},
   {code:"PRECONDITION_REQUIRED",effect:"COMMITTED",retryable:false},
   {code:"OPERATION_FAILED",effect:"COMMITTED",retryable:false}
  ]){
   await assert.rejects(()=>callL1({...options,route,
    fetchImpl:reply(false,malformedError)}),e=>
    e.message==="L1_MUTATION_RESPONSE_UNCERTAIN"&&e.effect==="UNCERTAIN"&&e.retryable===false);
  }

  for(const {code,effect} of [
   {code:"CAS_POSTCOMMIT_UNCERTAIN",effect:"UNCERTAIN"},
   {code:"NATIVE_CREATE_TIMEOUT_UNCERTAIN",effect:"UNCERTAIN"},
   {code:"HOST_FILE_AUDIT_UNCERTAIN",effect:"COMMITTED"},
   {code:"OPERATION_FAILED",effect:"UNCERTAIN"}
  ]){
   await assert.rejects(()=>callL1({...options,route,
    fetchImpl:reply(false,{code,effect,retryable:false})}),e=>
     e.message===code&&e.effect===effect&&e.retryable===false);
  }
  for(const code of ["CAS_PRECONDITION_MISMATCH","PRECONDITION_MISMATCH","PRECONDITION_REQUIRED"]){
   await assert.rejects(()=>callL1({...options,route,fetchImpl:reply(false,{code})}),e=>
    e.message===code&&e.effect===undefined&&e.retryable===undefined);
  }
 }
 console.log("PASS F02-R1.1 all four mutation routes enforce known code/effect pairings");
 console.log("PASS F02-R1.1 all mutation routes require complete receipts and valid failure envelopes");
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
