import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const repo=fileURLToPath(new URL('../../../',import.meta.url));
const foundation=readFileSync(repo+'/supabase/migrations/20261007161000_business_v11_bs1_control_foundation.sql','utf8');
const indexes=readFileSync(repo+'/supabase/migrations/20261007162500_business_v11_bs1_control_fk_indexes.sql','utf8');
const container='chatagent-business-s1a-pg16-'+process.pid;
const org='10000000-0000-4000-8000-000000000001';
const admin='20000000-0000-4000-8000-000000000001';
const node='30000000-0000-4000-8000-000000000001';

const run=(args,{input=null,allowFailure=false}={})=>{
  const out=spawnSync('docker',args,{input,encoding:'utf8',maxBuffer:4*1024*1024});
  if(!allowFailure&&(out.error||out.status!==0))
    throw Error('DOCKER_TEST_FAILED: '+String(out.stderr||out.error?.message||''));
  return out;
};
const psql=(sql,{allowFailure=false}={})=>run([
  'exec','-i',container,'psql','-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-U','postgres','-d','postgres'
],{input:sql,allowFailure});
const lastLine=stdout=>String(stdout).trim().split(/\r?\n/).filter(Boolean).at(-1)??'';
const jsonResult=out=>JSON.parse(lastLine(out.stdout));
const expectFailure=(out,pattern,label)=>{
  assert.notEqual(out.status,0,`expected failure: ${label}`);
  assert.match(String(out.stderr),pattern,label);
};

const fixture=`
create role anon nologin;
create role authenticated nologin;
create schema auth;
create table auth.users(id uuid primary key);
`;

const dockerReady=run(['version','--format','{{.Server.Version}}'],{allowFailure:true});
if(dockerReady.error||dockerReady.status!==0)
  throw Error('BUSINESS_S1A_POSTGRES16_INTEGRATION_REQUIRES_DOCKER');

try{
  run(['run','-d','--name',container,
    '-e','POSTGRES_PASSWORD=postgres','-e','POSTGRES_DB=postgres','postgres:16-alpine']);
  let ready=false, consecutive=0;
  for(let i=0;i<60;i++){
    const probe=run(['exec',container,'pg_isready','-U','postgres'],{allowFailure:true});
    const sqlProbe=probe.status===0?psql('select 1;',{allowFailure:true}):null;
    consecutive=probe.status===0&&sqlProbe?.status===0?consecutive+1:0;
    if(consecutive>=3){ready=true;break;}
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,250);
  }
  assert.equal(ready,true,'PostgreSQL 16 test container did not become stably ready');

  psql(fixture);
  psql(foundation);
  psql(indexes);

  const tableCount=Number(lastLine(psql("select count(*) from information_schema.tables where table_schema='private_business_control';").stdout));
  assert.equal(tableCount,9);
  const rlsCount=Number(lastLine(psql("select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='private_business_control' and c.relkind='r' and c.relrowsecurity;").stdout));
  assert.equal(rlsCount,9);
  const grants=Number(lastLine(psql("select count(*) from information_schema.role_table_grants where table_schema='private_business_control' and grantee in ('anon','authenticated');").stdout));
  assert.equal(grants,0);

  const initial=jsonResult(psql('set role authenticated; select public.bc_schema_status();'));
  assert.equal(initial.schema,'private_business_control');
  assert.equal(initial.schemaVersion,1);
  assert.equal(initial.contractVersion,1);
  assert.equal(initial.tableCount,9);
  assert.equal(initial.organizationInitialized,false);

  expectFailure(psql('set role anon; select public.bc_schema_status();',{allowFailure:true}),/permission denied.*bc_schema_status/i,'anon schema status denied');
  expectFailure(psql('set role authenticated; select * from private_business_control.organizations;',{allowFailure:true}),/permission denied/i,'authenticated direct private-table read denied');

  psql(`
insert into auth.users(id) values ('${admin}');
insert into private_business_control.organizations(id,slug,display_name)
values ('${org}','fixture-org','Fixture Organization');
insert into private_business_control.control_state(organization_id) values ('${org}');
insert into private_business_control.organization_members(organization_id,user_id,role)
values ('${org}','${admin}','ADMIN');
`);
  const initialized=jsonResult(psql('set role authenticated; select public.bc_schema_status();'));
  assert.equal(initialized.organizationInitialized,true);

  expectFailure(psql(`insert into private_business_control.organizations(id,slug,display_name) values ('10000000-0000-4000-8000-000000000002','second','Second');`,{allowFailure:true}),/duplicate key|unique constraint/i,'one organization per project');
  expectFailure(psql(`insert into private_business_control.organization_members(organization_id,user_id,role) values ('${org}','20000000-0000-4000-8000-000000000002','OWNER');`,{allowFailure:true}),/foreign key|check constraint/i,'unsupported role rejected');

  expectFailure(psql(`insert into private_business_control.runtime_nodes(id,organization_id,node_name,node_type,enrolled_by_user_id) values ('${node}','${org}','Bad Personal','PERSONAL_NODE','${admin}');`,{allowFailure:true}),/check constraint/i,'PERSONAL_NODE requires owner');
  expectFailure(psql(`insert into private_business_control.runtime_nodes(id,organization_id,node_name,node_type,owner_user_id,enrolled_by_user_id) values ('30000000-0000-4000-8000-000000000002','${org}','Bad Shared','SHARED_NODE','${admin}','${admin}');`,{allowFailure:true}),/check constraint/i,'SHARED_NODE must not have personal owner');

  psql(`insert into private_business_control.runtime_nodes(id,organization_id,node_name,node_type,owner_user_id,enrolled_by_user_id)
values ('${node}','${org}','Admin Mac','PERSONAL_NODE','${admin}','${admin}');`);
  const lifecycle=lastLine(psql(`select lifecycle from private_business_control.runtime_nodes where id='${node}';`).stdout);
  assert.equal(lifecycle,'PENDING');

  const fkIndexCount=Number(lastLine(psql(`select count(*) from pg_indexes where schemaname='private_business_control' and indexname in (
    'organization_members_user_idx','runtime_nodes_owner_member_idx','runtime_nodes_enrolled_by_idx',
    'runtime_nodes_approved_by_idx','runtime_nodes_revoked_by_idx','runtime_sessions_member_idx',
    'logical_projects_created_by_idx','private_project_members_member_idx','private_project_members_granted_by_idx'
  );`).stdout));
  assert.equal(fkIndexCount,9);

  console.log('PASS PostgreSQL16 applies authoritative B-S1A foundation + FK-index migrations');
  console.log('PASS 9/9 private tables RLS-enabled with zero anon/authenticated direct-table grants');
  console.log('PASS authenticated bc_schema_status and anon denial');
  console.log('PASS one-org, minimal role and PERSONAL/SHARED owner constraints');
  console.log('PASS valid PERSONAL_NODE storage starts PENDING and 9 FK covering indexes exist');
  console.log('BUSINESS_S1A_POSTGRES_INTEGRATION=PASS');
} finally {
  run(['rm','-f',container],{allowFailure:true});
}
