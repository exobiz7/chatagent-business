// Preserve raw HTTP bytes across transport chunk boundaries before strict decoding.
export async function boundedJSONBody(req,{maxBytes=8192,oversizeCode="PAYLOAD_LIMIT"}={}){
 if(!Number.isSafeInteger(maxBytes)||maxBytes<1)throw Error("INVALID_BODY_LIMIT");
 const chunks=[];let length=0;
 for await(const chunk of req){
  const bytes=Buffer.isBuffer(chunk)?chunk:Buffer.from(chunk);
  length+=bytes.length;
  if(length>maxBytes)throw Error(oversizeCode);
  chunks.push(bytes);
 }
 let raw;
 try{raw=new TextDecoder("utf-8",{fatal:true}).decode(Buffer.concat(chunks,length));}
 catch{throw Error("INVALID_UTF8");}
 let body;
 try{body=JSON.parse(raw||"{}");}catch{throw Error("INVALID_JSON");}
 return {body,bytes:length};
}
