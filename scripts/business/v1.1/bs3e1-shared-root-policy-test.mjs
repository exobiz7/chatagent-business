import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {chmodSync,existsSync,mkdtempSync,mkdirSync,readFileSync,realpathSync,renameSync,rmSync,symlinkSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {LocalWorkspaceRegistry} from './runtime/local-workspace-registry.mjs';
import {BusinessWorkspaceRootPolicy} from './runtime/business-workspace-root-policy.mjs';
import {BusinessSemanticFileService} from './runtime/business-semantic-file-service.mjs';
import {BusinessSemanticGitService} from './runtime/business-semantic-git-service.mjs';
import {BusinessLocalEffectAudit} from './runtime/business-local-effect-audit.mjs';
import {resolveBusinessRuntimeRoute} from './runtime/business-runtime-router.mjs';

const repo=fileURLToPath(new URL('../../../',import.meta.url));
const git='/usr/bin/git',clang='/usr/bin/clang';
const root=realpathSync(mkdtempSync(join(tmpdir(),'chatagent-business-s3e1-')));chmodSync(root,0o700);
const state=join(root,'state'),auditDir=join(root,'audit'),approved=join(root,'approved'),outside=join(root,'outside'),seed=join(root,'seed'),bare=join(outside,'source.git'),bin=join(root,'bin');
for(const p of [state,auditDir,approved,outside,seed,bin])mkdirSync(p,{mode:0o700});
const sharedId='30000000-0000-4000-8000-000000000001',wrongId='30000000-0000-4000-8000-000000000002';
let sharedNode={nodeId:sharedId,nodeType:'SHARED_NODE',lifecycle:'APPROVED',ownedByCaller:false,sharedHostPowerEnabled:false};
const member='oauth-subject-s3e1-shared-member';
const sha=v=>createHash('sha256').update(v).digest('hex');
const fileSha=p=>sha(readFileSync(p));
const run=(cwd,args)=>{const r=spawnSync(git,args,{cwd,encoding:'utf8',env:{...process.env,GIT_TERMINAL_PROMPT:'0'}});assert.equal(r.status,0,r.stderr);return r.stdout.trim();};
const reject=async(fn,code)=>{try{await fn();assert.fail('expected '+code);}catch(e){if(e?.code==='ERR_ASSERTION')throw e;assert.match(String(e?.message),new RegExp(code));}};
const compile=(source,target,args=[])=>{const r=spawnSync(clang,['-Wall','-Wextra','-Werror','-O2',...args,source,'-o',target],{encoding:'utf8'});assert.equal(r.status,0,r.stderr);chmodSync(target,0o700);return fileSha(target);};

run(seed,['init','-b','main']);run(seed,['config','user.name','S3E Fixture']);run(seed,['config','user.email','fixture@example.invalid']);
writeFileSync(join(seed,'README.md'),'seed\n',{mode:0o600});run(seed,['add','--','README.md']);run(seed,['commit','-m','seed']);run(root,['clone','--bare',seed,bare]);
const sourceUrl=pathToFileURL(bare).href;
const registry=new LocalWorkspaceRegistry({stateDir:state,nodeId:sharedId,initialize:true,workspaceRoots:[{workspaceRootId:'team-root',path:approved,label:'team-root'}]});
assert.deepEqual(registry.listWorkspaceRoots(),[{workspaceRootId:'team-root',label:'team-root'}]);
const runtimeRegistry={async status(id){assert.equal(id,sharedId);return sharedNode;}};
const rootPolicy=new BusinessWorkspaceRootPolicy({workspaceRegistry:registry,runtimeRegistry,loadOrganizationId:async({authenticatedMemberKey})=>{assert.equal(authenticatedMemberKey,member);return 'acme';}});
const audit=new BusinessLocalEffectAudit({stateDir:auditDir,initialize:true});

const l1=join(repo,'scripts/l1'),business=join(repo,'scripts/business'),v11=join(business,'v1.1');
const bins={create:join(bin,'create'),replace:join(bin,'replace'),mkdir:join(bin,'mkdir'),move:join(bin,'move'),delete:join(bin,'delete')};
const nativeConfig={
  nativeCreateBinary:bins.create,nativeCreateSha256:compile(join(l1,'native-create-excl.c'),bins.create),
  nativeReplaceBinary:bins.replace,nativeReplaceSha256:compile(join(l1,'native-replace-cas.c'),bins.replace,['-framework','Security']),
  nativeMkdirBinary:bins.mkdir,nativeMkdirSha256:compile(join(business,'native-mkdir-excl.c'),bins.mkdir),
  nativeMoveBinary:bins.move,nativeMoveSha256:compile(join(v11,'native/native-move-excl.c'),bins.move,['-framework','Security']),
  nativeDeleteBinary:bins.delete,nativeDeleteSha256:compile(join(v11,'native/native-delete-bounded.c'),bins.delete,['-framework','Security'])
};

try{
  const cloneAuth=await rootPolicy.authorizeClone({authenticatedMemberKey:member,runtimeNodeId:sharedId,workspaceRootId:'team-root'});
  assert.equal(cloneAuth.workspaceRootPath,approved);assert.equal(cloneAuth.node.nodeType,'SHARED_NODE');assert.equal(cloneAuth.node.sharedHostPowerEnabled,false);
  await reject(()=>rootPolicy.authorizeClone({authenticatedMemberKey:member,runtimeNodeId:sharedId,workspaceRootId:'unknown'}),'BUSINESS_WORKSPACE_ROOT_UNKNOWN');
  await reject(()=>rootPolicy.authorizeClone({authenticatedMemberKey:member,runtimeNodeId:wrongId,workspaceRootId:'team-root'}),'BUSINESS_RUNTIME_NODE_MISMATCH');
  const mismatchedPolicy=new BusinessWorkspaceRootPolicy({workspaceRegistry:registry,runtimeRegistry:{async status(){return {...sharedNode,nodeId:wrongId};}},loadOrganizationId:async()=> 'acme'});
  await reject(()=>mismatchedPolicy.authorizeClone({authenticatedMemberKey:member,runtimeNodeId:sharedId,workspaceRootId:'team-root'}),'BUSINESS_RUNTIME_NODE_MISMATCH');
  console.log('PASS SHARED clone authority resolves only configured canonical roots and rejects requested/returned node mismatch');

  const gitService=new BusinessSemanticGitService({
    authorizeProject:async({projectId})=>({projectId,authorized:true,projectProfile:'STANDARD',organizationId:'acme'}),
    loadRoutes:async({projectId})=>({routes:[{node:sharedNode,mapping:registry.resolveProject(projectId)}],controlReachable:true}),
    authorizeWorkspaceClone:args=>rootPolicy.authorizeClone(args),audit,gitBinary:git,allowFileProtocolForTests:true
  });
  const cloned=await gitService.cloneRepository({authenticatedMemberKey:member,runtimeNodeId:sharedId,workspaceRootId:'team-root',repositoryUrl:sourceUrl,directoryName:'shared-clone'});
  assert.equal(cloned.cloned,true);assert.equal(realpathSync(join(approved,'shared-clone')).startsWith(realpathSync(approved)+'/'),true);
  await reject(()=>gitService.cloneRepository({authenticatedMemberKey:member,runtimeNodeId:sharedId,workspaceRootId:'unknown',repositoryUrl:sourceUrl,directoryName:'should-not-exist'}),'BUSINESS_WORKSPACE_ROOT_UNKNOWN');
  assert.equal(existsSync(join(approved,'should-not-exist')),false);
  console.log('PASS SHARED_NODE semantic clone is root-bounded without broad host-power opt-in');

  assert.throws(()=>registry.mapProject({projectId:'escape',runtimeNodeId:sharedId,workspaceRootId:'team-root',workspaceRelativePath:'../outside',operationId:randomUUID()}),/BUSINESS_WORKSPACE_RELATIVE_PATH_INVALID/);
  symlinkSync(outside,join(approved,'outside-link'));
  assert.throws(()=>registry.mapProject({projectId:'symlink',runtimeNodeId:sharedId,workspaceRootId:'team-root',workspaceRelativePath:'outside-link',operationId:randomUUID()}),/BUSINESS_PROJECT_MAPPING_SYMLINK_DENIED/);
  const receipt=registry.mapProject({projectId:'shared-project',runtimeNodeId:sharedId,workspaceRootId:'team-root',workspaceRelativePath:'shared-clone',expectedGitRemoteUrl:sourceUrl,operationId:randomUUID()});
  assert.equal(receipt.mappingRevision,1);
  console.log('PASS mapping refuses traversal/symlink escape and binds the logical project to the approved root revision');

  const fileService=new BusinessSemanticFileService({
    authorizeProject:async({projectId})=>({projectId,authorized:true,projectProfile:'STANDARD',organizationId:'acme'}),
    loadRoutes:async({projectId})=>({routes:[{node:sharedNode,mapping:registry.resolveProject(projectId)}],controlReachable:true}),audit,nativeConfig
  });
  const made=await fileService.createFile({authenticatedMemberKey:member,projectId:'shared-project',runtimeNodeId:sharedId,relativePath:'shared-only.txt',content:'SHARED_ROOT\n'});
  assert.equal(readFileSync(join(approved,'shared-clone','shared-only.txt'),'utf8'),'SHARED_ROOT\n');
  await reject(()=>fileService.createFile({authenticatedMemberKey:member,projectId:'shared-project',runtimeNodeId:sharedId,relativePath:'../outside.txt',content:'NO'}),'BUSINESS_RELATIVE_PATH_INVALID');
  assert.equal(existsSync(join(approved,'outside.txt')),false);assert.equal(existsSync(join(root,'outside.txt')),false);
  symlinkSync(join(outside,'secret.txt'),join(approved,'shared-clone','secret-link'));writeFileSync(join(outside,'secret.txt'),'SECRET\n',{mode:0o600});
  await reject(()=>fileService.readFile({authenticatedMemberKey:member,projectId:'shared-project',runtimeNodeId:sharedId,relativePath:'secret-link'}),'BUSINESS_SYMLINK_DENIED');
  await fileService.deletePath({authenticatedMemberKey:member,projectId:'shared-project',runtimeNodeId:sharedId,relativePath:'shared-only.txt',expectedKind:'regular_file',expectedSha256:made.sha256});
  const branch=await gitService.createBranch({authenticatedMemberKey:member,projectId:'shared-project',runtimeNodeId:sharedId,branchName:'shared-semantic-ok'});
  assert.equal(branch.branchName,'shared-semantic-ok');
  console.log('PASS SHARED filesystem and mapped Git effects stay inside the mapped root and reject relative/symlink escape');

  const route={node:sharedNode,mapping:registry.resolveProject('shared-project')};
  assert.throws(()=>resolveBusinessRuntimeRoute({projectId:'shared-project',runtimeNodeId:sharedId,toolName:'process_start_host',routes:[route]}),/BUSINESS_SHARED_HOST_POWER_DENIED/);
  const fsRoute=resolveBusinessRuntimeRoute({projectId:'shared-project',runtimeNodeId:sharedId,toolName:'fs_create_file',routes:[route]});assert.equal(fsRoute.nodeType,'SHARED_NODE');
  sharedNode={...sharedNode,sharedHostPowerEnabled:true};
  const hostRoute=resolveBusinessRuntimeRoute({projectId:'shared-project',runtimeNodeId:sharedId,toolName:'process_start_host',routes:[{node:sharedNode,mapping:registry.resolveProject('shared-project')}]});assert.equal(hostRoute.nodeType,'SHARED_NODE');
  console.log('PASS generic SHARED host exec is denied by default and becomes eligible only after explicit host-power opt-in');

  const records=audit.verify();assert.ok(records.some(x=>x.nodeType==='SHARED_NODE'&&x.tool==='git_clone_repository'&&x.stage==='COMPLETED'));
  assert.ok(records.some(x=>x.nodeType==='SHARED_NODE'&&x.tool==='fs_create_file'&&x.stage==='COMPLETED'));
  assert.ok(records.some(x=>x.nodeType==='SHARED_NODE'&&x.tool==='git_create_branch'&&x.stage==='COMPLETED'));
  const raw=readFileSync(join(auditDir,'local-effect-audit.jsonl'),'utf8');for(const forbidden of [approved,outside,member,'SHARED_ROOT'])assert.equal(raw.includes(forbidden),false);
  console.log('PASS SHARED semantic effects remain HMAC-audited without host roots, OAuth subject, or file content');

  const moved=approved+'-moved';renameSync(approved,moved);symlinkSync(outside,approved);
  await reject(()=>rootPolicy.authorizeClone({authenticatedMemberKey:member,runtimeNodeId:sharedId,workspaceRootId:'team-root'}),'BUSINESS_WORKSPACE_ROOT_UNSAFE');
  console.log('PASS post-configuration workspace-root replacement with symlink fails closed before clone authority');

  console.log('BUSINESS_S3E1_SHARED_ROOT_POLICY=PASS');
} finally {
  rmSync(root,{recursive:true,force:true});
  console.log('test_only_fixture_cleanup=COMPLETE');
}
