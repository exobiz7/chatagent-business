import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {chmodSync,mkdtempSync,mkdirSync,readFileSync,realpathSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {setTimeout as delay} from 'node:timers/promises';
import {BusinessProjectAuthorizationCache} from './runtime/business-project-authorization-cache.mjs';
import {BusinessSemanticFileService} from './runtime/business-semantic-file-service.mjs';
import {BusinessSemanticGitService} from './runtime/business-semantic-git-service.mjs';
import {BusinessLocalEffectAudit} from './runtime/business-local-effect-audit.mjs';
import {BusinessDurableProcessBroker} from './runtime/business-durable-process-broker.mjs';
import {BusinessProcessRegistry} from './runtime/business-process-registry.mjs';
import {BusinessHostProcessService} from './runtime/business-host-process-service.mjs';
import {DurableHostProcesses} from '../../l1/durable-host-processes.mjs';
import {SupabaseBusinessContinuityStore} from './continuity/supabase-business-continuity-store.mjs';

const repo=fileURLToPath(new URL('../../../',import.meta.url)),l1=join(repo,'scripts/l1'),business=join(repo,'scripts/business'),v11=join(business,'v1.1');
const root=realpathSync(mkdtempSync(join(tmpdir(),'business-bs4c-degraded-')));chmodSync(root,0o700);
const projectRoot=join(root,'project'),binDir=join(root,'bin'),auditDir=join(root,'audit'),processState=join(root,'process');
for(const p of [projectRoot])mkdirSync(p);for(const p of [binDir,auditDir,processState])mkdirSync(p,{mode:0o700});
const sha=p=>createHash('sha256').update(readFileSync(p)).digest('hex');
const compile=(source,target,args=[])=>{const r=spawnSync('/usr/bin/clang',['-Wall','-Wextra','-Werror','-O2',...args,source,'-o',target],{encoding:'utf8'});assert.equal(r.status,0,r.stderr);chmodSync(target,0o700);return sha(target);};
const bins={create:join(binDir,'create'),replace:join(binDir,'replace'),mkdir:join(binDir,'mkdir'),move:join(binDir,'move'),delete:join(binDir,'delete')};
const nativeConfig={nativeCreateBinary:bins.create,nativeCreateSha256:compile(join(l1,'native-create-excl.c'),bins.create),
 nativeReplaceBinary:bins.replace,nativeReplaceSha256:compile(join(l1,'native-replace-cas.c'),bins.replace,['-framework','Security']),
 nativeMkdirBinary:bins.mkdir,nativeMkdirSha256:compile(join(business,'native-mkdir-excl.c'),bins.mkdir),
 nativeMoveBinary:bins.move,nativeMoveSha256:compile(join(v11,'native/native-move-excl.c'),bins.move,['-framework','Security']),
 nativeDeleteBinary:bins.delete,nativeDeleteSha256:compile(join(v11,'native/native-delete-bounded.c'),bins.delete,['-framework','Security'])};
const git='/usr/bin/git';spawnSync(git,['init','-q',projectRoot]);spawnSync(git,['-C',projectRoot,'config','user.email','bs4c@example.test']);spawnSync(git,['-C',projectRoot,'config','user.name','B-S4C']);
writeFileSync(join(projectRoot,'README.md'),'BASE\n',{mode:0o600});spawnSync(git,['-C',projectRoot,'add','README.md']);spawnSync(git,['-C',projectRoot,'commit','-qm','base']);
const member='oauth-member-bs4c',projectId='degraded',nodeId='55000000-0000-4000-8000-000000000001',org='acme';
let backendUp=true,nowMs=Date.now(),leaseExpiresAt=new Date(nowMs+120000).toISOString();
const authCache=new BusinessProjectAuthorizationCache({ttlMs:120000,now:()=>nowMs,loadFresh:async({projectId:p})=>{
 if(!backendUp)throw Error('BUSINESS_BACKEND_UNAVAILABLE');return {projectId:p,authorized:true,projectProfile:'STANDARD',organizationId:org};
}});
const authorizeProject=args=>authCache.authorize(args);
const loadRoutes=async()=>({controlReachable:false,nowMs,routes:[{node:{nodeId,nodeType:'PERSONAL_NODE',lifecycle:'APPROVED',ownedByCaller:true,sharedHostPowerEnabled:false},
 mapping:{projectId,runtimeNodeId:nodeId,workspaceRootId:'proj04',workspaceRelativePath:'degraded',mappingRevision:7,canonicalPath:projectRoot},
 session:{sessionState:'ACTIVE',leaseExpiresAt}}]});
const audit=new BusinessLocalEffectAudit({stateDir:auditDir,initialize:true});
const fileService=new BusinessSemanticFileService({authorizeProject,loadRoutes,audit,nativeConfig});
const gitService=new BusinessSemanticGitService({authorizeProject,loadRoutes,authorizeWorkspaceClone:async()=>{throw Error('NOT_USED');},audit,gitBinary:git});
const broker=new BusinessDurableProcessBroker(processState,{initialize:true}),registry=new BusinessProcessRegistry({stateDir:processState,initialize:true}),processes=new DurableHostProcesses(broker);
const hostService=new BusinessHostProcessService({processBroker:broker,registry,processes,authorizeProject,loadRoutes});
const continuity=new SupabaseBusinessContinuityStore({authSession:{async ensureSession(){},async rpc(){return {data:null,error:{message:'network unavailable'}};}}});
async function terminal(processId){for(let i=0;i<120;i++){const s=await hostService.getStatus({authenticatedMemberKey:member,processId});if(['EXITED','FAILED','TERMINATED'].includes(s.state))return s;await delay(50);}throw Error('WAIT_TIMEOUT');}
try{
 await authCache.authorize({authenticatedMemberKey:member,projectId});backendUp=false;
 const file=await fileService.createFile({authenticatedMemberKey:member,projectId,runtimeNodeId:nodeId,relativePath:'offline.txt',content:'LOCAL_OFFLINE_OK\n'});
 assert.equal(readFileSync(join(projectRoot,'offline.txt'),'utf8'),'LOCAL_OFFLINE_OK\n');assert.equal(file.mappingRevision,7);
 const branch=await gitService.createBranch({authenticatedMemberKey:member,projectId,runtimeNodeId:nodeId,branchName:'offline-work'});assert.equal(branch.branchName,'offline-work');
 const started=await hostService.startHost({authenticatedMemberKey:member,projectId,runtimeNodeId:nodeId,executable:process.execPath,
  argv:['-e',"process.stdout.write('HOST_OFFLINE_OK\\n')"],cwd:'.',timeoutMs:5000,idempotencyKey:randomUUID()});
 const done=await terminal(started.processId);assert.equal(done.state,'EXITED');const output=await hostService.readOutput({authenticatedMemberKey:member,processId:started.processId,cursor:0,maxBytes:4096});assert.match(output.content,/HOST_OFFLINE_OK/);
 await assert.rejects(()=>continuity.taskStart({projectId,objective:'must not queue offline',operationId:randomUUID()}),/BUSINESS_BACKEND_UNAVAILABLE/);
 const context=await continuity.getContext({projectId});assert.equal(context.freshness,'UNVERIFIED');assert.equal(context.freshnessReason,'CONTINUITY_UNAVAILABLE');
 const records=audit.readRecent(100);assert.ok(records.some(x=>x.tool==='fs_create_file'&&x.stage==='COMPLETED'));assert.ok(records.some(x=>x.tool==='git_create_branch'&&x.stage==='COMPLETED'));
 assert.equal(authCache.snapshot().length,1);
 console.log('PASS control/continuity outage keeps mapped filesystem, Git and HOST_USER effects available through bounded cached authority');
 console.log('PASS continuity mutation fails closed and continuity read becomes explicit UNVERIFIED/CONTINUITY_UNAVAILABLE; no offline queue or SQLite fallback exists');
 nowMs+=121000;
 await assert.rejects(()=>fileService.getFileHash({authenticatedMemberKey:member,projectId,runtimeNodeId:nodeId,relativePath:'offline.txt'}),/BUSINESS_PROJECT_AUTH_LEASE_EXPIRED/);
 console.log('PASS degraded local work stops after bounded project authorization lease expiry instead of becoming open-ended authority');
 console.log('BUSINESS_S4C_DEGRADED_CONTINUITY=PASS');
}finally{try{processes.stopAll();}catch{}await delay(250);rmSync(root,{recursive:true,force:true});console.log('test_only_fixture_cleanup=COMPLETE');}
