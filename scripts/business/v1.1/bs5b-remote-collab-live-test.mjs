import assert from 'node:assert/strict';
import {createHash,randomBytes,randomUUID} from 'node:crypto';
import {execFileSync,spawnSync} from 'node:child_process';
import {chmodSync,existsSync,mkdirSync,mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {BusinessSemanticGitService} from './runtime/business-semantic-git-service.mjs';
import {BusinessSemanticFileService} from './runtime/business-semantic-file-service.mjs';
import {BusinessLocalEffectAudit} from './runtime/business-local-effect-audit.mjs';
import {LocalWorkspaceRegistry} from './runtime/local-workspace-registry.mjs';
import {BusinessWorkspaceRootPolicy} from './runtime/business-workspace-root-policy.mjs';
import {BusinessRuntimeMappingService} from './runtime/business-runtime-mapping-service.mjs';

if(process.env.BUSINESS_TEST_GITHUB_LIVE!=='1'){
  console.log('SKIP B-S5B live GitHub mutation unless BUSINESS_TEST_GITHUB_LIVE=1');
  process.exit(0);
}

const repoRoot=fileURLToPath(new URL('../../../',import.meta.url));
const base=dirname(repoRoot);
const root=mkdtempSync(join(base,'bs5b-live-'));chmodSync(root,0o700);
const workspace=join(root,'workspace'),auditDir=join(root,'audit');mkdirSync(workspace,{mode:0o700});mkdirSync(auditDir,{mode:0o700});
const stateDir=join(root,'state');
const repository='exobiz7/chatagent-business-v11-canary';
const repositoryUrl='https://github.com/exobiz7/chatagent-business-v11-canary.git';
const projectId='bs5b-team',workspaceRootId='bs5b-root';
const memberKey='oauth-subject-bs5b-member-b-0001';
const organizationId='chatagent-business-bs5b';
const nodeB='72000000-0000-4000-8000-000000000002';
const admin='72000000-0000-4000-8000-000000000001';
const userB='72000000-0000-4000-8000-000000000003';
const userC='72000000-0000-4000-8000-000000000004';
const suffix=randomBytes(3).toString('hex');
const branchName=`bs5b-remote-collab-20261012-${suffix}`;
const fileName=`bs5b-remote-collab-${suffix}.txt`;
const marker='bs5bremotecollab';
const cloneDir='repo';
const git='/usr/bin/git',gh=execFileSync('/usr/bin/which',['gh'],{encoding:'utf8'}).trim(),dockerBin=execFileSync('/usr/bin/which',['docker'],{encoding:'utf8'}).trim();
const nativeRoot=process.env.BUSINESS_TEST_NATIVE_HELPER_ROOT||join(process.env.HOME??'','Library/Application Support/chatagent/business-v11-bs3c2/native');
const shaFile=path=>createHash('sha256').update(readFileSync(path)).digest('hex');
const nativeConfig={
  nativeCreateBinary:join(nativeRoot,'create'),nativeCreateSha256:shaFile(join(nativeRoot,'create')),
  nativeReplaceBinary:join(nativeRoot,'replace'),nativeReplaceSha256:shaFile(join(nativeRoot,'replace')),
  nativeMkdirBinary:join(nativeRoot,'mkdir'),nativeMkdirSha256:shaFile(join(nativeRoot,'mkdir')),
  nativeMoveBinary:join(nativeRoot,'move'),nativeMoveSha256:shaFile(join(nativeRoot,'move')),
  nativeDeleteBinary:join(nativeRoot,'delete'),nativeDeleteSha256:shaFile(join(nativeRoot,'delete'))
};
const node={nodeId:nodeB,nodeName:'B Personal Git Node',nodeType:'PERSONAL_NODE',lifecycle:'APPROVED',ownedByCaller:true,sharedHostPowerEnabled:false};
const runtimeRegistry={async status(id){return id===nodeB?node:null;}};
const workspaceRegistry=new LocalWorkspaceRegistry({stateDir,nodeId:nodeB,workspaceRoots:[{workspaceRootId,path:workspace,label:'B-S5B'}],initialize:true,gitExecutable:git});
const audit=new BusinessLocalEffectAudit({stateDir:auditDir,initialize:true});
const rootPolicy=new BusinessWorkspaceRootPolicy({workspaceRegistry,runtimeRegistry,loadOrganizationId:async()=>organizationId});
const authorizeProject=async({projectId:p})=>({projectId:p,authorized:true,projectProfile:'STANDARD',organizationId});
const loadRoutes=async()=>{
  let mapping;try{mapping=workspaceRegistry.resolveProject(projectId);}catch{return {routes:[],controlReachable:true};}
  return {routes:[{node,mapping,session:null}],controlReachable:true};
};
const gitService=new BusinessSemanticGitService({authorizeProject,loadRoutes,authorizeWorkspaceClone:args=>rootPolicy.authorizeClone(args),audit,gitBinary:git,githubBinary:gh});
const fileService=new BusinessSemanticFileService({authorizeProject,loadRoutes,audit,nativeConfig});
const mappingService=new BusinessRuntimeMappingService({workspaceRegistry,runtimeRegistry,authorizeProject:async p=>({projectId:p,authorized:true})});
const routed={authenticatedMemberKey:memberKey,projectId,runtimeNodeId:nodeB};

const run=(bin,args,{cwd=repoRoot,allowFailure=false,input=null,maxBuffer=16*1024*1024}={})=>{
  const out=spawnSync(bin,args,{cwd,input,encoding:'utf8',maxBuffer,env:{...process.env,GIT_TERMINAL_PROMPT:'0'}});
  if(!allowFailure&&(out.error||out.status!==0))throw Error(String(out.stderr||out.error?.message||'COMMAND_FAILED'));
  return out;
};
const ghJson=args=>JSON.parse(run(gh,args).stdout);
const mainOid=()=>ghJson(['api',`repos/${repository}/git/ref/heads/main`]).object.sha;
const q=s=>String(s).replaceAll("'","''");
let mappingRevision=null,prNumber=null,clonePath=null,container=null;

try{
  const initialMain=mainOid();
  const existing=run(gh,['api',`repos/${repository}/git/ref/heads/${branchName}`],{allowFailure:true});
  assert.notEqual(existing.status,0,'generated B-S5B branch unexpectedly already exists');
  const protection=run(gh,['api',`repos/${repository}/branches/main/protection`]);
  const protectionJson=JSON.parse(protection.stdout);
  assert.equal(protectionJson.required_status_checks?.strict,true);
  assert.ok((protectionJson.required_status_checks?.contexts??[]).includes('provider-guard'));
  assert.ok((protectionJson.required_pull_request_reviews?.required_approving_review_count??0)>=1);
  assert.equal(protectionJson.enforce_admins?.enabled,true);
  assert.equal(protectionJson.allow_force_pushes?.enabled,false);
  assert.equal(protectionJson.allow_deletions?.enabled,false);
  console.log('PASS provider main enforces public-repository required CI/review/admin protection without force/delete bypass');

  const cloned=await gitService.cloneRepository({authenticatedMemberKey:memberKey,runtimeNodeId:nodeB,workspaceRootId,repositoryUrl,directoryName:cloneDir});
  assert.equal(cloned.cloned,true);clonePath=join(workspace,cloneDir);
  assert.equal(workspaceRegistry.listMappings().length,0,'clone must not create hidden project mapping');
  const mapped=await mappingService.mapProject({projectId,runtimeNodeId:nodeB,workspaceRootId,workspaceRelativePath:cloneDir,expectedGitRemoteUrl:repositoryUrl,operationId:randomUUID()});
  mappingRevision=mapped.mappingRevision;
  const initial=await gitService.getStatus({...routed,maxEntries:50});assert.equal(initial.branch,'main');assert.deepEqual(initial.entries,[]);
  await gitService.fetchRemote({...routed,remoteName:'origin'});
  const pulled=await gitService.pullFfOnly(routed);assert.equal(pulled.commitOid,initialMain);
  console.log('PASS participant B PERSONAL_NODE semantic clone/map/fetch/ff-only-pull uses the real governed GitHub remote');

  await gitService.createBranch({...routed,branchName});await gitService.switchBranch({...routed,branchName});
  const created=await fileService.createFile({...routed,relativePath:fileName,content:`BS5B_REMOTE_COLLAB_OK ${suffix}\n`});
  assert.match(created.sha256,/^[a-f0-9]{64}$/);
  const staged=await gitService.stageFiles({...routed,paths:[fileName]});assert.match(staged.stagedDiffSha256,/^[a-f0-9]{64}$/);
  const committed=await gitService.createCommit({...routed,message:'test: B-S5B remote collaboration canary',expectedStagedDiffSha256:staged.stagedDiffSha256});
  await gitService.fetchRemote({...routed,remoteName:'origin'});
  const pushed=await gitService.pushBranch({...routed,branchName,remoteName:'origin'});assert.equal(pushed.commitOid,committed.commitOid);
  const pr=await gitService.createPullRequest({...routed,title:'B-S5B Remote Collaboration Canary',body:'Disposable B-S5B remote collaboration canary; no merge requested.',baseBranch:'main',headBranch:branchName,draft:true});
  prNumber=Number(new URL(pr.url).pathname.split('/').at(-1));assert.ok(Number.isSafeInteger(prNumber)&&prNumber>0);
  const providerPr=ghJson(['pr','view',String(prNumber),'--repo',repository,'--json','number,state,isDraft,headRefName,baseRefName,url,commits,files,mergeStateStatus']);
  assert.equal(providerPr.state,'OPEN');assert.equal(providerPr.isDraft,true);assert.equal(providerPr.headRefName,branchName);assert.equal(providerPr.baseRefName,'main');
  assert.equal(providerPr.commits.at(-1).oid,committed.commitOid);assert.deepEqual(providerPr.files.map(x=>x.path),[fileName]);
  assert.equal(mainOid(),initialMain,'semantic feature publication must not modify main');
  const remoteBranch=ghJson(['api',`repos/${repository}/git/ref/heads/${branchName}`]);assert.equal(remoteBranch.object.sha,committed.commitOid);
  const clean=await gitService.getStatus({...routed,maxEntries:50});assert.deepEqual(clean.entries,[]);
  console.log('PASS semantic edit/stage/commit/non-force-push/Draft-PR reaches GitHub while main remains unchanged');

  container='chatagent-business-bs5b-pg16-'+process.pid;
  const docker=(args,{input=null,allowFailure=false}={})=>run(dockerBin,args,{input,allowFailure,maxBuffer:24*1024*1024});
  docker(['run','-d','--name',container,'-e','POSTGRES_PASSWORD=postgres','-e','POSTGRES_DB=postgres','postgres:16-alpine']);
  const psql=(sql,{allowFailure=false}={})=>docker(['exec','-i',container,'psql','-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-U','postgres','-d','postgres'],{input:sql,allowFailure});
  let ready=false,stable=0;for(let i=0;i<80;i++){const p=docker(['exec',container,'pg_isready','-U','postgres'],{allowFailure:true});const s=p.status===0?psql('select 1;',{allowFailure:true}):null;stable=p.status===0&&s?.status===0?stable+1:0;if(stable>=3){ready=true;break;}Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,150);}assert.equal(ready,true);
  const fixture=`create role anon nologin;create role authenticated nologin;create schema auth;create table auth.users(id uuid primary key,email text,confirmed_at timestamptz,is_anonymous boolean not null default false,raw_user_meta_data jsonb not null default '{}'::jsonb);create or replace function auth.jwt() returns jsonb language sql stable set search_path='' as $$ select coalesce(nullif(pg_catalog.current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;create or replace function auth.uid() returns uuid language sql stable set search_path='' as $$ select nullif(auth.jwt()->>'sub','')::uuid $$;create schema extensions;`;
  psql(fixture);
  const migrations=['20261007161000_business_v11_bs1_control_foundation.sql','20261007162500_business_v11_bs1_control_fk_indexes.sql','20261007170000_business_v11_bs1_member_identity.sql'];
  for(const f of migrations)psql(readFileSync(join(repoRoot,'supabase/migrations',f),'utf8'));
  psql(`insert into auth.users(id,email,confirmed_at) values('${admin}','admin@example.test',now());`);
  psql(readFileSync(join(repoRoot,'scripts/business/v1.1/control/bs1b-bootstrap-single-admin-staging.sql'),'utf8'));
  psql(`insert into auth.users(id,email,confirmed_at) values('${userB}','b@example.test',now()),('${userC}','c@example.test',now());insert into private_business_control.organization_members(organization_id,user_id,role,member_state) select id,'${userB}','MEMBER','ACTIVE' from private_business_control.organizations;insert into private_business_control.organization_members(organization_id,user_id,role,member_state) select id,'${userC}','MEMBER','ACTIVE' from private_business_control.organizations;`);
  for(const f of ['20261007190000_business_v11_bs1_runtime_node_lifecycle.sql','20261007230000_business_v11_bs2_project_policy_prereqs.sql','20261007231500_business_v11_bs2_continuity_foundation.sql','20261007232500_business_v11_bs2_continuity_fk_indexes.sql','20261007234500_business_v11_bs2_completion_context_search.sql','20261008003000_business_v11_bs2_handoff_export.sql','20261008004500_business_v11_bs2_project_key_rpc_adapters.sql','20261008005500_business_v11_bs2_public_rpc_surface_lockdown.sql'])psql(readFileSync(join(repoRoot,'supabase/migrations',f),'utf8'));
  const claims=u=>`set request.jwt.claims='{"sub":"${u}"}'; set role authenticated;\n`;
  const auth=(u,sql)=>psql(claims(u)+sql);
  const last=o=>String(o.stdout).trim().split(/\r?\n/).filter(Boolean).at(-1)??'';
  const json=o=>JSON.parse(last(o));
  json(auth(userB,`select public.bc_runtime_enroll('${nodeB}','B Personal Git Node','PERSONAL_NODE','${randomUUID()}',false,false);`));
  json(auth(admin,`select public.bc_runtime_enroll('${nodeB}','B Personal Git Node','PERSONAL_NODE','${randomUUID()}',true,false);`));
  json(auth(admin,`select public.bc_project_register('${projectId}','B-S5B Team','${randomUUID()}','STANDARD','TEAM');`));
  const task=json(auth(userB,`select public.bc_task_start('${projectId}','Remote collaboration GitHub workflow','${randomUUID()}',null,array['git','remote']);`));
  const checkpoint=json(auth(userB,`select public.bc_checkpoint_append('${projectId}','${task.taskId}',0,'B remote collaboration published','${q(pr.url)}','${randomUUID()}',array['C verify latest context'],'provider PR ${prNumber}',array['non-force push'],array['${marker}'],array['${q(pr.url)}'],'${nodeB}');`));
  assert.equal(checkpoint.revision,1);
  const cView=json(auth(userC,`select public.bc_task_get('${projectId}','${task.taskId}');`));assert.equal(cView.task.revision,1);
  const cSearch=json(auth(userC,`select public.bc_history_search('${projectId}','${marker}',10);`));assert.ok(cSearch.matches.some(x=>x.taskId===task.taskId));
  console.log('PASS B appends the real provider PR as TEAM checkpoint and C sees/searches the latest continuity');

  const records=audit.verify();
  assert.ok(records.some(x=>x.tool==='git_clone_repository'&&x.stage==='COMPLETED'));
  assert.ok(records.some(x=>x.tool==='fs_create_file'&&x.stage==='COMPLETED'));
  assert.ok(records.some(x=>x.tool==='git_push_branch'&&x.stage==='COMPLETED'));
  assert.ok(records.some(x=>x.tool==='github_create_pull_request'&&x.stage==='COMPLETED'));
  const rawAudit=readFileSync(join(auditDir,'local-effect-audit.jsonl'),'utf8');assert.ok(!rawAudit.includes(repositoryUrl));assert.ok(!rawAudit.includes(memberKey));assert.ok(!rawAudit.includes(root));
  console.log('PASS local effect audit verifies remote collaboration effects without remote URL, OAuth subject or host-root disclosure');
  console.log(`B_S5B_LIVE_PR=${pr.url}`);
  console.log(`B_S5B_BRANCH=${branchName}`);
  console.log(`B_S5B_COMMIT=${committed.commitOid}`);
  console.log('B_S5B_PROVIDER_PROTECTION=ENFORCED_PUBLIC_REPO');
  console.log('BUSINESS_S5B_REMOTE_COLLAB_LIVE=PASS');
} finally {
  if(container)run(dockerBin,['rm','-f',container],{allowFailure:true});
  if(prNumber)run(gh,['pr','close',String(prNumber),'--repo',repository],{allowFailure:true});
  if(clonePath&&existsSync(clonePath))run(git,['-C',clonePath,'push','origin','--delete',branchName],{allowFailure:true});
  if(mappingRevision!==null){try{await mappingService.unmapProject({projectId,runtimeNodeId:nodeB,expectedMappingRevision:mappingRevision,operationId:randomUUID()});}catch{}}
  rmSync(root,{recursive:true,force:true});
  console.log('test_only_fixture_cleanup=COMPLETE');
}
