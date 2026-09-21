// L0 -> L1 request adapter. Effect status applies only to file mutations.
const mutationRoutes=new Set(["file/write","file/copy","file/create","file/replace"]);
const validCode=s=>typeof s==="string"&&/^[A-Z][A-Z0-9_]{2,48}$/.test(s);
const validHash=s=>typeof s==="string"&&/^[a-f0-9]{64}$/.test(s);
const validPath=s=>typeof s==="string"&&s.length>0;
const validReceipt=(route,r)=>{
 if(r.changed!==true||!Number.isSafeInteger(r.bytes)||r.bytes<0||
    !validHash(r.sha256)||r.code!==undefined||r.effect!==undefined||
    r.retryable!==undefined||r.audit!==undefined)return false;
 return route==="file/copy"
  ?validPath(r.source)&&validPath(r.destination)
  :validPath(r.path);
};
const validFailure=r=>validCode(r.code)&&
 r.changed===undefined&&r.bytes===undefined&&r.sha256===undefined&&
 r.path===undefined&&r.source===undefined&&r.destination===undefined&&
 (r.effect===undefined||["COMMITTED","UNCERTAIN"].includes(r.effect))&&
 (r.retryable===undefined||r.retryable===false)&&
 (r.effect===undefined||r.retryable===false)&&
 (r.audit===undefined||r.audit==="UNCERTAIN");
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
  if(mutation&&!validFailure(result))throw uncertain();
  const e=Error(validCode(result.code)?result.code:"L1_UNAVAILABLE");
  if(["COMMITTED","UNCERTAIN"].includes(result.effect)){
   e.effect=result.effect;e.retryable=false;
  }
  if(result.audit==="UNCERTAIN")e.audit="UNCERTAIN";
  throw e;
 }
 if(mutation&&!validReceipt(route,result))throw uncertain();
 return result;
}
