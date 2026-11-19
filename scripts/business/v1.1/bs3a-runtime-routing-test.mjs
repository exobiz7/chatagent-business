import assert from 'node:assert/strict';
import {chmodSync,mkdtempSync,mkdirSync,rmSync,symlinkSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {spawnSync} from 'node:child_process';

import {LocalWorkspaceRegistry} from './runtime/local-workspace-registry.mjs';
import {BusinessRuntimeMappingService} from './runtime/business-runtime-mapping-service.mjs';
import {resolveBusinessRuntimeRoute,publicRuntimeRoute} from './runtime/business-runtime-router.mjs';
import {loadBusinessPublishableRuntimeConfig} from './runtime/publishable-runtime-config.mjs';

const root=mkdtempSync(join(tmpdir(),'business-bs3a-'));
chmodSync(root,0o700);
const stateA=join(root,'state-a'),stateB=join(root,'state-b');
const workA=join(root,'work-a'),workB=join(root,'work-b');
mkdirSync(stateA,{mode:0o700});mkdirSync(stateB,{mode:0o700});
mkdirSync(workA,{mode:0o700});mkdirSync(workB,{mode:0o700});
const projectA=join(workA,'backend'),projectB=join(workB,'backend-local'),serviceProject=join(workA,'service-project');
mkdirSync(projectA,{mode:0o700});mkdirSync(projectB,{mode:0o700});mkdirSync(serviceProject,{mode:0o700});

const git=(cwd,args)=>{
  const r=spawnSync('/usr/bin/git',['-C',cwd,...args],{encoding:'utf8',timeout:3000});
  if(r.status!==0)throw Error(`GIT_FIXTURE_FAILED:${r.stderr}`);
  return r.stdout.trim();
};
git(projectA,['init']);git(projectA,['remote','add','origin','https://example.invalid/org/backend.git']);
git(projectB,['init']);git(projectB,['remote','add','origin','https://example.invalid/org/backend.git']);

const nodeA='30000000-0000-4000-8000-000000000001';
const nodeB='30000000-0000-4000-8000-000000000002';
const shared='30000000-0000-4000-8000-000000000003';

try{
  const publicConfigPath=join(root,'public-runtime-config.json');
  const syntheticPublicConfig={schemaVersion:1,projectRef:'a'.repeat(20),url:'https://example.supabase.co',publishableKey:'sb_publishable_'+('x'.repeat(24))};
  writeFileSync(publicConfigPath,JSON.stringify(syntheticPublicConfig)+'\n',{mode:0o600});
  assert.equal(loadBusinessPublishableRuntimeConfig(publicConfigPath).projectRef,'a'.repeat(20));
  chmodSync(publicConfigPath,0o644);
  assert.throws(()=>loadBusinessPublishableRuntimeConfig(publicConfigPath),/BUSINESS_PUBLIC_CONFIG_UNSAFE/);
  chmodSync(publicConfigPath,0o600);
  writeFileSync(publicConfigPath,JSON.stringify({...syntheticPublicConfig,serviceRole:'forbidden'})+'\n',{mode:0o600});
  assert.throws(()=>loadBusinessPublishableRuntimeConfig(publicConfigPath),/BUSINESS_PUBLIC_CONFIG_INVALID/);
  writeFileSync(publicConfigPath,JSON.stringify(syntheticPublicConfig)+'\n',{mode:0o600});

  const a=new LocalWorkspaceRegistry({stateDir:stateA,nodeId:nodeA,initialize:true,
    workspaceRoots:[{workspaceRootId:'main',path:workA,label:'Main Workspace'}]});
  const b=new LocalWorkspaceRegistry({stateDir:stateB,nodeId:nodeB,initialize:true,
    workspaceRoots:[{workspaceRootId:'main',path:workB,label:'Main Workspace'}]});

  const opA=randomUUID();
  const mapA=a.mapProject({projectId:'backend',runtimeNodeId:nodeA,workspaceRootId:'main',
    workspaceRelativePath:'backend',expectedGitRemoteUrl:'https://example.invalid/org/backend.git',operationId:opA});
  assert.equal(mapA.mappingRevision,1);
  assert.equal(mapA.workspaceRelativePath,'backend');
  assert.equal('canonicalPath' in mapA,false,'public mapping receipt must not disclose absolute host path');
  assert.deepEqual(a.mapProject({projectId:'backend',runtimeNodeId:nodeA,workspaceRootId:'main',
    workspaceRelativePath:'backend',expectedGitRemoteUrl:'https://example.invalid/org/backend.git',operationId:opA}),mapA);
  assert.throws(()=>a.mapProject({projectId:'backend',runtimeNodeId:nodeA,workspaceRootId:'main',
    workspaceRelativePath:'backend',expectedGitRemoteUrl:'https://different.invalid/repo.git',operationId:opA}),/BUSINESS_IDEMPOTENCY_CONFLICT/);

  const mapB=b.mapProject({projectId:'backend',runtimeNodeId:nodeB,workspaceRootId:'main',
    workspaceRelativePath:'backend-local',expectedGitRemoteUrl:'https://example.invalid/org/backend.git',operationId:randomUUID()});
  assert.equal(mapB.mappingRevision,1);
  assert.notEqual(a.resolveProject('backend').canonicalPath,b.resolveProject('backend').canonicalPath,
    'same logical project must support different local paths per runtime node');

  assert.throws(()=>a.mapProject({projectId:'other',runtimeNodeId:nodeB,workspaceRootId:'main',
    workspaceRelativePath:'backend',operationId:randomUUID()}),/BUSINESS_RUNTIME_NODE_MISMATCH/);
  assert.throws(()=>a.mapProject({projectId:'other',runtimeNodeId:nodeA,workspaceRootId:'main',
    workspaceRelativePath:'../escape',operationId:randomUUID()}),/BUSINESS_WORKSPACE_RELATIVE_PATH_INVALID/);
  assert.throws(()=>a.mapProject({projectId:'other',runtimeNodeId:nodeA,workspaceRootId:'main',
    workspaceRelativePath:'backend',expectedGitRemoteUrl:'https://wrong.invalid/repo.git',operationId:randomUUID()}),/BUSINESS_GIT_REMOTE_MISMATCH/);

  mkdirSync(join(workA,'real'),{mode:0o700});
  symlinkSync(join(workA,'real'),join(workA,'linked'));
  assert.throws(()=>a.mapProject({projectId:'linked-project',runtimeNodeId:nodeA,workspaceRootId:'main',
    workspaceRelativePath:'linked',operationId:randomUUID()}),/BUSINESS_PROJECT_MAPPING_SYMLINK_DENIED/);

  const now=Date.now();
  const personalA={nodeId:nodeA,nodeType:'PERSONAL_NODE',lifecycle:'APPROVED',ownedByCaller:true,sharedHostPowerEnabled:false};
  const personalBWrongOwner={nodeId:nodeB,nodeType:'PERSONAL_NODE',lifecycle:'APPROVED',ownedByCaller:false,sharedHostPowerEnabled:false};
  const sharedNode={nodeId:shared,nodeType:'SHARED_NODE',lifecycle:'APPROVED',ownedByCaller:false,sharedHostPowerEnabled:false};

  const mappingService=new BusinessRuntimeMappingService({
    workspaceRegistry:a,
    runtimeRegistry:{async status(id){return id===nodeA?personalA:personalBWrongOwner;}},
    async authorizeProject(projectId){return {projectId,authorized:projectId==='service-project'};}
  });
  await assert.rejects(()=>mappingService.mapProject({projectId:'unauthorized',runtimeNodeId:nodeA,workspaceRootId:'main',workspaceRelativePath:'service-project',operationId:randomUUID()}),/BUSINESS_PROJECT_AUTHORIZATION_DENIED/);
  const serviceMap=await mappingService.mapProject({projectId:'service-project',runtimeNodeId:nodeA,workspaceRootId:'main',workspaceRelativePath:'service-project',operationId:randomUUID()});
  assert.equal(serviceMap.mapped,true);
  assert.equal(a.listMappings().some(x=>x.projectId==='unauthorized'),false);
  await assert.rejects(()=>mappingService.mapProject({projectId:'service-project',runtimeNodeId:nodeB,workspaceRootId:'main',workspaceRelativePath:'service-project',operationId:randomUUID()}),/BUSINESS_PERSONAL_NODE_OWNER_MISMATCH/);
  const serviceUnmap=await mappingService.unmapProject({projectId:'service-project',runtimeNodeId:nodeA,expectedMappingRevision:serviceMap.mappingRevision,operationId:randomUUID()});
  assert.equal(serviceUnmap.unmapped,true);
  const sharedMapping={...a.resolveProject('backend'),runtimeNodeId:shared};
  const routes=[
    {node:personalA,mapping:a.resolveProject('backend'),session:{sessionState:'ACTIVE',leaseExpiresAt:new Date(now+60_000).toISOString()}},
    {node:personalBWrongOwner,mapping:b.resolveProject('backend'),session:{sessionState:'ACTIVE',leaseExpiresAt:new Date(now+60_000).toISOString()}},
    {node:sharedNode,mapping:sharedMapping,session:{sessionState:'ACTIVE',leaseExpiresAt:new Date(now+60_000).toISOString()}}
  ];

  assert.throws(()=>resolveBusinessRuntimeRoute({projectId:'backend',toolName:'git_get_status',routes,nowMs:now}),/BUSINESS_RUNTIME_NODE_REQUIRED/);
  const explicit=resolveBusinessRuntimeRoute({projectId:'backend',runtimeNodeId:nodeA,toolName:'git_get_status',routes,nowMs:now});
  assert.equal(explicit.nodeId,nodeA);
  assert.equal(explicit.authorizationSource,'CONTROL_PLANE');
  assert.equal(publicRuntimeRoute(explicit).runtimeNodeId,nodeA);
  assert.equal('localProjectRoot' in publicRuntimeRoute(explicit),false,'public route must not disclose local project root');

  assert.throws(()=>resolveBusinessRuntimeRoute({projectId:'backend',runtimeNodeId:nodeB,toolName:'git_get_status',routes,nowMs:now}),/BUSINESS_PERSONAL_NODE_OWNER_MISMATCH/);
  assert.throws(()=>resolveBusinessRuntimeRoute({projectId:'backend',runtimeNodeId:shared,toolName:'process_start_host',routes,nowMs:now}),/BUSINESS_SHARED_HOST_POWER_DENIED/);
  const sharedHost=resolveBusinessRuntimeRoute({projectId:'backend',runtimeNodeId:shared,toolName:'process_start_host',
    routes:routes.map(x=>x.node.nodeId===shared?{...x,node:{...x.node,sharedHostPowerEnabled:true}}:x),nowMs:now});
  assert.equal(sharedHost.nodeId,shared);

  const offline=resolveBusinessRuntimeRoute({projectId:'backend',runtimeNodeId:nodeA,toolName:'git_get_status',routes,
    controlReachable:false,nowMs:now});
  assert.equal(offline.authorizationSource,'CACHED_LEASE');
  assert.throws(()=>resolveBusinessRuntimeRoute({projectId:'backend',runtimeNodeId:nodeA,toolName:'git_get_status',
    routes:[{...routes[0],session:{sessionState:'ACTIVE',leaseExpiresAt:new Date(now-1).toISOString()}}],
    controlReachable:false,nowMs:now}),/BUSINESS_AUTH_LEASE_EXPIRED/);
  assert.throws(()=>resolveBusinessRuntimeRoute({projectId:'unmapped',toolName:'git_get_status',routes:[],nowMs:now}),/BUSINESS_RUNTIME_NODE_UNAVAILABLE/);

  const unmapOp=randomUUID();
  const unmap=a.unmapProject({projectId:'backend',runtimeNodeId:nodeA,expectedMappingRevision:mapA.mappingRevision,operationId:unmapOp});
  assert.equal(unmap.unmapped,true);
  assert.deepEqual(a.unmapProject({projectId:'backend',runtimeNodeId:nodeA,expectedMappingRevision:mapA.mappingRevision,operationId:unmapOp}),unmap);
  assert.throws(()=>a.resolveProject('backend'),/BUSINESS_PROJECT_NOT_MAPPED/);

  const remap=a.mapProject({projectId:'backend',runtimeNodeId:nodeA,workspaceRootId:'main',workspaceRelativePath:'backend',operationId:randomUUID()});
  assert.ok(remap.mappingRevision>mapA.mappingRevision,'mapping revisions must be monotonic across unmap/remap to prevent ABA');

  console.log('PASS owner-private mapping registry keeps host paths local and receipts bounded');
  console.log('PASS mapping operations are UUID-idempotent, revisioned, symlink/traversal-safe and optional Git-remote verified');
  console.log('PASS same logical project maps to different node-local paths without cloud path authority');
  console.log('PASS runtime routing enforces 0/1/2+ selection, PERSONAL_NODE ownership and SHARED_NODE host-power');
  console.log('PASS control outage uses only unexpired cached node authorization lease');
  console.log('BUSINESS_S3A_RUNTIME_ROUTING=PASS');
} finally {
  rmSync(root,{recursive:true,force:true});
}
