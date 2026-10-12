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
import {BusinessIsolatedProcessRegistry} from './runtime/business-isolated-process-registry.mjs';
import {BusinessIsolatedProcessService} from './runtime/business-isolated-process-service.mjs';
import {DurableHostProcesses} from '../../l1/durable-host-processes.mjs';
import {BusinessExecManager} from '../business-exec.mjs';
import {SupabaseBusinessContinuityStore} from './continuity/supabase-business-continuity-store.mjs';

const repo=fileURLToPath(new URL('../../../',import.meta.url));
const l1=join(repo,'scripts/l1'),business=join(repo,'scripts/business'),v11=join(business,'v1.1');
const root=realpathSync(mkdtempSync(join(tmpdir(),'business-bs5c-')));chmodSync(root,0o700);
const projectRoot=join(root,'project'),binDir=join(root,'bin'),auditDir=join(root,'audit'),hostState=join(root,'host'),isolatedState=join(root,'isolated');
for(const p of [projectRoot])mkdirSync(p);for(const p of [binDir,auditDir,hostState,isolatedState])mkdirSync(p,{mode:0o700});
const sha=p=>createHash('sha256').update(readFileSync(p)).digest('hex');
const compile=(source,target,args=[])=>{const r=spawnSync('/usr/bin/clang',['-Wall','-Wextra','-Werror','-O2',...args,source,'-o',target],{encoding:'utf8'});assert.equal(r.status,0,r.stderr);chmodSync(target,0o700);return sha(target);};
const bins={create:join(binDir,'create'),replace:join(binDir,'replace'),mkdir:join(binDir,'mkdir'),move:join(binDir,'move'),delete:join(binDir,'delete')};
const nativeConfig={nativeCreateBinary:bins.create,nativeCreateSha256:compile(join(l1,'native-create-excl.c'),bins.create),
 nativeReplaceBinary:bins.replace,nativeReplaceSha256:compile(join(l1,'native-replace-cas.c'),bins.replace,['-framework','Security']),
 nativeMkdirBinary:bins.mkdir,nativeMkdirSha256:compile(join(business,'native-mkdir-excl.c'),bins.mkdir),
 nativeMoveBinary:bins.move,nativeMoveSha256:compile(join(v11,'native/native-move-excl.c'),bins.move,['-framework','Security']),
 nativeDeleteBinary:bins.delete,nativeDeleteSha256:compile(join(v11,'native/native-delete-bounded.c'),bins.delete,['-framework','Security'])};
const git='/usr/bin/git';spawnSync(git,['init','-q',projectRoot]);spawnSync(git,['-C',projectRoot,'config','user.email','bs5c@example.test']);spawnSync(git,['-C',projectRoot,'config','user.name','B-S5C']);
writeFileSync(join(projectRoot,'README.md'),'BASE\n',{mode:0o600});spawnSync(git,['-C',projectRoot,'add','README.md']);spawnSync(git,['-C',projectRoot,'commit','-qm','base']);

const member='oauth-member-bs5c',projectId='failure-recovery',org='acme';
const oldNode='65000000-0000-4000-8000-000000000001',replacementNode='65000000-0000-4000-8000-000000000002';
let backendUp=true,nowMs=Date.now(),currentNode={nodeId:oldNode,nodeType:'PERSONAL_NODE',lifecycle:'APPROVED',ownedByCaller:true,sharedHostPowerEnabled:false},mappingRevision=7;
const leaseExpiresAt=()=>new Date(nowMs+120000).toISOString();
const authCache=new BusinessProjectAuthorizationCache({ttlMs:120000,now:()=>nowMs,loadFresh:async({projectId:p})=>{
 if(!backendUp)throw Error('BUSINESS_BACKEND_UNAVAILABLE');return {projectId:p,authorized:true,projectProfile:'STANDARD',organizationId:org};
}});
const authorizeProject=args=>authCache.authorize(args);
const loadRoutes=async()=>({controlReachable:backendUp,nowMs,routes:[{node:{...currentNode},mapping:{projectId,runtimeNodeId:currentNode.nodeId,workspaceRootId:'proj04',workspaceRelativePath:'failure-recovery',mappingRevision,canonicalPath:projectRoot},session:{sessionState:'ACTIVE',leaseExpiresAt:leaseExpiresAt()}}]});
const audit=new BusinessLocalEffectAudit({stateDir:auditDir,initialize:true});
const fileService=new BusinessSemanticFileService({authorizeProject,loadRoutes,audit,nativeConfig});
const gitService=new BusinessSemanticGitService({authorizeProject,loadRoutes,authorizeWorkspaceClone:async()=>{throw Error('NOT_USED');},audit,gitBinary:git});
const broker=new BusinessDurableProcessBroker(hostState,{initialize:true}),hostRegistry=new BusinessProcessRegistry({stateDir:hostState,initialize:true}),hostProcesses=new DurableHostProcesses(broker);
const hostService=new BusinessHostProcessService({processBroker:broker,registry:hostRegistry,processes:hostProcesses,authorizeProject,loadRoutes});
const isolatedRegistry=new BusinessIsolatedProcessRegistry({stateDir:isolatedState,initialize:true});
const dockerBinary='/Applications/Docker.app/Contents/Resources/bin/docker',dockerSha256='d69813f7f735ab262a3955c4814647b7e912d23a62a3236d03d287867f4867d8';
const imageRef='node@sha256:0e0ff40c39bc087845bfb27465a0df4ea419520094bc35842ff83dd8cbe6f9b6',imageId='sha256:0e0ff40c39bc087845bfb27465a0df4ea419520094bc35842ff83dd8cbe6f9b6';
const isolatedService=new BusinessIsolatedProcessService({authorizeProject,loadRoutes,registry:isolatedRegistry,audit,execManagerFactory:r=>new BusinessExecManager(r,{dockerBinary,dockerSha256,imageRef,imageId,ownerId:createHash('sha256').update(root+'\0bs5c').digest('hex').slice(0,24),instanceId:randomUUID()})});
const continuity=new SupabaseBusinessContinuityStore({authSession:{async ensureSession(){},async rpc(){return {data:null,error:{message:'network unavailable'}};}}});
async function hostTerminal(processId){for(let i=0;i<120;i++){const s=await hostService.getStatus({authenticatedMemberKey:member,processId});if(['EXITED','FAILED','TERMINATED'].includes(s.state))return s;await delay(50);}throw Error('WAIT_TIMEOUT');}
async function isolatedTerminal(started){let state=started,cursor=started.cursor??0,content=started.content??'';for(let i=0;i<30&&!['EXITED','FAILED','TERMINATED'].includes(state.state);i++){const r=await isolatedService.readOutput({authenticatedMemberKey:member,processId:started.processId,cursor,maxBytes:65536,waitMs:500});cursor=r.cursor;content+=r.content;state=r;}return {...state,content};}

