import {PersonalMemoryStore} from "./personal-memory-store.mjs";
import {randomUUID} from "node:crypto";
const [root,projectId,marker]=process.argv.slice(2);
if(!root||!projectId||!marker)throw Error("TEST_ARGUMENT_REQUIRED");
const memory=new PersonalMemoryStore(root,{ownerStatus:()=>({paired:true,mode:"ASK"})});
const task=memory.taskStart({projectId,title:"Physical crash fixture",operationId:marker});
const checkpoint=memory.checkpointAppend({
 projectId,taskId:task.taskId,expectedTaskRevision:0,operationId:randomUUID(),
 summary:"Committed before SIGKILL",currentState:"Own personal memory",
 nextActions:["Recover"],verification:"SQLite committed"
});
process.stdout.write("MEMORY_CRASH_READY "+JSON.stringify({taskId:task.taskId,
 checkpointId:checkpoint.checkpointId})+"\n");
setInterval(()=>{},10000);
