import assert from 'node:assert/strict';
import {chmodSync,mkdtempSync,mkdirSync,readFileSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';

import {DurableHostProcesses} from '../../l1/durable-host-processes.mjs';
import {BusinessDurableProcessBroker} from './runtime/business-durable-process-broker.mjs';
import {BusinessProcessRegistry} from './runtime/business-process-registry.mjs';
import {BusinessHostProcessService} from './runtime/business-host-process-service.mjs';

const root=mkdtempSync(join(tmpdir(),'business-bs3b2-'));chmodSync(root,0o700);
const state=join(root,'state'),projectRoot=join(root,'backend'),subdir=join(projectRoot,'subdir');
mkdirSync(state,{mode:0o700});mkdirSync(projectRoot,{mode:0o700});mkdirSync(subdir,{mode:0o700});
const memberA='oauth-profile:member-a',memberB='oauth-profile:member-b';
const nodeId='40000000-0000-4000-8000-000000000001';
let mappingRevision=1,controlReachable=true,nodeType='PERSONAL_NODE',sharedHostPowerEnabled=false;
let lifecycle='APPROVED',leaseExpiresAt=new Date(Date.now()+60_000).toISOString();
const pause=ms=>delay(ms);
async function until(fn,attempts=120,step=50){
  for(let i=0;i<attempts;i++){const value=await fn();if(value)return value;await pause(step);}
  throw Error('BS3B2_WAIT_TIMEOUT');
}
const routeEntry=authenticatedMemberKey=>({
  node:{nodeId,nodeType,lifecycle,ownedByCaller:authenticatedMemberKey===memberA,sharedHostPowerEnabled},
  mapping:{projectId:'backend',runtimeNodeId:nodeId,workspaceRootId:'main',workspaceRelativePath:'backend',
    mappingRevision,canonicalPath:projectRoot},
  session:{sessionState:'ACTIVE',leaseExpiresAt}
});
const authorizeProject=async({projectId})=>({projectId,authorized:projectId==='backend'});
const loadRoutes=async({authenticatedMemberKey,projectId})=>({
  routes:projectId==='backend'?[routeEntry(authenticatedMemberKey)]:[],controlReachable,nowMs:Date.now()
});
const makeService=(broker,registry,processes)=>new BusinessHostProcessService({
  processBroker:broker,registry,processes,authorizeProject,loadRoutes
});
const owned=[];
try{
  const broker=new BusinessDurableProcessBroker(state,{initialize:true});
  const registry=new BusinessProcessRegistry({stateDir:state,initialize:true});
  const processes=new DurableHostProcesses(broker);
  const service=makeService(broker,registry,processes);

  await assert.rejects(()=>processes.start({executable:process.execPath,argv:['-e','process.exit(0)'],cwd:projectRoot,
    timeoutMs:5000,idempotencyKey:randomUUID()}),/BUSINESS_HOST_PROCESS_AUTH_REQUIRED/);
  console.log('PASS frozen donor core cannot start through Business broker without ephemeral Business admission');

  const largeKey=randomUUID();
  const largeInput={authenticatedMemberKey:memberA,projectId:'backend',executable:process.execPath,
    argv:['-e',"process.stdout.write('A'.repeat(40000))"],cwd:'.',timeoutMs:8000,idempotencyKey:largeKey};
  const large=await service.startHost(largeInput);owned.push(large.processId);
  await until(async()=>['EXITED','FAILED','TERMINATED'].includes((await service.getStatus({authenticatedMemberKey:memberA,processId:large.processId})).state));
  const first=await service.readOutput({authenticatedMemberKey:memberA,processId:large.processId,cursor:0,maxBytes:32768});
  assert.equal(first.cursor,32768);assert.equal(Buffer.byteLength(first.content),32768);assert.equal(first.hasMore,true);
  const second=await service.readOutput({authenticatedMemberKey:memberA,processId:large.processId,cursor:first.cursor,maxBytes:524288});
  assert.equal(second.hasMore,false);assert.ok(second.cursor>first.cursor);
  const replay=await service.startHost(largeInput);assert.equal(replay.processId,large.processId);
  await assert.rejects(()=>service.startHost({...largeInput,argv:['-e',"process.stdout.write('DIFFERENT')"]}),/BUSINESS_IDEMPOTENCY_CONFLICT/);
  console.log('PASS public maxBytes composes donor <=16KiB reads up to 512KiB and start idempotency never replays effects');

  const recordsAfterLarge=registry.snapshot();
  assert.equal(recordsAfterLarge.length,1);assert.equal(recordsAfterLarge[0].state,'BOUND');
  const rawRegistry=readFileSync(join(state,'business-process-bindings.json'),'utf8');
  for(const forbidden of ['"executable"','"argv"','"cwd"','"content"'])assert.equal(rawRegistry.includes(forbidden),false);
  await assert.rejects(()=>service.getStatus({authenticatedMemberKey:memberB,processId:large.processId}),/BUSINESS_PROCESS_NOT_OWNED/);
  await assert.rejects(()=>service.getStatus({authenticatedMemberKey:memberA,processId:randomUUID()}),/BUSINESS_PROCESS_NOT_OWNED/);
  console.log('PASS processId-only lookup uses owner-private member/project/node binding and registry stores no argv/cwd/output');

  await assert.rejects(()=>service.startHost({...largeInput,idempotencyKey:randomUUID(),cwd:projectRoot}),/BUSINESS_PROCESS_CWD_MUST_BE_PROJECT_RELATIVE/);
  await assert.rejects(()=>service.startHost({...largeInput,idempotencyKey:randomUUID(),cwd:'../escape'}),/BUSINESS_PROCESS_CWD_INVALID/);
  const beforeUnauthorized=registry.snapshot().length;
  await assert.rejects(()=>service.startHost({...largeInput,projectId:'unauthorized',idempotencyKey:randomUUID()}),/BUSINESS_PROJECT_AUTHORIZATION_DENIED/);
  assert.equal(registry.snapshot().length,beforeUnauthorized);
  console.log('PASS mapped cwd is project-relative/internal-only and project authorization precedes durable effect reservation');

  const waitKey=randomUUID();
  const waited=await service.startHost({authenticatedMemberKey:memberA,projectId:'backend',executable:process.execPath,
    argv:['-e',"setTimeout(()=>{process.stdout.write('WAIT_OK');process.exit(0)},250)"],cwd:'subdir',timeoutMs:5000,idempotencyKey:waitKey});
  owned.push(waited.processId);
  const waitedOut=await service.readOutput({authenticatedMemberKey:memberA,processId:waited.processId,cursor:0,maxBytes:1024,waitMs:1500});
  assert.match(waitedOut.content,/WAIT_OK/);
  console.log('PASS waitMs provides bounded polling without widening the frozen donor read primitive');

  const longKey=randomUUID();
  const long=await service.startHost({authenticatedMemberKey:memberA,projectId:'backend',executable:process.execPath,
    argv:['-e','setInterval(()=>{},250)'],cwd:'.',timeoutMs:10000,idempotencyKey:longKey});owned.push(long.processId);
  await until(async()=>(await service.getStatus({authenticatedMemberKey:memberA,processId:long.processId})).state==='RUNNING');

  const broker2=new BusinessDurableProcessBroker(state);
  const registry2=new BusinessProcessRegistry({stateDir:state});
  const processes2=new DurableHostProcesses(broker2);
  const service2=makeService(broker2,registry2,processes2);
  assert.equal((await service2.getStatus({authenticatedMemberKey:memberA,processId:long.processId})).processId,long.processId);
  mappingRevision=2;
  await assert.rejects(()=>service2.getStatus({authenticatedMemberKey:memberA,processId:long.processId}),/BUSINESS_PROCESS_ROUTE_STALE/);
  mappingRevision=1;
  lifecycle='REVOKED';
  await assert.rejects(()=>service2.getStatus({authenticatedMemberKey:memberA,processId:long.processId}),/BUSINESS_RUNTIME_NODE_REVOKED/);
  lifecycle='APPROVED';
  controlReachable=false;leaseExpiresAt=new Date(Date.now()-1000).toISOString();
  await assert.rejects(()=>service2.getStatus({authenticatedMemberKey:memberA,processId:long.processId}),/BUSINESS_AUTH_LEASE_EXPIRED/);
  leaseExpiresAt=new Date(Date.now()+60_000).toISOString();
  assert.equal((await service2.getStatus({authenticatedMemberKey:memberA,processId:long.processId})).processId,long.processId);
  controlReachable=true;
  console.log('PASS restart reopens server-owned binding; mapping revision, revoke, and cached-lease expiry fail closed');

  const crashKey=randomUUID();let crashProcessId=null;
  const crashProcesses={
    async start(args){const result=await processes2.start(args);crashProcessId=result.processId;throw Error('SIMULATED_SERVICE_CRASH_AFTER_DURABLE_START');},
    status:args=>processes2.status(args),read:args=>processes2.read(args),stop:args=>processes2.stop(args)
  };
  const crashService=makeService(broker2,registry2,crashProcesses);
  const crashInput={authenticatedMemberKey:memberA,projectId:'backend',executable:process.execPath,
    argv:['-e',"setTimeout(()=>{process.stdout.write('CRASH_WINDOW_OK');process.exit(0)},500)"],cwd:'.',timeoutMs:5000,idempotencyKey:crashKey};
  await assert.rejects(()=>crashService.startHost(crashInput),/SIMULATED_SERVICE_CRASH_AFTER_DURABLE_START/);
  const reserved=registry2.snapshot().find(x=>x.idempotencyKey===crashKey);
  assert.equal(reserved.state,'RESERVED');assert.equal(reserved.processId,null);assert.ok(crashProcessId);owned.push(crashProcessId);

  const broker3=new BusinessDurableProcessBroker(state);
  const registry3=new BusinessProcessRegistry({stateDir:state});
  const processes3=new DurableHostProcesses(broker3);
  const service3=makeService(broker3,registry3,processes3);
  const recovered=await service3.startHost(crashInput);
  assert.equal(recovered.processId,crashProcessId);
  assert.equal(registry3.snapshot().find(x=>x.idempotencyKey===crashKey).state,'BOUND');
  assert.equal(broker3.state.actions.filter(x=>x.key===crashKey).length,1);
  console.log('PASS RESERVED -> durable start -> crash-before-binding reconciles same process with no blind replay');

  nodeType='SHARED_NODE';sharedHostPowerEnabled=false;
  await assert.rejects(()=>service3.startHost({authenticatedMemberKey:memberA,projectId:'backend',runtimeNodeId:nodeId,executable:process.execPath,
    argv:['-e','process.exit(0)'],cwd:'.',timeoutMs:5000,idempotencyKey:randomUUID()}),/BUSINESS_SHARED_HOST_POWER_DENIED/);
  sharedHostPowerEnabled=true;
  const shared=await service3.startHost({authenticatedMemberKey:memberA,projectId:'backend',executable:process.execPath,
    argv:['-e',"process.stdout.write('SHARED_OK')"],cwd:'.',timeoutMs:5000,idempotencyKey:randomUUID()});owned.push(shared.processId);
  await until(async()=>['EXITED','FAILED'].includes((await service3.getStatus({authenticatedMemberKey:memberA,processId:shared.processId})).state));
  nodeType='PERSONAL_NODE';sharedHostPowerEnabled=false;
  console.log('PASS SHARED_NODE generic host power is denied by default and requires explicit opt-in');

  const term=await service3.terminateJob({authenticatedMemberKey:memberA,processId:long.processId});
  assert.ok(['TERMINATION_PENDING','TERMINATED'].includes(term.state));
  await until(async()=>['TERMINATED','RECOVERY_REQUIRED'].includes((await service3.getStatus({authenticatedMemberKey:memberA,processId:long.processId})).state));
  console.log('PASS terminate targets exactly the registry-owned durable supervisor; arbitrary processId is never forwarded');

  const sealedPath=join(state,'business-process-bindings.json');
  const tampered=JSON.parse(readFileSync(sealedPath,'utf8'));tampered.payload.revision++;
  writeFileSync(sealedPath,JSON.stringify(tampered)+'\n');
  assert.throws(()=>new BusinessProcessRegistry({stateDir:state}),/BUSINESS_PROCESS_STATE_INTEGRITY_FAILED/);
  console.log('PASS owner-private process binding registry is HMAC-sealed and tamper fails closed');

  console.log('BUSINESS_S3B2_HOST_PROCESS_ADAPTER=PASS');
} catch(error){
  console.error('BUSINESS_S3B2_HOST_PROCESS_ADAPTER=FAIL '+error.stack);process.exitCode=1;
} finally {
  try{const broker=new BusinessDurableProcessBroker(state);const p=new DurableHostProcesses(broker);p.stopAll();}catch{}
  await pause(500);rmSync(root,{recursive:true,force:true});
  console.log('test_only_fixture_cleanup=COMPLETE');
}