try{
 await isolatedService.initialize();
 await authCache.authorize({authenticatedMemberKey:member,projectId});
 backendUp=false;
 const file=await fileService.createFile({authenticatedMemberKey:member,projectId,runtimeNodeId:oldNode,relativePath:'offline.txt',content:'BS5C_LOCAL_FILE_OK\n'});assert.equal(file.mappingRevision,7);
 const branch=await gitService.createBranch({authenticatedMemberKey:member,projectId,runtimeNodeId:oldNode,branchName:'bs5c-offline-work'});assert.equal(branch.branchName,'bs5c-offline-work');
 const started=await hostService.startHost({authenticatedMemberKey:member,projectId,runtimeNodeId:oldNode,executable:process.execPath,argv:['-e',"process.stdout.write('BS5C_HOST_OFFLINE_OK\\n')"],cwd:'.',timeoutMs:5000,idempotencyKey:randomUUID()});
 const done=await hostTerminal(started.processId);assert.equal(done.state,'EXITED');const output=await hostService.readOutput({authenticatedMemberKey:member,processId:started.processId,cursor:0,maxBytes:4096});assert.match(output.content,/BS5C_HOST_OFFLINE_OK/);
 await assert.rejects(()=>continuity.taskStart({projectId,objective:'must fail closed during outage',operationId:randomUUID()}),/BUSINESS_BACKEND_UNAVAILABLE/);
 const unavailable=await continuity.getContext({projectId});assert.equal(unavailable.freshness,'UNVERIFIED');assert.equal(unavailable.freshnessReason,'CONTINUITY_UNAVAILABLE');
 console.log('PASS controlled backend outage preserves bounded filesystem/Git/HOST_USER local work while continuity mutation fails closed');

 backendUp=true;currentNode={...currentNode,lifecycle:'REVOKED'};
 await assert.rejects(()=>fileService.getFileHash({authenticatedMemberKey:member,projectId,runtimeNodeId:oldNode,relativePath:'offline.txt'}),/BUSINESS_RUNTIME_NODE_REVOKED/);
 await assert.rejects(()=>gitService.getStatus({authenticatedMemberKey:member,projectId,runtimeNodeId:oldNode}),/BUSINESS_RUNTIME_NODE_REVOKED/);
 await assert.rejects(()=>hostService.startHost({authenticatedMemberKey:member,projectId,runtimeNodeId:oldNode,executable:process.execPath,argv:['-e','0'],cwd:'.',timeoutMs:5000,idempotencyKey:randomUUID()}),/BUSINESS_RUNTIME_NODE_REVOKED/);
 console.log('PASS recovered control-plane revoke blocks new file/Git/HOST_USER work on the old PERSONAL_NODE');

 currentNode={nodeId:replacementNode,nodeType:'PERSONAL_NODE',lifecycle:'APPROVED',ownedByCaller:true,sharedHostPowerEnabled:false};mappingRevision=8;
 const recovered=await fileService.getFileHash({authenticatedMemberKey:member,projectId,runtimeNodeId:replacementNode,relativePath:'offline.txt'});assert.match(recovered.sha256,/^[a-f0-9]{64}$/);
 const isoStarted=await isolatedService.startIsolated({authenticatedMemberKey:member,projectId,runtimeNodeId:replacementNode,command:"printf 'BS5C_ISOLATED_OK\\n'",cwd:'.',timeoutMs:15000,yieldTimeMs:5000,maxOutputBytes:65536});
 const isoDone=await isolatedTerminal(isoStarted);assert.equal(isoDone.state,'EXITED');assert.equal(isoDone.exitCode,0);assert.match(isoDone.content,/BS5C_ISOLATED_OK/);
 console.log('PASS replacement PERSONAL_NODE restores bounded authority and isolated Docker execution remains healthy');

 const records=audit.readRecent(200);assert.ok(records.some(x=>x.tool==='fs_create_file'&&x.stage==='COMPLETED'));assert.ok(records.some(x=>x.tool==='git_create_branch'&&x.stage==='COMPLETED'));assert.ok(records.some(x=>x.tool==='process_start_isolated'&&x.stage==='COMPLETED'));
 console.log('BUSINESS_S5C_FAILURE_RECOVERY=PASS');
}finally{
 try{await isolatedService.close();}catch{}try{hostProcesses.stopAll();}catch{}await delay(250);rmSync(root,{recursive:true,force:true});console.log('test_only_fixture_cleanup=COMPLETE');
}
