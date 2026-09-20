import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, chmodSync, statSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import http from "node:http";
import { spawn } from "node:child_process";
import assert from "node:assert/strict";
import { L1Broker } from "./broker-core.mjs";

const home=mkdtempSync(join(tmpdir(),"chatagent-l1-test-"));
const dir=join(home,"state");const keyfile=join(home,"agent.key");
const pass="fixture-Owner-Only-Secret-2026";
let child=null;
const log=(k)=>console.log("PASS "+k);
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function rpc(url,path,value,cred=null,socketPath=null){
 const body=JSON.stringify(value??{});
 return await new Promise((resolve,reject)=>{
  const config={method:"POST",path,headers:{"content-type":"application/json","content-length":Buffer.byteLength(body)},timeout:4000};
  if(socketPath)config.socketPath=socketPath;
  else {const u=new URL(url);config.hostname=u.hostname;config.port=Number(u.port);}
  if(cred)config.headers["x-chatagent-l1-credential"]=cred;
  const req=http.request(config,res=>{
   let raw="";res.on("data",x=>raw+=x);
   res.on("end",()=>{try{resolve({code:res.statusCode,data:JSON.parse(raw)});}catch(e){reject(e);}});
  });
  req.on("error",reject);req.end(body);
 });
}
try{
 const broker=new L1Broker(dir,{initialize:true});
 assert.equal(broker.status().paired,false);
 assert.throws(()=>broker.propose({path:"/tmp/example",mode:"read",purpose:"example"}),/OWNER_NOT_PAIRED/);
 assert.throws(()=>broker.pair("1234567"),/OWNER_SECRET_POLICY/);
 const eight=new L1Broker(join(home,"eight-character"),{initialize:true});eight.pair("12345678");
 assert.equal(eight.status().paired,true);log("8 character prototype secret accepted, 7 rejected");
 broker.pair(pass);assert.equal(broker.status().paired,true);log("owner pair + no unpaired proposal");
 assert.equal(broker.verifyOwner("wrong"),false);
 assert.equal(broker.verifyOwner(pass),true);
 assert.throws(()=>broker.pair(pass),/OWNER_ALREADY_PAIRED/);log("owner verifier and single enrollment");
 const input={path:"/tmp/l1-fixture",mode:"read",purpose:"test proposal",lifetime:"session"};
 const first=broker.propose(input), second=broker.propose(input);
 assert.equal(first.requestId,second.requestId);assert.equal(second.duplicate,true);
 assert.equal(broker.check(first.requestId).status,"PENDING_OWNER_APPROVAL");log("idempotent pending proposal");
 const req=broker.pending()[0];
 assert.throws(()=>broker.approve(req.requestId,"incorrect",req.digest),/OWNER_AUTH_DENIED/);
 assert.throws(()=>broker.approve(req.requestId,pass,"0".repeat(64)),/REQUEST_DIGEST_MISMATCH/);
 const grant=broker.approve(req.requestId,pass,req.digest);
 assert.equal(grant.realGrant,false);assert.equal(broker.status().approvedRecords,1);
 assert.equal(broker.check(first.requestId).status,"APPROVED_RECORD_ONLY");
 assert.throws(()=>broker.approve(req.requestId,pass,req.digest),/REQUEST_NOT_PENDING/);
 log("authenticated digest-bound approval is record only");
 const restarted=new L1Broker(dir);
 assert.equal(restarted.status().approvedRecords,1);
 assert.equal(restarted.verifyOwner(pass),true);
 const mode=restarted.setMode("FULL_HOST",pass);
 assert.equal(mode.configured,true);assert.equal(mode.enforced,false);
 assert.equal(restarted.status().realHostExec,false);
 assert.equal(restarted.accessDecision("read","/tmp/fixture").allowed,true);
 assert.equal(restarted.accessDecision("host_exec","/usr/bin/python3").allowed,true);
 assert.equal(restarted.accessDecision("read","relative").allowed,false);
 restarted.setMode("ASK",pass);assert.equal(restarted.accessDecision("read","/tmp/fixture").allowed,false);
 restarted.setMode("FULL_HOST",pass);log("sealed restart, explicit FULL_HOST decision and revoke to ASK");
 assert.equal(restarted.revoke(grant.grantId,pass).revoked,true);
 assert.equal(restarted.revoke(grant.grantId,pass).revoked,true);
 assert.equal(restarted.status().approvedRecords,0);log("durable idempotent revoke");
 assert.throws(()=>new L1Broker(dir,{initialize:true}),/STATE_ALREADY_EXISTS/);
 const token=randomBytes(32).toString("base64url");
 writeFileSync(keyfile,token,{mode:0o600});chmodSync(keyfile,0o600);
 const port=31517;
 child=spawn(process.execPath,[new URL("./broker-server.mjs",import.meta.url).pathname],{
  env:{...process.env,L1_STATE_DIR:dir,L1_AGENT_KEY_FILE:keyfile,L1_AGENT_PORT:String(port)},
  stdio:["ignore","pipe","pipe"]
 });
 let booted=false, childErr="";
 child.stdout.on("data",chunk=>{if(String(chunk).includes("L1_BROKER_READY"))booted=true;});
 child.stderr.on("data",chunk=>childErr+=String(chunk).slice(0,1000));
 for(let i=0;i<40&&!booted;i++){if(child.exitCode!==null)throw Error("BROKER_EARLY_EXIT");await pause(100);}
 if(!booted)throw Error("BROKER_START_TIMEOUT "+childErr.slice(0,120));
 const agent="http://127.0.0.1:"+port, owner=join(dir,"owner.sock");
 assert.equal(statSync(owner).mode&0o077,0);
 let v=await rpc(agent,"/agent/status",{});
 assert.equal(v.code,401);
 v=await rpc(agent,"/agent/status",{},token);
 assert.equal(v.code,200);assert.equal(v.data.realFilesystemAccess,false);
 log("isolated agent credential and owner socket 0600");
 v=await rpc(agent,"/agent/request",input,token);
 assert.equal(v.code,200);
 const requestId=v.data.requestId;
 v=await rpc(agent,"/agent/check",{requestId},token);
 assert.equal(v.data.realGrant,false);
 v=await rpc(agent,"/owner/approve",{passphrase:pass,requestId},token);
 assert.equal(v.code,404);
 const pend=await rpc(null,"/owner/pending",{passphrase:pass},null,owner);
 assert.equal(pend.code,200);
 const selected=pend.data.requests.find(x=>x.requestId===requestId);
 assert.ok(selected);
 const denied=await rpc(null,"/owner/approve",{passphrase:"wrong",requestId,digest:selected.digest},null,owner);
 assert.equal(denied.code,403);
 const approved=await rpc(null,"/owner/approve",{passphrase:pass,requestId,digest:selected.digest},null,owner);
 assert.equal(approved.code,200);assert.equal(approved.data.realGrant,false);
 const checked=await rpc(agent,"/agent/check",{requestId},token);
 assert.equal(checked.data.status,"APPROVED_RECORD_ONLY");
 const revoked=await rpc(null,"/owner/revoke",{grantId:approved.data.grantId},null,owner);
 assert.equal(revoked.code,200);
 const after=await rpc(agent,"/agent/check",{requestId},token);
 assert.equal(after.data.recordValid,false);
 log("HTTP proposal -> owner approve -> check -> revoke; no host access");
 child.kill("SIGTERM");
 await new Promise(resolve=>child.once("exit",resolve));
 child=null;
 const state=join(dir,"state.json"),record=readFileSync(state,"utf8");
 const modified=JSON.parse(record);modified.payload.mode="FULL_HOST";modified.payload.epoch=999;
 writeFileSync(state,JSON.stringify(modified),{mode:0o600});
 assert.throws(()=>new L1Broker(dir),/RECOVERY_REQUIRED/);
 log("tamper is fail-closed");
 console.log("L1_TEST_RESULT=PASS");
}catch(e){console.error("L1_TEST_RESULT=FAIL "+e.stack);process.exitCode=1;}
finally{
 if(child)child.kill("SIGTERM");
 rmSync(home,{recursive:true,force:true});
}
