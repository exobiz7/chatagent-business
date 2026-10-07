import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const repo=fileURLToPath(new URL('../../../',import.meta.url));
const paths=[
  'supabase/migrations/20261007161000_business_v11_bs1_control_foundation.sql',
  'supabase/migrations/20261007162500_business_v11_bs1_control_fk_indexes.sql',
  'supabase/migrations/20261007170000_business_v11_bs1_member_identity.sql',
  'supabase/migrations/20261007190000_business_v11_bs1_runtime_node_lifecycle.sql',
  'supabase/migrations/20261007230000_business_v11_bs2_project_policy_prereqs.sql',
  'supabase/migrations/20261007231500_business_v11_bs2_continuity_foundation.sql',
  'supabase/migrations/20261007232500_business_v11_bs2_continuity_fk_indexes.sql',
  'supabase/migrations/20261007234500_business_v11_bs2_completion_context_search.sql'
];
const sqlFiles=paths.map(x=>readFileSync(repo+'/'+x,'utf8'));
const bootstrap=readFileSync(repo+'/scripts/business/v1.1/control/bs1b-bootstrap-single-admin-staging.sql','utf8');
const container='chatagent-business-bs2b-pg16-'+process.pid;
const admin='51000000-0000-4000-8000-000000000001';
const member='51000000-0000-4000-8000-000000000002';
const outsider='51000000-0000-4000-8000-000000000003';

const run=(args,{input=null,allowFailure=false}={})=>{
  const out=spawnSync('docker',args,{input,encoding:'utf8',maxBuffer:8*1024*1024});
  if(!allowFailure&&(out.error||out.status!==0))throw Error(String(out.stderr||out.error?.message||'DOCKER_TEST_FAILED'));
  return out;
};
const psql=(sql,{allowFailure=false}={})=>run(['exec','-i',container,'psql','-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-U','postgres','-d','postgres'],{input:sql,allowFailure});
const claims=user=>`set request.jwt.claims='{"sub":"${user}"}'; set role authenticated;\n`;
const authSql=(user,sql,opts={})=>psql(claims(user)+sql,opts);
const line=out=>String(out.stdout).trim().split(/\r?\n/).filter(Boolean).at(-1)??'';
const json=out=>JSON.parse(line(out));
const fail=(out,pattern,label)=>{assert.notEqual(out.status,0,label);assert.match(String(out.stderr),pattern,label);};

const fixture=`
create role anon nologin;
create role authenticated nologin;
create schema auth;
create table auth.users(id uuid primary key,email text,confirmed_at timestamptz,is_anonymous boolean not null default false,raw_user_meta_data jsonb not null default '{}'::jsonb);
create or replace function auth.jwt() returns jsonb language sql stable set search_path='' as $$
 select coalesce(nullif(pg_catalog.current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;
create or replace function auth.uid() returns uuid language sql stable set search_path='' as $$
 select nullif(auth.jwt()->>'sub','')::uuid $$;
create schema extensions;
`;

