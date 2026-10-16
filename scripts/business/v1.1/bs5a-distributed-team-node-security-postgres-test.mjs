import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {spawn,spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {assembleBusinessHandoff,applyBusinessFreshness} from './continuity/business-handoff-context.mjs';
import {BusinessProjectAuthorizationCache} from './runtime/business-project-authorization-cache.mjs';
import {resolveBusinessRuntimeRoute} from './runtime/business-runtime-router.mjs';

const repo=fileURLToPath(new URL('../../../',import.meta.url));
const migrations=[
  'supabase/migrations/20261007161000_business_v11_bs1_control_foundation.sql',
  'supabase/migrations/20261007162500_business_v11_bs1_control_fk_indexes.sql',
  'supabase/migrations/20261007170000_business_v11_bs1_member_identity.sql',
  'supabase/migrations/20261007190000_business_v11_bs1_runtime_node_lifecycle.sql',
  'supabase/migrations/20261007230000_business_v11_bs2_project_policy_prereqs.sql',
  'supabase/migrations/20261007231500_business_v11_bs2_continuity_foundation.sql',
  'supabase/migrations/20261007232500_business_v11_bs2_continuity_fk_indexes.sql',
  'supabase/migrations/20261007234500_business_v11_bs2_completion_context_search.sql',
  'supabase/migrations/20261008003000_business_v11_bs2_handoff_export.sql',
  'supabase/migrations/20261008004500_business_v11_bs2_project_key_rpc_adapters.sql',
  'supabase/migrations/20261008005500_business_v11_bs2_public_rpc_surface_lockdown.sql'
].map(path=>readFileSync(repo+'/'+path,'utf8'));
const bootstrap=readFileSync(repo+'/scripts/business/v1.1/control/bs1b-bootstrap-single-admin-staging.sql','utf8');
const container='chatagent-business-bs5a-pg16-'+process.pid;
const org='chatagent-business-v11-bs0';
const a='61000000-0000-4000-8000-000000000001';
const b='61000000-0000-4000-8000-000000000002';
const c='61000000-0000-4000-8000-000000000003';
const nodeA='62000000-0000-4000-8000-000000000001';
const nodeB='62000000-0000-4000-8000-000000000002';
const nodeC='62000000-0000-4000-8000-000000000003';
const nodeB2='62000000-0000-4000-8000-000000000004';

const run=(args,{input=null,allowFailure=false}={})=>{
  const out=spawnSync('docker',args,{input,encoding:'utf8',maxBuffer:16*1024*1024});
  if(!allowFailure&&(out.error||out.status!==0))throw Error(String(out.stderr||out.error?.message||'DOCKER_TEST_FAILED'));
  return out;
};
const runAsync=(args,input)=>new Promise((resolve,reject)=>{
  const child=spawn('docker',args,{stdio:['pipe','pipe','pipe']});let stdout='',stderr='';
  child.stdout.setEncoding('utf8');child.stderr.setEncoding('utf8');child.stdout.on('data',x=>stdout+=x);child.stderr.on('data',x=>stderr+=x);
  child.on('error',reject);child.on('close',status=>resolve({status,stdout,stderr}));child.stdin.end(input);
});
const psqlArgs=['exec','-i',container,'psql','-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-U','postgres','-d','postgres'];
const psql=(sql,opts={})=>run(psqlArgs,{input:sql,...opts});
const claims=user=>`set request.jwt.claims='{"sub":"${user}"}'; set role authenticated;\n`;
const authSql=(user,sql,opts={})=>psql(claims(user)+sql,opts);
const authSqlAsync=(user,sql)=>runAsync(psqlArgs,claims(user)+sql);
const line=out=>String(out.stdout).trim().split(/\r?\n/).filter(Boolean).at(-1)??'';
const json=out=>JSON.parse(line(out));
const expectFailure=(out,pattern,label)=>{assert.notEqual(out.status,0,label);assert.match(String(out.stderr),pattern,label);};
const fixture=`
create role anon nologin;
create role authenticated nologin;
create schema auth;
create table auth.users(id uuid primary key,email text,confirmed_at timestamptz,is_anonymous boolean not null default false,raw_user_meta_data jsonb not null default '{}'::jsonb);
create or replace function auth.jwt() returns jsonb language sql stable set search_path='' as $$ select coalesce(nullif(pg_catalog.current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;
create or replace function auth.uid() returns uuid language sql stable set search_path='' as $$ select nullif(auth.jwt()->>'sub','')::uuid $$;
create schema extensions;
`;
const enroll=(user,nodeId,name,nodeType,approve=false,opts={})=>authSql(user,`select public.bc_runtime_enroll('${nodeId}','${name}','${nodeType}','${randomUUID()}',${approve?'true':'false'},false);`,opts);
const mapping=(projectId,nodeId,revision,path)=>({projectId,runtimeNodeId:nodeId,workspaceRootId:'bs5a',workspaceRelativePath:nodeId.slice(-4),mappingRevision:revision,canonicalPath:path});
const routeEntry=(status,projectId,revision,path)=>({node:status,mapping:mapping(projectId,status.nodeId,revision,path),session:status.leaseExpiresAt?{sessionState:'ACTIVE',leaseExpiresAt:status.leaseExpiresAt}:null});

const dockerReady=run(['version','--format','{{.Server.Version}}'],{allowFailure:true});
if(dockerReady.error||dockerReady.status!==0)throw Error('BUSINESS_S5A_POSTGRES16_REQUIRES_DOCKER');
try{
  run(['run','-d','--name',container,'-e','POSTGRES_PASSWORD=postgres','-e','POSTGRES_DB=postgres','postgres:16-alpine']);
  let ready=false,consecutive=0;
  for(let i=0;i<80;i++){
    const probe=run(['exec',container,'pg_isready','-U','postgres'],{allowFailure:true});
    const sqlProbe=probe.status===0?psql('select 1;',{allowFailure:true}):null;
    consecutive=probe.status===0&&sqlProbe?.status===0?consecutive+1:0;
    if(consecutive>=3){ready=true;break;}
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,200);
  }
  assert.equal(ready,true,'PostgreSQL 16 fixture did not become stably ready');
  psql(fixture);for(const sql of migrations.slice(0,3))psql(sql);
  psql(`insert into auth.users(id,email,confirmed_at) values('${a}','a@example.test',now());`);psql(bootstrap);
  psql(`insert into auth.users(id,email,confirmed_at) values('${b}','b@example.test',now()),('${c}','c@example.test',now());
    insert into private_business_control.organization_members(organization_id,user_id,role,member_state) select id,'${b}','MEMBER','ACTIVE' from private_business_control.organizations;
    insert into private_business_control.organization_members(organization_id,user_id,role,member_state) select id,'${c}','MEMBER','ACTIVE' from private_business_control.organizations;`);
  for(const sql of migrations.slice(3))psql(sql);

  assert.equal(json(enroll(a,nodeA,'A Shared Mac Studio','SHARED_NODE')).lifecycle,'PENDING');
  assert.equal(json(enroll(a,nodeA,'A Shared Mac Studio','SHARED_NODE',true)).lifecycle,'APPROVED');
  assert.equal(json(enroll(b,nodeB,'B Personal MacBook','PERSONAL_NODE')).lifecycle,'PENDING');
  assert.equal(json(enroll(a,nodeB,'B Personal MacBook','PERSONAL_NODE',true)).lifecycle,'APPROVED');
  assert.equal(json(enroll(c,nodeC,'C Personal MacBook','PERSONAL_NODE')).lifecycle,'PENDING');
  assert.equal(json(enroll(a,nodeC,'C Personal MacBook','PERSONAL_NODE',true)).lifecycle,'APPROVED');
  const listB=json(authSql(b,'select public.bc_runtime_list();')),listC=json(authSql(c,'select public.bc_runtime_list();'));
  assert.deepEqual(new Set(listB.nodes.map(x=>x.nodeId)),new Set([nodeA,nodeB]));
  assert.deepEqual(new Set(listC.nodes.map(x=>x.nodeId)),new Set([nodeA,nodeC]));
  expectFailure(authSql(c,`select public.bc_runtime_status('${nodeB}');`,{allowFailure:true}),/BUSINESS_RUNTIME_NODE_DENIED/,'C must not inspect B PERSONAL_NODE');
  console.log('PASS three logical participants expose one SHARED_NODE plus only the caller-owned PERSONAL_NODE');

  const team=json(authSql(a,`select public.bc_project_register('bs5-team','B-S5 TEAM','${randomUUID()}','STANDARD','TEAM');`));
  const task=json(authSql(a,`select public.bc_task_start('bs5-team','Distributed TEAM continuity marker-alpha','${randomUUID()}',null,array['bs5','team']);`));
  const cpA=json(authSql(a,`select public.bc_checkpoint_append('bs5-team','${task.taskId}',0,'A shared checkpoint','A created TEAM state on shared node','${randomUUID()}',array['B opens context'],'A PASS',array['shared authority'],array['marker-alpha'],array['docs/bs5a'],'${nodeA}');`));
  assert.equal(cpA.revision,1);
  const aInitial=json(authSql(a,`select public.bc_task_get('bs5-team','${task.taskId}');`));
  const oldHandoff=assembleBusinessHandoff({organizationId:org,taskResult:aInitial});
  assert.match(oldHandoff.contextDigest,/^sha256:[a-f0-9]{64}$/);

  const bContext=json(authSql(b,`select public.bc_project_context('bs5-team',10);`));
  assert.ok(bContext.tasks.some(x=>x.taskId===task.taskId));
  const bSearch=json(authSql(b,`select public.bc_history_search('bs5-team','marker-alpha',10);`));
  assert.ok(bSearch.matches.some(x=>x.taskId===task.taskId));
  const cpB=json(authSql(b,`select public.bc_checkpoint_append('bs5-team','${task.taskId}',1,'B personal checkpoint','B continued TEAM state','${randomUUID()}',array['C opens context'],'B PASS',array['B decision'],array['marker-beta'],array['docs/bs5a-b'],'${nodeB}');`));
  assert.equal(cpB.revision,2);
  const cView=json(authSql(c,`select public.bc_task_get('bs5-team','${task.taskId}');`));
  assert.equal(cView.task.revision,2);
  assert.equal(line(psql(`select source_runtime_node_id from private_business_continuity.checkpoints where id='${cpB.checkpointId}';`)),nodeB);
  assert.ok(json(authSql(c,`select public.bc_history_search('bs5-team','marker-beta',10);`)).matches.length>=1);
  console.log('PASS A→B→C TEAM continuity/context/search crosses SHARED and distinct PERSONAL node identities');

  const opB=randomUUID(),opC=randomUUID();
  const [raceB,raceC]=await Promise.all([
    authSqlAsync(b,`select public.bc_checkpoint_append('bs5-team','${task.taskId}',2,'B race checkpoint','B same revision race','${opB}',array['continue'],'B race',array[]::text[],array['race-b'],array[]::text[],'${nodeB}');`),
    authSqlAsync(c,`select public.bc_checkpoint_append('bs5-team','${task.taskId}',2,'C race checkpoint','C same revision race','${opC}',array['continue'],'C race',array[]::text[],array['race-c'],array[]::text[],'${nodeC}');`)
  ]);
  const race=[raceB,raceC],wins=race.filter(x=>x.status===0),losses=race.filter(x=>x.status!==0);
  assert.equal(wins.length,1);assert.equal(losses.length,1);assert.match(losses[0].stderr,/BUSINESS_REVISION_CONFLICT/);
  const winner=json(wins[0]);assert.equal(winner.revision,3);
  const finalTask=json(authSql(c,`select public.bc_task_get('bs5-team','${task.taskId}');`));
  assert.equal(finalTask.task.revision,3);assert.equal(finalTask.checkpoints.length,3);
  const currentHandoff=assembleBusinessHandoff({organizationId:org,taskResult:finalTask});
  const stale=applyBusinessFreshness(currentHandoff,oldHandoff.contextDigest);
  assert.equal(stale.freshness,'STALE');assert.equal(stale.freshnessReason,'TASK_STATE_CHANGED');
  console.log('PASS true parallel same-revision checkpoint race yields exactly one commit + one revision conflict; A old digest becomes STALE');

  const bStatus=json(authSql(b,`select public.bc_runtime_status('${nodeB}');`));
  const bRoute=resolveBusinessRuntimeRoute({projectId:'bs5-team',runtimeNodeId:nodeB,toolName:'process_start_host',routes:[routeEntry(bStatus,'bs5-team',1,'/fixture/b')],controlReachable:true});
  assert.equal(bRoute.nodeId,nodeB);assert.equal(bRoute.authorizationSource,'CONTROL_PLANE');
  const cViewOfB={...bStatus,ownedByCaller:false};
  assert.throws(()=>resolveBusinessRuntimeRoute({projectId:'bs5-team',runtimeNodeId:nodeB,toolName:'process_start_host',routes:[routeEntry(cViewOfB,'bs5-team',1,'/fixture/b')],controlReachable:true}),/BUSINESS_PERSONAL_NODE_OWNER_MISMATCH/);

  const revoked=json(authSql(a,`select public.bc_runtime_revoke('${nodeB}','${randomUUID()}');`));assert.equal(revoked.lifecycle,'REVOKED');
  const revokedStatus=json(authSql(b,`select public.bc_runtime_status('${nodeB}');`));assert.equal(revokedStatus.lifecycle,'REVOKED');
  assert.throws(()=>resolveBusinessRuntimeRoute({projectId:'bs5-team',runtimeNodeId:nodeB,toolName:'process_start_host',routes:[routeEntry(revokedStatus,'bs5-team',1,'/fixture/b')],controlReachable:true}),/BUSINESS_RUNTIME_NODE_REVOKED/);
  expectFailure(enroll(b,nodeB,'B Personal MacBook','PERSONAL_NODE',false,{allowFailure:true}),/BUSINESS_RUNTIME_NODE_REVOKED/,'revoked node ID is terminal');
  assert.equal(json(enroll(b,nodeB2,'B Replacement MacBook','PERSONAL_NODE')).lifecycle,'PENDING');
  assert.equal(json(enroll(a,nodeB2,'B Replacement MacBook','PERSONAL_NODE',true)).lifecycle,'APPROVED');
  const replacement=json(authSql(b,`select public.bc_runtime_status('${nodeB2}');`));assert.equal(replacement.lifecycle,'APPROVED');assert.equal(replacement.ownedByCaller,true);
  assert.equal(resolveBusinessRuntimeRoute({projectId:'bs5-team',runtimeNodeId:nodeB2,toolName:'process_start_host',routes:[routeEntry(replacement,'bs5-team',2,'/fixture/b2')],controlReachable:true}).nodeId,nodeB2);
  console.log('PASS PERSONAL_NODE cross-member routing is denied; revoke blocks new work and replacement enrollment restores bounded owner authority');

  let backendUp=true,now=1_000_000;
  const authCache=new BusinessProjectAuthorizationCache({ttlMs:60_000,now:()=>now,loadFresh:async({authenticatedMemberKey,projectId})=>{
    if(!backendUp)throw Error('BUSINESS_BACKEND_UNAVAILABLE');
    assert.equal(authenticatedMemberKey,'member-b');assert.equal(projectId,'bs5-team');
    return {projectId,authorized:true,projectProfile:'STANDARD',organizationId:org};
  }});
  assert.equal((await authCache.authorize({authenticatedMemberKey:'member-b',projectId:'bs5-team'})).authorizationSource,'CONTROL_PLANE');
  backendUp=false;now+=30_000;
  assert.equal((await authCache.authorize({authenticatedMemberKey:'member-b',projectId:'bs5-team'})).authorizationSource,'CACHED_LEASE');
  now+=31_000;
  await assert.rejects(()=>authCache.authorize({authenticatedMemberKey:'member-b',projectId:'bs5-team'}),/BUSINESS_PROJECT_AUTH_LEASE_EXPIRED/);
  console.log('PASS B-S4 bounded degraded project-authority primitive composes with B-S5 participant identity and expires fail-closed');

  console.log('BUSINESS_S5A_DISTRIBUTED_TEAM_NODE_SECURITY=PASS');
} finally {
  run(['rm','-f',container],{allowFailure:true});
  console.log('test_only_fixture_cleanup=COMPLETE');
}
