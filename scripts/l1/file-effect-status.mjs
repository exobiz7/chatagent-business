// Narrow file-effect result classifications. Never infer "not executed" from I/O.
const codeOf=e=>{
 const message=String(e?.message??"");
 if(/^[A-Z][A-Z0-9_]{2,48}$/.test(message))return message;
 const code=typeof e?.code==="string"?e.code:"";
 return /^[A-Z][A-Z0-9_]{2,48}$/.test(code)?code:"OPERATION_FAILED";
};
export const fileEffectDetails=e=>{
 const code=codeOf(e);
 if(e?.effect==="COMMITTED")return {code,effect:"COMMITTED",retryable:false};
 if(e?.effect==="UNCERTAIN"||/_UNCERTAIN$/.test(code))
  return {code,effect:"UNCERTAIN",retryable:false};
 return {code};
};
export async function auditedFileMutation(broker,op,pathDigest,execute){
 // Persist intent before the effect; an intent failure prevents execution.
 broker.record("HOST_FILE_ISSUED",{operation:op,pathDigest});broker.save();
 let result;
 try{result=await execute();}
 catch(e){
  // Never hide the primary cause if the failure audit itself is uncertain.
  try{broker.record("HOST_FILE_FAILED",{operation:op,pathDigest,code:codeOf(e)});
      broker.save();}
  catch{e.audit="UNCERTAIN";}
  throw e;
 }
 // A completed effect and a failed audit are two different outcomes.
 try{broker.record("HOST_FILE_COMPLETED",{operation:op,pathDigest});broker.save();}
 catch{
  const e=Error("HOST_FILE_AUDIT_UNCERTAIN");
  e.effect="COMMITTED";e.retryable=false;
  throw e;
 }
 return result;
}
