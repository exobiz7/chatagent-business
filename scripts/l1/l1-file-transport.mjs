// L0 -> L1 request adapter. Effect status applies only to file mutations.
const mutationRoutes=new Set(["file/write","file/copy","file/create","file/replace"]);
const errorCode=s=>typeof s==="string"&&/^[A-Z][A-Z0-9_]{2,48}$/.test(s)?s:"L1_UNAVAILABLE";
export async function callL1({route,body={},url,token,fetchImpl=fetch}){
 const timeoutMs=["file/hash","file/copy"].includes(route)?120000:30000;
 const mutation=mutationRoutes.has(route);
 const opts={method:"POST",headers:{"content-type":"application/json",
   "x-chatagent-l1-credential":token},body:JSON.stringify(body),
   signal:AbortSignal.timeout(timeoutMs)};
 const uncertain=()=>{
  const e=Error("L1_MUTATION_RESPONSE_UNCERTAIN");
  e.effect="UNCERTAIN";e.retryable=false;
  return e;
 };
 let response;
 try{response=await fetchImpl(url+"/agent/"+route,opts);}
 catch(e){if(mutation)throw uncertain();throw e;}
 let result;
 try{result=await response.json();}
 catch(e){if(mutation)throw uncertain();throw e;}
 if(!result||typeof result!=="object"||Array.isArray(result)){
  if(mutation)throw uncertain();
  throw Error("L1_INVALID_RESPONSE");
 }
 if(!response.ok){
  const e=Error(errorCode(result.code));
  if(["COMMITTED","UNCERTAIN"].includes(result.effect)){
   e.effect=result.effect;e.retryable=false;
  }
  if(result.audit==="UNCERTAIN")e.audit="UNCERTAIN";
  throw e;
 }
 return result;
}