const dockerReady=run(['version','--format','{{.Server.Version}}'],{allowFailure:true});
if(dockerReady.error||dockerReady.status!==0)throw Error('BUSINESS_S2B_POSTGRES16_INTEGRATION_REQUIRES_DOCKER');

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
  psql(fixture);
  for(const sql of sqlFiles.slice(0,3))psql(sql);
  psql(`insert into auth.users(id,email,confirmed_at) values('${admin}','admin@example.test',now());`);
  psql(bootstrap);
  psql(`insert into auth.users(id,email,confirmed_at) values('${member}','member@example.test',now()),('${outsider}','outsider@example.test',now());
    insert into private_business_control.organization_members(organization_id,user_id,role,member_state)
      select id,'${member}','MEMBER','ACTIVE' from private_business_control.organizations;
    insert into private_business_control.organization_members(organization_id,user_id,role,member_state)
      select id,'${outsider}','MEMBER','ACTIVE' from private_business_control.organizations;`);
  for(const sql of sqlFiles.slice(3,7))psql(sql);

  const team=json(authSql(admin,`select public.bc_project_register('search-team','Search Team','${randomUUID()}');`));
  const priv=json(authSql(admin,`select public.bc_project_register('search-private','Search Private','${randomUUID()}','SAFE','PRIVATE');`));
  authSql(admin,`select public.bc_private_member_add('${priv.projectId}','${member}','${randomUUID()}');`);

  const legacy=json(authSql(member,`select public.bc_task_start('${team.projectId}','Legacy preindex objective','${randomUUID()}');`));
  authSql(member,`select public.bc_checkpoint_append('${team.projectId}','${legacy.taskId}',0,'Legacy checkpoint','preindexlegacy corpus survives backfill','${randomUUID()}',array['retain historical search'],'legacy PASS',array['backfill decision'],array['legacy fact'],array['docs/legacy'],null);`);

  psql(sqlFiles[7]);
  const ginCount=Number(line(psql(`select count(*) from pg_indexes where schemaname='private_business_continuity' and indexname in ('continuity_tasks_search_fts_idx','continuity_checkpoints_search_fts_idx');`)));
  assert.equal(ginCount,2);
  const legacySearch=json(authSql(outsider,`select public.bc_history_search('${team.projectId}','preindexlegacy',10);`));
  assert.equal(legacySearch.matches.length,1,'B-S2A rows must be backfilled into FTS corpus');
  assert.equal(legacySearch.matches[0].matchKind,'CHECKPOINT');

  const active=json(authSql(member,`select public.bc_task_start('${team.projectId}','Orionledger release planning','${randomUUID()}',null,array['launch','priority']);`));
  const cp=json(authSql(member,`select public.bc_checkpoint_append('${team.projectId}','${active.taskId}',0,'Architecture lock','Search pipeline ready','${randomUUID()}',array['ship index'],'CI green',array['vectorless accepted'],array['postgres corpus'],array['docs/search-spec'],null);`));
  assert.equal(cp.revision,1);

  const taskMatch=json(authSql(outsider,`select public.bc_history_search('${team.projectId}','orionledger',10);`));
  assert.equal(taskMatch.matches[0].matchKind,'TASK');
  assert.equal(taskMatch.matches[0].taskId,active.taskId);
  const decisionMatch=json(authSql(outsider,`select public.bc_history_search('${team.projectId}','vectorless',10);`));
  assert.equal(decisionMatch.matches[0].matchKind,'CHECKPOINT','decisions/facts/artifacts must participate in FTS corpus');
  assert.equal(decisionMatch.matches[0].checkpointId,cp.checkpointId);

  const privateTask=json(authSql(member,`select public.bc_task_start('${priv.projectId}','Mercuryprivate negotiation history','${randomUUID()}');`));
  authSql(member,`select public.bc_checkpoint_append('${priv.projectId}','${privateTask.taskId}',0,'Private terms','mercuryprivate only','${randomUUID()}');`);
  fail(authSql(outsider,`select public.bc_history_search('${priv.projectId}','mercuryprivate',10);`,{allowFailure:true}),/BUSINESS_PRIVATE_PROJECT_DENIED/,'PRIVATE history search must fail for non-member');
  fail(authSql(outsider,`select public.bc_project_context('${priv.projectId}',10);`,{allowFailure:true}),/BUSINESS_PRIVATE_PROJECT_DENIED/,'PRIVATE project context must fail for non-member');
  assert.ok(json(authSql(member,`select public.bc_history_search('${priv.projectId}','mercuryprivate',10);`)).matches.length>=1);

  const completeOp=randomUUID();
  const completed=json(authSql(member,`select public.bc_task_complete('${team.projectId}','${active.taskId}',1,'${completeOp}');`));
  assert.equal(completed.status,'COMPLETED'); assert.equal(completed.revision,2);
  assert.deepEqual(json(authSql(member,`select public.bc_task_complete('${team.projectId}','${active.taskId}',1,'${completeOp}');`)),completed,'same completion operation must replay prior receipt');
  fail(authSql(member,`select public.bc_task_complete('${team.projectId}','${active.taskId}',2,'${completeOp}');`,{allowFailure:true}),/BUSINESS_IDEMPOTENCY_CONFLICT/,'changed completion replay must conflict');
  fail(authSql(member,`select public.bc_checkpoint_append('${team.projectId}','${active.taskId}',2,'Late write','must fail','${randomUUID()}');`,{allowFailure:true}),/BUSINESS_TASK_COMPLETED/,'completed task must be immutable');
  fail(authSql(member,`select public.bc_task_complete('${team.projectId}','${active.taskId}',2,'${randomUUID()}');`,{allowFailure:true}),/BUSINESS_TASK_COMPLETED/,'new completion after terminal state must fail');

  const stillActive=json(authSql(member,`select public.bc_task_start('${team.projectId}','Current active followup','${randomUUID()}');`));
  const context=json(authSql(outsider,`select public.bc_project_context('${team.projectId}',2);`));
  assert.equal(context.tasks.length,2);
  assert.equal(context.tasks[0].taskId,stillActive.taskId,'active task must be prioritized in bounded context');
  assert.equal(context.tasks[0].status,'ACTIVE');
  assert.ok(context.contextSeq>=7);
  fail(authSql(member,`select public.bc_project_context('${team.projectId}',21);`,{allowFailure:true}),/BUSINESS_CONTINUITY_INPUT_INVALID/,'project context hard task limit');
  fail(authSql(member,`select public.bc_history_search('${team.projectId}','orionledger',21);`,{allowFailure:true}),/BUSINESS_CONTINUITY_INPUT_INVALID/,'history search hard result limit');
  fail(psql(`set role anon; select public.bc_history_search('${team.projectId}','orionledger',10);`,{allowFailure:true}),/permission denied.*bc_history_search/i,'anon history search denied');

  const completedStillSearchable=json(authSql(outsider,`select public.bc_history_search('${team.projectId}','orionledger',10);`));
  assert.ok(completedStillSearchable.matches.some(x=>x.taskId===active.taskId),'completed history must remain searchable');
  const taskState=json(authSql(member,`select public.bc_task_get('${team.projectId}','${active.taskId}');`));
  assert.equal(taskState.task.status,'COMPLETED'); assert.equal(taskState.task.revision,2);

  console.log('PASS PostgreSQL16 B-S2B migration backfills and indexes pre-existing continuity rows');
  console.log('PASS TEAM history search is broad to active organization members while PRIVATE context/search requires explicit membership');
  console.log('PASS FTS covers objective, checkpoint state, decisions/facts/artifacts and completed history remains searchable');
  console.log('PASS completion is idempotent, revision-CAS protected and terminally immutable');
  console.log('PASS project context and history search enforce bounded 1..20 result contracts');
  console.log('BUSINESS_S2B_CONTINUITY_POSTGRES=PASS');
} finally {
  run(['rm','-f',container],{allowFailure:true});
}
