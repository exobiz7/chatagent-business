import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, symlinkSync, rmSync, chmodSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash, randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import http from "node:http";
import { L1Broker } from "./broker-core.mjs";
import { HostFileOps } from "./host-file-ops.mjs";

const root=mkdtempSync(join(tmpdir(),"chatagent-poweruser-"));
const state=join(root,"control"), workspace=join(root,"host");
mkdirSync(workspace,{mode:0o700});
const broker=new L1Broker(state,{initialize:true});
const files=new HostFileOps(broker,{privateRoot:state});
const pass="12345678";
const sha=value=>createHash("sha256").update(value).digest("hex");
const check=label=>console.log("PASS "+label);
let server=null;
const wait=ms=>new Promise(r=>setTimeout(r,ms));
try{
 assert.equal(broker.accessDecision("read",workspace).allowed,false);
 await assert.rejects(()=>files.list({path:workspace}),/OWNER_NOT_PAIRED/);
 broker.pair(pass);
 assert.equal(broker.status().mode,"ASK");
 await assert.rejects(()=>files.list({path:workspace}),/ACCESS_REQUIRED/);
 check("unpaired / ASK fail closed");
 broker.setMode("FULL_HOST",pass);
 assert.equal(broker.accessDecision("read",workspace).allowed,true);
 assert.equal(broker.accessDecision("host_exec","/usr/bin/python3").allowed,true);
 check("persistent Full Host allows ordinary user scope without per-call password");
 const source=join(workspace,"source.txt"),copy=join(workspace,"copy.txt");
 const w=await files.write({path:source,content:"original",mode:"create",expectedSha256:null});
 assert.equal(w.sha256,sha("original"));
 assert.equal((await files.read({path:source,offset:0,maxBytes:50})).content,"original");
 assert.equal((await files.stat({path:source})).kind,"file");
 assert.equal((await files.list({path:workspace})).entries[0].name,"source.txt");
 assert.equal((await files.hash({path:source})).sha256,sha("original"));
 check("host create / read / stat / list / hash");
 await assert.rejects(()=>files.write({path:source,content:"over",mode:"create",expectedSha256:null}),/EEXIST/);
 await assert.rejects(()=>files.write({path:source,content:"over",mode:"replace",expectedSha256:sha("not-original")}),/PRECONDITION_MISMATCH/);
 const updated=await files.write({path:source,content:"new value",mode:"replace",expectedSha256:sha("original")});
 assert.equal(updated.sha256,sha("new value"));
 await assert.rejects(()=>files.copy({source,destination:copy,expectedSourceSha256:sha("wrong")}),/PRECONDITION_MISMATCH/);
 const copyResult=await files.copy({source,destination:copy,expectedSourceSha256:updated.sha256});
 assert.equal(copyResult.sha256,updated.sha256);
 assert.equal(readFileSync(copy,"utf8"),"new value");
 check("write/copy exact content preconditions and no implicit overwrite");
 await assert.rejects(()=>files.read({path:join(state,"seal.key")}),/OWNER_CONTROL_PATH_DENIED/);
 symlinkSync(state,join(workspace,"private-link"));
 await assert.rejects(()=>files.list({path:join(workspace,"private-link")}),/OWNER_CONTROL_PATH_DENIED/);
 const support=join(root,"private-support");
 mkdirSync(support,{mode:0o700});
 writeFileSync(join(support,"runtime.key"),"dummy-fixture",{mode:0o600});
 const hardened=new HostFileOps(broker,{privateRoot:state,protectedRoots:[support]});
 await assert.rejects(()=>hardened.read({path:join(support,"runtime.key")}),/OWNER_CONTROL_PATH_DENIED/);
 check("private authority path, support credentials and symlink blocked for file tools");
 broker.setMode("ASK",pass);
 await assert.rejects(()=>files.read({path:source}),/ACCESS_REQUIRED/);
 check("local owner revoke to ASK blocks subsequent file calls");
 broker.setMode("FULL_HOST",pass);
 const agentKey=randomBytes(32).toString("base64url"), keyFile=join(root,"agent.key");
 writeFileSync(keyFile,agentKey,{mode:0o600});
 const port=31518;
 server=spawn(process.execPath,[new URL("./broker-server.mjs",import.meta.url).pathname],{
  env:{...process.env,L1_STATE_DIR:state,L1_AGENT_KEY_FILE:keyFile,L1_AGENT_PORT:String(port),L1_FILE_OPS_ENABLED:"1"},
  stdio:["ignore","pipe","pipe"]
 });
 let ready=false,errors="";
 server.stdout.on("data",x=>{if(String(x).includes("L1_BROKER_READY"))ready=true;});
 server.stderr.on("data",x=>errors+=String(x).slice(0,500));
 for(let i=0;i<50&&!ready;i++){if(server.exitCode!==null)throw Error("EARLY_EXIT "+errors);await wait(100);}
 if(!ready)throw Error("SERVER_TIMEOUT "+errors);
 async function rpc(path,body={},credential=agentKey){
  const response=await fetch("http://127.0.0.1:"+port+path,{method:"POST",
   headers:{"content-type":"application/json","x-chatagent-l1-credential":credential},body:JSON.stringify(body)});
  return {code:response.status,body:await response.json()};
 }
 async function owner(route,body={}){
  const raw=JSON.stringify(body);
  return await new Promise((resolve,reject)=>{
   const req=http.request({socketPath:join(state,"owner.sock"),path:"/owner/"+route,method:"POST",
    headers:{"content-type":"application/json","content-length":Buffer.byteLength(raw)}},res=>{
     let text="";res.on("data",v=>text+=v);res.on("end",()=>resolve({code:res.statusCode,body:JSON.parse(text)}));
    });req.on("error",reject);req.end(raw);
  });
 }
 assert.equal((await owner("status")).code,200);
 assert.equal((await owner("mode",{mode:"ASK"})).code,200);
 assert.equal((await rpc("/agent/file/read",{path:source,offset:0,maxBytes:100})).code,400);
 assert.equal((await owner("mode",{mode:"FULL_HOST"})).code,403);
 assert.equal((await owner("mode",{mode:"FULL_HOST",passphrase:pass})).code,200);
 check("trusted local owner status/revoke no repeated password; explicit FULL_HOST enable requires passphrase");
 const status=await rpc("/agent/status");
 assert.equal(status.body.realFilesystemAccess,true);
 assert.equal(status.body.realHostExec,false);
 assert.equal((await rpc("/agent/file/read",{path:source,offset:0,maxBytes:100})).body.content,"new value");
 assert.equal((await rpc("/agent/file/list",{path:workspace})).body.total,3);
 assert.equal((await rpc("/agent/file/read",{path:source}, "wrong")).code,401);
 const blocked=await rpc("/agent/file/read",{path:join(state,"seal.key")});
 assert.notEqual(blocked.code,200);
 check("feature-gated loopback file API, token + private path controls");
 console.log("POWERUSER_L1_FILE_TEST=PASS");
}catch(error){console.error("POWERUSER_L1_FILE_TEST=FAIL "+error.stack);process.exitCode=1;}
finally{
 if(server){server.kill("SIGTERM");await wait(250);}
 rmSync(root,{recursive:true,force:true});
}
