import assert from "node:assert/strict";
import http from "node:http";
import {mkdtempSync,writeFileSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {randomBytes,randomUUID} from "node:crypto";
import {L1Broker} from "./broker-core.mjs";
import {PersonalMemoryReadAdapter} from "./personal-memory-read.mjs";

const root=mkdtempSync(join(tmpdir(),"chatagent-personal-memory-"));
const key=join(root,"memory.key"),token=randomBytes(32).toString("base64url");
writeFileSync(key,token,{mode:0o600});
const known=randomUUID(),foreign=randomUUID(),visits=[];
const api=http.createServer(async(req,res)=>{
 let body="";for await(const b of req)body+=String(b);
 const data=JSON.parse(body||"{}");
 visits.push({method:req.method,path:req.url,data,authenticated:req.headers.authorization==="Bearer "+token});
 const send=(status,obj)=>{res.writeHead(status,{"content-type":"application/json"});res.end(JSON.stringify(obj));};
 if(req.headers.authorization!=="Bearer "+token)return send(401,{error:{code:"UNAUTHORIZED"}});
 if(req.url==="/v1/projects/context")return send(200,{project:{projectId:data.projectId},contextSeq:2});
 if(req.url==="/v1/search")return send(200,{matches:[{projectId:data.projectId,type:"fact"}],contextSeq:2});
 if(req.url==="/v1/tasks/get")return send(200,{task:{taskId:data.taskId,
  projectId:data.taskId===known?"personal-lab":"other-tenant"},status:"active"});
 return send(404,{error:{code:"NOT_FOUND"}});
});
await new Promise(resolve=>api.listen(0,"127.0.0.1",resolve));
const port=api.address().port,broker=new L1Broker(join(root,"owner"),{initialize:true});
const password="12345678";broker.pair(password);broker.setMode("FULL_HOST",password);
try{
 const memory=new PersonalMemoryReadAdapter(broker,{url:"http://127.0.0.1:"+port,
  tokenFile:key,allowedProjects:"personal-lab"});
 assert.equal((await memory.call("get_project_context",{projectId:"personal-lab"})).project.projectId,"personal-lab");
 const results=await memory.call("search_memory",{projectId:"personal-lab",query:"checkpoint",limit:3});
 assert.equal(results.matches[0].projectId,"personal-lab");
 assert.equal((await memory.call("get_task",{taskId:known})).task.taskId,known);
 await assert.rejects(()=>memory.call("get_task",{taskId:foreign}),/MEMORY_PROJECT_DENIED/);
 await assert.rejects(()=>memory.call("search_memory",{projectId:"other-tenant",query:"secret"}),/MEMORY_PROJECT_DENIED/);
 await assert.rejects(()=>memory.call("checkpoint_task",{taskId:known,summary:"ATTACK"}),/MEMORY_OPERATION_DENIED/);
 await assert.rejects(()=>memory.call("get_project_context",{projectId:"personal-lab",extra:"ATTACK"}),/INVALID_MEMORY_INPUT/);
 assert.ok(visits.every(x=>x.method==="POST"&&x.authenticated&&
  ["/v1/projects/context","/v1/search","/v1/tasks/get"].includes(x.path)));
 assert.equal(visits.filter(x=>x.path.includes("checkpoint")).length,0);
 console.log("PASS P8-compatible three read-only domain routes, bearer and project allowlist");
 broker.setMode("ASK",password);
 await assert.rejects(()=>memory.call("get_project_context",{projectId:"personal-lab"}),/ACCESS_REQUIRED/);
 console.log("PASS strict input, cross-project task result refusal, owner downgrade");
 console.log("PERSONAL_MEMORY_READ_TEST=PASS");
}catch(e){console.error("PERSONAL_MEMORY_READ_TEST=FAIL "+e.stack);process.exitCode=1;}
finally{await new Promise(resolve=>api.close(resolve));rmSync(root,{recursive:true,force:true});}
