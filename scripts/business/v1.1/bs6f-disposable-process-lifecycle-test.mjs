// B-S6F nonproduction process life-cycle / stale record rehearsal.
// Exercises the existing B-S6B read-only probe, not the real v1.1 runtime manager or macOS reboot.
import assert from 'node:assert/strict';
import {spawn,spawnSync} from 'node:child_process';
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {randomUUID} from 'node:crypto';
import {once} from 'node:events';

const dir=mkdtempSync(join(tmpdir(),'bs6f-nonprod-lifecycle-'));
const processDir=join(dir,'runtime');
const fixtureScript=join(dir,'fixture-server.mjs');
const recordPath=join(processDir,'business-runtime.json');
let child=null;
try {
 mkdirSync(processDir,{recursive:true});
 mkdirSync(join(dir,'state','continuity'),{recursive:true});
 mkdirSync(join(dir,'backups'),{recursive:true});
 writeFileSync(fixtureScript,[
  "import {createServer} from 'node:http';",
  "const instanceId=process.argv.find(x=>x.startsWith('--business-instance='))?.slice(20);",
  "const server=createServer((req,res)=>{",
  " if(req.url==='/health'){res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({ready:true,phase:'B5',instanceId}));}",
  " else {res.writeHead(404);res.end();}",
  "});",
  "server.listen(0,'127.0.0.1',()=>{console.log(JSON.stringify({port:server.address().port}));});",
  "process.on('SIGTERM',()=>server.close(()=>process.exit(0)));"
 ].join('\n')+'\n');
 const instanceId=randomUUID();
 child=spawn(process.execPath,[fixtureScript,'--business-instance='+instanceId],{stdio:['ignore','pipe','pipe'],env:{PATH:process.env.PATH}});
 let output='';
 const port=await new Promise((ok,fail)=>{
  const timeout=setTimeout(()=>fail(Error('DISPOSABLE_CHILD_START_TIMEOUT')),5000);
  child.once('error',e=>{clearTimeout(timeout);fail(e);});
  child.stdout.on('data',buf=>{
   output+=buf.toString('utf8');
   if(output.includes('\n')){
    clearTimeout(timeout);
    try{ok(JSON.parse(output.split('\n')[0]).port);}catch(e){fail(e);}
   }
  });
 });
 assert(Number.isInteger(port)&&port>0);
 const record={pid:child.pid,port,instanceId,nodeBinary:process.execPath,serverPath:fixtureScript,startedAt:Date.now()};
 writeFileSync(recordPath,JSON.stringify(record));
 writeFileSync(join(dir,'operator.json'),JSON.stringify({runtimeDir:processDir,port}));
 const original=readFileSync(recordPath);
 const probe=()=>spawnSync(process.execPath,['scripts/business/v1.1/bs6b-runtime-reconciliation-probe.mjs','--root='+dir],
  {encoding:'utf8',timeout:7000,maxBuffer:150000});
 const a=probe();
 assert.equal(a.status,3,a.stderr);
 const live=JSON.parse(a.stdout);
 assert.equal(live.readOnly,true);
 assert.equal(live.repairPerformed,false);
 assert.equal(live.runtime.processPresent,true);
 assert.equal(live.runtime.processIdentityMatched,true);
 assert.equal(live.runtime.applicationHealthHttp,200);
 assert.equal(live.verdict,'NO_GO_OPERATOR_REVIEW_REQUIRED');
 assert.deepEqual(readFileSync(recordPath),original);
 child.kill('SIGTERM');await once(child,'exit');
 child=null;
 const b=probe();
 assert.equal(b.status,3,b.stderr);
 const stale=JSON.parse(b.stdout);
 assert.equal(stale.runtime.processPresent,false);
 assert.equal(stale.diagnosis,'STALE_PROCESS_MISSING');
 assert.equal(stale.verdict,'NO_GO_OPERATOR_REVIEW_REQUIRED');
 assert.equal(stale.repairPerformed,false);
 assert.deepEqual(readFileSync(recordPath),original);
 console.log('PASS B-S6F disposable loopback server live -> owned-stop -> stale runtime record fail-closed');
 console.log('PASS no auto restart, no record deletion and no v1.0 production process touched');
 console.log('BUSINESS_S6F_DISPOSABLE_LIFECYCLE=PASS');
}finally{
 if(child&&child.exitCode===null){child.kill('SIGTERM');await Promise.race([once(child,'exit'),new Promise(ok=>setTimeout(ok,2000))]);}
 rmSync(dir,{recursive:true,force:true});
}
