import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import {mkdtempSync,realpathSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {randomUUID} from "node:crypto";
import {setTimeout as delay} from "node:timers/promises";
import {PersonalMemoryStore} from "./personal-memory-store.mjs";

const root=realpathSync(mkdtempSync(join("/tmp","pm-kill-"))),state=join(root,"personal-state");
const ownerStatus=()=>({paired:true,mode:"ASK"});
let child=null,verified=false;
try{
 const original=new PersonalMemoryStore(state,{initialize:true,ownerStatus});
 const projectId="physical-crash-fixture";
 original.projectRegister({projectId,rootLabel:"Single owner",operationId:randomUUID()});
 original.close();
 const operationId=randomUUID();
 const worker=new URL("./personal-memory-crash-worker.mjs",import.meta.url).pathname;
 const receipt=await new Promise((resolve,reject)=>{
  let output="",settled=false;
  child=spawn(process.execPath,[worker,state,projectId,operationId],{
   stdio:["ignore","pipe","pipe"],env:process.env});
  child.stdout.on("data",buffer=>{
   output+=buffer.toString();
   const match=output.match(/MEMORY_CRASH_READY (\{[^\n]+\})/);
   if(match&&!settled){settled=true;resolve(JSON.parse(match[1]));}
  });
  child.once("error",reject);
  child.once("close",(code,signal)=>{
   if(!settled)reject(Error("MEMORY_CHILD_EXITED_BEFORE_COMMIT "+code+" "+signal));
  });
  setTimeout(()=>{if(!settled)reject(Error("MEMORY_CHILD_READY_TIMEOUT"));},6000).unref();
 });
 assert.ok(receipt.taskId);assert.ok(receipt.checkpointId);
 assert.ok(child?.pid);child.kill("SIGKILL"); // only this test-created child
 await new Promise(resolve=>child.once("close",resolve));
 assert.equal(child.signalCode,"SIGKILL");
 const recovered=new PersonalMemoryStore(state,{ownerStatus});
 const task=recovered.taskGet({projectId,taskId:receipt.taskId}).task;
 assert.equal(task.checkpoints[0].checkpointId,receipt.checkpointId);
 assert.equal(task.revision,1);
 const duplicate=recovered.taskStart({projectId,title:"Physical crash fixture",operationId});
 assert.equal(duplicate.duplicate,true);
 assert.equal(duplicate.taskId,receipt.taskId);
 recovered.close();
 verified=true;
 console.log("PASS actual owned Node SIGKILL after SQLite checkpoint commit");
 console.log("PASS independent process reopen and exact operation replay suppression");
 console.log("PERSONAL_MEMORY_PHYSICAL_RESTART=PASS");
}catch(e){
 console.error("PERSONAL_MEMORY_PHYSICAL_RESTART=FAIL "+e.stack);process.exitCode=1;
}finally{
 if(child?.exitCode===null&&child?.signalCode===null)child.kill("SIGKILL");
 await delay(100);
 if(verified)rmSync(root,{recursive:true,force:true});
 console.log("isolated_fixture_cleanup="+(verified?"COMPLETE":"RETAINED_FOR_REVIEW"));
}
