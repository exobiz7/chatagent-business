import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {chmodSync,mkdtempSync,mkdirSync,readFileSync,realpathSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {BusinessExecManager} from '../business-exec.mjs';
import {BusinessLocalEffectAudit} from './runtime/business-local-effect-audit.mjs';
import {BusinessIsolatedProcessRegistry} from './runtime/business-isolated-process-registry.mjs';
import {BusinessIsolatedProcessService} from './runtime/business-isolated-process-service.mjs';
import {BusinessProcessService} from './runtime/business-process-service.mjs';
import {resolveBusinessRuntimeRoute} from './runtime/business-runtime-router.mjs';

const EXEC_IMAGE_REF='node@sha256:0e0ff40c39bc087845bfb27465a0df4ea419520094bc35842ff83dd8cbe6f9b6';
const EXEC_IMAGE_ID='sha256:0e0ff40c39bc087845bfb27465a0df4ea419520094bc35842ff83dd8cbe6f9b6';
const repo=realpathSync(fileURLToPath(new URL('../../../',import.meta.url)));
const root=realpathSync(mkdtempSync(join(tmpdir(),'chatagent-business-s3f1-')));chmodSync(root,0o700);
const projectRoot=join(root,'project'),auditDir=join(root,'audit'),bindingDir=join(root,'bindings');
mkdirSync(projectRoot);mkdirSync(auditDir,{mode:0o700});mkdirSync(bindingDir,{mode:0o700});mkdirSync(join(projectRoot,'.git'));
writeFileSync(join(projectRoot,'fixture.txt'),'ISOLATED_PROJECT\n',{mode:0o600});
const sha=p=>createHash('sha256').update(readFileSync(p)).digest('hex');
const which=spawnSync('/usr/bin/which',['docker'],{encoding:'utf8'});assert.equal(which.status,0,which.stderr);
const docker=realpathSync(which.stdout.trim()),dockerSha=sha(docker);
const inspect=spawnSync(docker,['image','inspect',EXEC_IMAGE_REF,'--format','{{.Id}}|{{.Architecture}}|{{.Os}}'],{encoding:'utf8'});
assert.equal(inspect.status,0,'Pinned isolated image must be locally present: '+inspect.stderr);assert.equal(inspect.stdout.trim(),EXEC_IMAGE_ID+'|arm64|linux');

const member='oauth-subject-bs3f1-member';
const shared='30000000-0000-4000-8000-000000000001';
let revision=11,profile='STANDARD';
const node={nodeId:shared,nodeType:'SHARED_NODE',lifecycle:'APPROVED',ownedByCaller:false,sharedHostPowerEnabled:false};
const route=()=>({node,mapping:{projectId:'standard',runtimeNodeId:shared,workspaceRootId:'fixture-root',workspaceRelativePath:'project',canonicalPath:projectRoot,mappingRevision:revision},session:null});
const authorizeProject=async({projectId})=>({projectId,authorized:true,projectProfile:profile,organizationId:'acme'});
const loadRoutes=async()=>({routes:[route()],controlReachable:true});
const audit=new BusinessLocalEffectAudit({stateDir:auditDir,initialize:true});
const registry=new BusinessIsolatedProcessRegistry({stateDir:bindingDir,initialize:true});
const ownerId=createHash('sha256').update(root+'\0acme').digest('hex').slice(0,24),instanceId=randomUUID();
const isolated=new BusinessIsolatedProcessService({authorizeProject,loadRoutes,registry,audit,
  execManagerFactory:r=>new BusinessExecManager(r,{dockerBinary:docker,dockerSha256:dockerSha,imageRef:EXEC_IMAGE_REF,imageId:EXEC_IMAGE_ID,ownerId,instanceId})});
const hostCalls=[];
const hostService={
  startHost(){hostCalls.push('start');throw Error('HOST_SHOULD_NOT_RUN');},getStatus(){hostCalls.push('status');throw Error('HOST_SHOULD_NOT_RUN');},
  readOutput(){hostCalls.push('read');throw Error('HOST_SHOULD_NOT_RUN');},terminateJob(){hostCalls.push('terminate');throw Error('HOST_SHOULD_NOT_RUN');}
};
const processes=new BusinessProcessService({hostService,isolatedService:isolated});
const reject=async(fn,code)=>{try{await fn();assert.fail('expected '+code);}catch(e){if(e?.code==='ERR_ASSERTION')throw e;assert.match(String(e?.message),new RegExp(code));}};
let initialized=false;
try{
  await isolated.initialize();initialized=true;
  profile='SAFE';
  await reject(()=>processes.startIsolated({authenticatedMemberKey:member,projectId:'standard',runtimeNodeId:shared,command:'echo NEVER'}),'BUSINESS_PROFILE_DENIED');
  profile='STANDARD';
  console.log('PASS process_start_isolated requires STANDARD profile before Docker effect');

  assert.throws(()=>resolveBusinessRuntimeRoute({projectId:'standard',runtimeNodeId:shared,toolName:'process_start_host',routes:[route()]}),/BUSINESS_SHARED_HOST_POWER_DENIED/);
  const isolatedRoute=resolveBusinessRuntimeRoute({projectId:'standard',runtimeNodeId:shared,toolName:'process_start_isolated',routes:[route()]});
  assert.equal(isolatedRoute.nodeType,'SHARED_NODE');
  console.log('PASS SHARED_NODE host-power=false denies generic HOST_USER while allowing isolated route');

  const probe=[
    "printf 'UID='; id -u",
    "if [ -S /var/run/docker.sock ] || [ -S /run/docker.sock ]; then echo DOCKER_SOCKET_PRESENT; exit 20; else echo DOCKER_SOCKET_ABSENT; fi",
    "node -e 'const b=Object.keys(process.env).filter(k=>/(TOKEN|CREDENTIAL|SECRET|API_KEY)/i.test(k)); console.log(\"SECRET_ENV_KEYS=\"+b.join(\",\")); process.exit(b.length?21:0)'",
    "if touch /usr/local/BS3F1_ROOTFS_TEST 2>/dev/null; then echo ROOTFS_WRITABLE; exit 22; else echo ROOTFS_BLOCKED; fi",
    "printf 'PIDS='; cat /sys/fs/cgroup/pids.max",
    "if printf x > .git/BS3F1_GIT_WRITE 2>/dev/null; then echo GIT_WRITABLE; exit 23; else echo GIT_BLOCKED; fi",
    "node -e 'const n=require(\"net\");const s=n.connect({host:\"1.1.1.1\",port:53});let d=false;const end=(c,m)=>{if(d)return;d=true;console.log(m);s.destroy();process.exit(c)};s.on(\"connect\",()=>end(24,\"NETWORK_CONNECTED\"));s.on(\"error\",e=>end(0,\"NETWORK_BLOCKED:\"+e.code));setTimeout(()=>end(25,\"NETWORK_TIMEOUT\"),1200)'",
    "echo BS3F1_ISOLATED_OK"
  ].join('\n');
  const started=await processes.startIsolated({authenticatedMemberKey:member,projectId:'standard',runtimeNodeId:shared,command:probe,yieldTimeMs:5000,timeoutMs:10000,maxOutputBytes:65536});
  assert.match(started.processId,/^xexec_[a-f0-9]{32}$/);
  let cursor=0,content='',state=started.state,exitCode=started.exitCode;
  for(let i=0;i<40&&state==='RUNNING';i++){
    const part=await processes.readOutput({authenticatedMemberKey:member,processId:started.processId,cursor,maxBytes:65536,waitMs:500});
    content+=part.content;cursor=part.cursor;state=part.state;exitCode=part.exitCode;
  }
  if(cursor===0){const part=await processes.readOutput({authenticatedMemberKey:member,processId:started.processId,cursor:0,maxBytes:65536,waitMs:0});content+=part.content;cursor=part.cursor;state=part.state;exitCode=part.exitCode;}
  assert.equal(state,'EXITED');assert.equal(exitCode,0);
  const status=await processes.getStatus({authenticatedMemberKey:member,processId:started.processId});assert.equal(status.state,'EXITED');
  const out={content};
  assert.match(out.content,/UID=(\d+)/);assert.notEqual(Number(out.content.match(/UID=(\d+)/)[1]),0);assert.match(out.content,/DOCKER_SOCKET_ABSENT/);
  assert.match(out.content,/SECRET_ENV_KEYS=\s*(?:\n|$)/);assert.match(out.content,/ROOTFS_BLOCKED/);assert.match(out.content,/PIDS=128/);
  assert.match(out.content,/GIT_BLOCKED/);assert.match(out.content,/NETWORK_BLOCKED:/);assert.match(out.content,/BS3F1_ISOLATED_OK/);
  assert.equal(hostCalls.length,0);assert.equal(readFileSync(join(projectRoot,'fixture.txt'),'utf8'),'ISOLATED_PROJECT\n');
  console.log('PASS actual mapped isolated process is non-root, rootfs/Git-read-only, pids-bounded, network-none, socket/secret-free');

  await reject(()=>processes.getStatus({authenticatedMemberKey:'other-member-subject',processId:started.processId}),'BUSINESS_PROCESS_NOT_OWNED');
  revision=12;await reject(()=>processes.getStatus({authenticatedMemberKey:member,processId:started.processId}),'BUSINESS_PROCESS_ROUTE_STALE');revision=11;
  console.log('PASS isolated processId follow-ups revalidate actor and exact project/node/mapping revision');

  const longRun=await processes.startIsolated({authenticatedMemberKey:member,projectId:'standard',runtimeNodeId:shared,command:'echo BS3F1_LONG_READY; sleep 30',yieldTimeMs:0,timeoutMs:60000,maxOutputBytes:65536});
  assert.equal(longRun.state,'RUNNING');
  const ready=await processes.readOutput({authenticatedMemberKey:member,processId:longRun.processId,cursor:0,maxBytes:65536,waitMs:5000});assert.match(ready.content,/BS3F1_LONG_READY/);
  const terminated=await processes.terminateJob({authenticatedMemberKey:member,processId:longRun.processId});assert.equal(terminated.state,'TERMINATED');
  assert.equal((await processes.getStatus({authenticatedMemberKey:member,processId:longRun.processId})).state,'TERMINATED');
  console.log('PASS shared process read/status/terminate contract works for isolated xexec namespace without host fallback');

  const bindings=registry.snapshot(),rawBindings=readFileSync(join(bindingDir,'business-isolated-process-bindings.json'),'utf8');
  assert.equal(bindings.length,2);assert.ok(bindings.every(x=>x.executionMode==='ISOLATED'&&x.nodeType==='SHARED_NODE'&&x.mappingRevision===11));
  for(const forbidden of ['BS3F1_ISOLATED_OK','BS3F1_LONG_READY','sleep 30',projectRoot,member])assert.equal(rawBindings.includes(forbidden),false);
  const events=audit.verify(),auditText=readFileSync(join(auditDir,'local-effect-audit.jsonl'),'utf8');
  assert.ok(events.some(x=>x.tool==='process_start_isolated'&&x.stage==='COMPLETED'&&x.effectOutcome==='COMMITTED'));
  assert.ok(events.some(x=>x.tool==='process_terminate_job'&&x.stage==='COMPLETED'&&x.effectOutcome==='COMMITTED'));
  for(const forbidden of ['BS3F1_ISOLATED_OK','BS3F1_LONG_READY','sleep 30',projectRoot,member])assert.equal(auditText.includes(forbidden),false);
  console.log('PASS isolated binding/audit retain authority metadata without command, output, OAuth subject, or host root');

  assert.equal(hostCalls.length,0);
  console.log('BUSINESS_S3F1_ISOLATED_EFFECTS=PASS');
}catch(e){console.error('BUSINESS_S3F1_ISOLATED_EFFECTS=FAIL '+e.stack);process.exitCode=1;}
finally{
  try{if(initialized)await isolated.close();}catch{}
  try{
    const ids=spawnSync(docker,['ps','-aq','--filter','label=chatagent.business.product=ChatAgentBusiness','--filter','label=chatagent.business.owner='+ownerId],{encoding:'utf8',timeout:10000});
    for(const id of ids.stdout.trim().split(/\s+/).filter(Boolean))spawnSync(docker,['rm','-f',id],{encoding:'utf8',timeout:10000});
  }catch{}
  rmSync(root,{recursive:true,force:true});console.log('test_only_fixture_cleanup=COMPLETE');
}
