import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {spawn,spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const repo=fileURLToPath(new URL('../../../',import.meta.url));
const sqlFiles=[
  'supabase/migrations/20261007161000_business_v11_bs1_control_foundation.sql',
  'supabase/migrations/20261007162500_business_v11_bs1_control_fk_indexes.sql',
  'supabase/migrations/20261007170000_business_v11_bs1_member_identity.sql',
  'supabase/migrations/20261007190000_business_v11_bs1_runtime_node_lifecycle.sql',
  'supabase/migrations/20261007230000_business_v11_bs2_project_policy_prereqs.sql',
  'supabase/migrations/20261007231500_business_v11_bs2_continuity_foundation.sql',
  'supabase/migrations/20261007232500_business_v11_bs2_continuity_fk_indexes.sql'
].map(x=>readFileSync(repo+'/'+x,'utf8'));
const bootstrap=readFileSync(repo+'/scripts/business/v1.1/control/bs1b-bootstrap-single-admin-staging.sql','utf8');
const container='chatagent-business-bs2a-pg16-'+process.pid;
const admin='50000000-0000-4000-8000-000000000001';
const member='50000000-0000-4000-8000-000000000002';
const outsider='50000000-0000-4000-8000-000000000003';

const run=(args,{input=null,allowFailure=false}={})=>{
  const out=spawnSync('docker',args,{input,encoding:'utf8',maxBuffer:6*1024*1024});
  if(!allowFailure&&(out.error||out.status!==0))throw Error(String(out.stderr||out.error?.message||'DOCKER_TEST_FAILED'));
  return out;
};
const psql=(sql,{allowFailure=false}={})=>run(['exec','-i',container,'psql','-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-U','postgres','-d','postgres'],{input:sql,allowFailure});
const claims=user=>`set request.jwt.claims='{"sub":"${user}"}'; set role authenticated;\n`;
const authSql=(user,sql,opts={})=>psql(claims(user)+sql,opts);
const line=out=>String(out.stdout).trim().split(/\r?\n/).filter(Boolean).at(-1)??'';
const json=out=>JSON.parse(line(out));
const fail=(out,pattern,label)=>{assert.notEqual(out.status,0,label);assert.match(String(out.stderr),pattern,label);};
const q=s=>s.replaceAll("'","''");

const psqlAsync=(user,sql)=>new Promise(resolve=>{
  const child=spawn('docker',['exec','-i',container,'psql','-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-U','postgres','-d','postgres'],{stdio:['pipe','pipe','pipe']});
  let stdout='',stderr=''; child.stdout.on('data',d=>stdout+=d); child.stderr.on('data',d=>stderr+=d);
  child.on('close',status=>resolve({status,stdout,stderr}));
  child.stdin.end(claims(user)+sql);
});

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
if(dockerReady.error||dockerReady.status!==0)throw Error('BUSINESS_S2A_POSTGRES16_INTEGRATION_REQUIRES_DOCKER');

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
  for(const sql of sqlFiles.slice(3))psql(sql);

  const six=Number(line(psql(`select count(*) from information_schema.tables where table_schema='private_business_continuity' and table_type='BASE TABLE';`)));
  assert.equal(six,6);
  const rls=Number(line(psql(`select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='private_business_continuity' and c.relkind='r' and c.relrowsecurity;`)));
  assert.equal(rls,6);
  const grants=Number(line(psql(`select count(*) from information_schema.role_table_grants where table_schema='private_business_continuity' and grantee in ('anon','authenticated');`)));
  assert.equal(grants,0);

  const opTeam=randomUUID();
  const team=json(authSql(admin,`select public.bc_project_register('team-alpha','Team Alpha','${opTeam}');`));
  assert.equal(team.collaborationMode,'TEAM');
  assert.deepEqual(json(authSql(admin,`select public.bc_project_register('team-alpha','Team Alpha','${opTeam}');`)),team);
  fail(authSql(admin,`select public.bc_project_register('team-alpha','Changed','${opTeam}');`,{allowFailure:true}),/BUSINESS_IDEMPOTENCY_CONFLICT/,'project register changed-input replay');

  const opPrivate=randomUUID();
  const priv=json(authSql(admin,`select public.bc_project_register('private-alpha','Private Alpha','${opPrivate}','SAFE','PRIVATE');`));
  assert.equal(priv.collaborationMode,'PRIVATE');
  const opAdd=randomUUID();
  const added=json(authSql(admin,`select public.bc_private_member_add('${priv.projectId}','${member}','${opAdd}');`));
  assert.equal(added.memberPresent,true);

  const teamOp=randomUUID();
  const task=json(authSql(member,`select public.bc_task_start('${team.projectId}','Shared team objective','${teamOp}',null,array['team','bs2a']);`));
  assert.equal(task.status,'ACTIVE'); assert.equal(task.revision,0);
  assert.deepEqual(json(authSql(member,`select public.bc_task_start('${team.projectId}','Shared team objective','${teamOp}',null,array['team','bs2a']);`)),task);
  fail(authSql(member,`select public.bc_task_start('${team.projectId}','Changed objective','${teamOp}',null,array['team','bs2a']);`,{allowFailure:true}),/BUSINESS_IDEMPOTENCY_CONFLICT/,'task changed-input replay');
  assert.equal(json(authSql(outsider,`select public.bc_task_get('${team.projectId}','${task.taskId}');`)).task.taskId,task.taskId,'TEAM must be broad to active org members');

  const privateTask=json(authSql(member,`select public.bc_task_start('${priv.projectId}','Private objective','${randomUUID()}');`));
  fail(authSql(outsider,`select public.bc_task_get('${priv.projectId}','${privateTask.taskId}');`,{allowFailure:true}),/BUSINESS_PRIVATE_PROJECT_DENIED/,'PRIVATE outsider read must fail');
  fail(authSql(outsider,`select public.bc_task_start('${priv.projectId}','Unauthorized private task','${randomUUID()}');`,{allowFailure:true}),/BUSINESS_PRIVATE_PROJECT_DENIED/,'PRIVATE outsider write must fail');

  const beforeSensitive=Number(line(psql(`select count(*) from private_business_continuity.tasks;`)));
  fail(authSql(member,`select public.bc_task_start('${team.projectId}','password=should-not-persist','${randomUUID()}');`,{allowFailure:true}),/BUSINESS_CONTINUITY_SENSITIVE_TEXT/,'sensitive objective must fail before persistence');
  assert.equal(Number(line(psql(`select count(*) from private_business_continuity.tasks;`))),beforeSensitive);

  const cpOp=randomUUID();
  const cp=json(authSql(member,`select public.bc_checkpoint_append('${team.projectId}','${task.taskId}',0,'Foundation checkpoint','Core schema is ready','${cpOp}',array['Run race test'],'local PASS',array['TEAM default'],array['six tables'],array['docs/report'],null);`));
  assert.equal(cp.revision,1);
  assert.deepEqual(json(authSql(member,`select public.bc_checkpoint_append('${team.projectId}','${task.taskId}',0,'Foundation checkpoint','Core schema is ready','${cpOp}',array['Run race test'],'local PASS',array['TEAM default'],array['six tables'],array['docs/report'],null);`)),cp);
  fail(authSql(member,`select public.bc_checkpoint_append('${team.projectId}','${task.taskId}',0,'Changed checkpoint','Core schema is ready','${cpOp}');`,{allowFailure:true}),/BUSINESS_IDEMPOTENCY_CONFLICT/,'checkpoint changed-input replay');
  const beforeSecretCp=Number(line(psql(`select count(*) from private_business_continuity.checkpoints where task_id='${task.taskId}';`)));
  fail(authSql(member,`select public.bc_checkpoint_append('${team.projectId}','${task.taskId}',1,'Secret','api_key: should-not-persist','${randomUUID()}');`,{allowFailure:true}),/BUSINESS_CONTINUITY_SENSITIVE_TEXT/,'checkpoint secret guard');
  assert.equal(Number(line(psql(`select count(*) from private_business_continuity.checkpoints where task_id='${task.taskId}';`))),beforeSecretCp);

  const raceA=randomUUID(),raceB=randomUUID();
  const [a,b]=await Promise.all([
    psqlAsync(member,`select public.bc_checkpoint_append('${team.projectId}','${task.taskId}',1,'Race A','Writer A','${raceA}');`),
    psqlAsync(member,`select public.bc_checkpoint_append('${team.projectId}','${task.taskId}',1,'Race B','Writer B','${raceB}');`)
  ]);
  assert.equal([a,b].filter(x=>x.status===0).length,1,'exactly one same-revision writer must commit');
  assert.equal([a,b].filter(x=>x.status!==0).length,1,'exactly one same-revision writer must fail');
  assert.match(a.status===0?b.stderr:a.stderr,/BUSINESS_REVISION_CONFLICT/);
  const finalTask=json(authSql(member,`select public.bc_task_get('${team.projectId}','${task.taskId}');`));
  assert.equal(finalTask.task.revision,2);
  assert.equal(finalTask.checkpoints.length,2);

  const opRemove=randomUUID();
  const removed=json(authSql(admin,`select public.bc_private_member_remove('${priv.projectId}','${member}','${opRemove}');`));
  assert.equal(removed.memberPresent,false);
  fail(authSql(member,`select public.bc_task_get('${priv.projectId}','${privateTask.taskId}');`,{allowFailure:true}),/BUSINESS_PRIVATE_PROJECT_DENIED/,'removed private member loses access');

  const state=json(psql(`select jsonb_build_object('seq',context_seq,'head',head_sha256,'events',(select count(*) from private_business_continuity.events))
    from private_business_continuity.continuity_state limit 1;`));
  assert.ok(state.seq>=4); assert.match(state.head,/^[a-f0-9]{64}$/); assert.equal(state.events,state.seq);
  fail(authSql(member,'select * from private_business_continuity.tasks;',{allowFailure:true}),/permission denied/i,'direct continuity table access denied');
  fail(psql(`set role anon; select public.bc_task_get('${team.projectId}','${task.taskId}');`,{allowFailure:true}),/permission denied.*bc_task_get/i,'anon continuity RPC denied');

  console.log('PASS PostgreSQL16 applies project-policy prerequisites plus exact six-table continuity foundation');
  console.log('PASS TEAM broad visibility and PRIVATE explicit-member isolation operate from control-plane policy');
  console.log('PASS task/checkpoint operation UUID idempotency and sensitive-text rejection fail closed before persistence');
  console.log('PASS concurrent same-revision checkpoints commit exactly one writer and reject exactly one with REVISION_CONFLICT');
  console.log('PASS transactional continuity event/head sequence advances with direct-table and anon denial intact');
  console.log('BUSINESS_S2A_CONTINUITY_POSTGRES=PASS');
} finally {
  run(['rm','-f',container],{allowFailure:true});
}
