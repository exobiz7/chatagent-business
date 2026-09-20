import { L1Broker } from "./broker-core.mjs";
import { readFileSync } from "node:fs";
import http from "node:http";
import readline from "node:readline/promises";
import { stdin, stdout } from "node:process";

const dir=process.env.L1_STATE_DIR;
if(!dir)throw Error("L1_STATE_DIR_REQUIRED");
const [action,arg]=process.argv.slice(2);
const valid=new Set(["init","pair","status","pending","grants","approve","revoke","mode","audit"]);
if(!valid.has(action))throw Error("USAGE: owner-cli init|pair|status|pending|grants|approve ID|revoke ID|mode MODE|audit");
if(!stdin.isTTY||!stdout.isTTY)throw Error("OWNER_TERMINAL_REQUIRED");
function askVisible(question){
 const rl=readline.createInterface({input:stdin,output:stdout});
 return rl.question(question).finally(()=>rl.close());
}
async function hidden(question){
 stdout.write(question);
 const wasRaw=stdin.isRaw;stdin.setRawMode(true);stdin.resume();
 return new Promise((resolve,reject)=>{
  let value="";
  const cleanup=()=>{stdin.off("data",receive);stdin.setRawMode(!!wasRaw);stdout.write("\n");};
  function receive(buf){
   for(const c of buf.toString("utf8")){
    if(c==="\r"||c==="\n"){cleanup();resolve(value);return;}
    if(c==="\u0003"){cleanup();reject(Error("CANCELLED"));return;}
    if(c==="\u007f"){value=value.slice(0,-1);continue;}
    if(c>=" "&&c!=="\u007f"&&value.length<256)value+=c;
   }
  }
  stdin.on("data",receive);
 });
}
function ownerRpc(route, data){
 return new Promise((resolve,reject)=>{
  const body=JSON.stringify(data);
  const req=http.request({socketPath:dir+"/owner.sock",path:"/owner/"+route,method:"POST",
   headers:{"content-type":"application/json","content-length":Buffer.byteLength(body)},timeout:5000},r=>{
    let raw="";r.on("data",x=>{raw+=x;if(raw.length>32768)req.destroy(Error("BODY_LIMIT"));});
    r.on("end",()=>{try{const o=JSON.parse(raw);if(r.statusCode!==200)reject(Error(o.code||"OWNER_RPC_FAILED"));
       else resolve(o);}catch(e){reject(e);}});
  });
  req.on("error",reject);req.end(body);
 });
}
async function main(){
 if(action==="init"){
  const b=new L1Broker(dir,{initialize:true});
  console.log("L1 storage initialized (no owner paired / no grants):",b.status());
  return;
 }
 if(action==="pair"){
  const b=new L1Broker(dir);
  if(b.status().paired)throw Error("OWNER_ALREADY_PAIRED");
  const a=await hidden("Create a ChatAgent setup passphrase (8-256 characters; not sent to chat): ");
  const second=await hidden("Repeat owner passphrase: ");
  if(a!==second)throw Error("PASSPHRASE_MISMATCH");
  b.pair(a);
  console.log("ChatAgent owner registered locally. Routine operations will not ask for this passphrase again.");
  console.log("Optional: persistent FULL_HOST gives the private single-owner ChatAgent app ordinary macOS-user file and process authority (not sudo/TCC bypass). Effects become available only after the separately tested broker/tool canary is enabled.");
  const confirmation=await askVisible("Type 'ENABLE FULL_HOST' to predelegate, or Enter to keep ASK: ");
  if(confirmation==="ENABLE FULL_HOST")b.setMode("FULL_HOST",a);
  console.log("Selected persistent mode:",b.status().mode,"(effective host tools require separate canary enablement)");
  return;
 }
 const pass=action==="mode"&&arg==="FULL_HOST"?await hidden("Confirm Full Host enrollment passphrase: "):undefined;
 if(action==="status"||action==="pending"||action==="grants"||action==="audit"){
  const result=await ownerRpc(action,{passphrase:pass});
  console.log(JSON.stringify(result,null,2));return;
 }
 if(action==="approve"){
  if(!/^[a-f0-9-]{36}$/i.test(arg||""))throw Error("REQUEST_ID_REQUIRED");
  const data=await ownerRpc("pending",{passphrase:pass});
  const found=data.requests.find(x=>x.requestId===arg);
  if(!found)throw Error("REQUEST_NOT_PENDING");
  console.log(JSON.stringify(found,null,2));
  const phrase="APPROVE "+found.digest.slice(0,12);
  const entered=await askVisible("Type '"+phrase+"' to approve this RECORD ONLY (no file access): ");
  if(entered!==phrase)throw Error("OWNER_CANCELLED");
  console.log(await ownerRpc("approve",{passphrase:pass,requestId:arg,digest:found.digest}));
  return;
 }
 if(action==="revoke"){
  if(!/^[a-f0-9-]{36}$/i.test(arg||""))throw Error("GRANT_ID_REQUIRED");
  const list=await ownerRpc("grants",{passphrase:pass});
  const found=list.grants.find(x=>x.grantId===arg);
  if(!found)throw Error("GRANT_NOT_FOUND");
  console.log(JSON.stringify(found,null,2));
  const entered=await askVisible("Type 'REVOKE "+arg.slice(0,8)+"' to revoke record: ");
  if(entered!=="REVOKE "+arg.slice(0,8))throw Error("OWNER_CANCELLED");
  console.log(await ownerRpc("revoke",{passphrase:pass,grantId:arg}));
  return;
 }
 if(action==="mode"){
  if(!["ASK","TRUSTED_PROJECT","FULL_HOST"].includes(arg))throw Error("INVALID_MODE");
  const note=arg==="FULL_HOST"?" (RECORDED ONLY: NO HOST AUTHORITY ENABLED)":"";
  const entered=await askVisible("Type 'SET "+arg+"'"+note+": ");
  if(entered!=="SET "+arg)throw Error("OWNER_CANCELLED");
  console.log(await ownerRpc("mode",{passphrase:pass,mode:arg}));
 }
}
try { await main(); } catch(e){console.error("OWNER_CONTROL_ERROR:",e.message);process.exitCode=1;}
