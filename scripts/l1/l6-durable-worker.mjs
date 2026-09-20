import {L1Broker} from "./broker-core.mjs";
import {DurableHostProcesses} from "./durable-host-processes.mjs";

const [state,cwd,key]=process.argv.slice(2);
const broker=new L1Broker(state);
const processes=new DurableHostProcesses(broker);
const result=await processes.start({
 executable:process.execPath,
 argv:["-e","let n=0;const t=setInterval(()=>{process.stdout.write('L6_DURABLE_'+(++n)+'\\n');if(n===8){clearInterval(t);process.exit(0);}},320)"],
 cwd,timeoutMs:12000,idempotencyKey:key
});
console.log(JSON.stringify({processId:result.processId,state:result.state}));
setInterval(()=>{},500);
