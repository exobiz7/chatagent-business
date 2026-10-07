import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const repo=fileURLToPath(new URL('../../../',import.meta.url));
const foundation=readFileSync(repo+'/supabase/migrations/20261007161000_business_v11_bs1_control_foundation.sql','utf8');
const indexes=readFileSync(repo+'/supabase/migrations/20261007162500_business_v11_bs1_control_fk_indexes.sql','utf8');
const identity=readFileSync(repo+'/supabase/migrations/20261007170000_business_v11_bs1_member_identity.sql','utf8');
const bootstrap=readFileSync(repo+'/scripts/business/v1.1/control/bs1b-bootstrap-single-admin-staging.sql','utf8');
const container='chatagent-business-s1b-pg16-'+process.pid;
const admin='20000000-0000-4000-8000-000000000001';
const outsider='20000000-0000-4000-8000-000000000002';
const slug='chatagent-business-v11-bs0';
const expectedProfile='prf_'+createHash('sha256').update(slug+'\0'+admin).digest('hex').slice(0,32);

const run=(args,{input=null,allowFailure=false}={})=>{
  const out=spawnSync('docker',args,{input,encoding:'utf8',maxBuffer:4*1024*1024});
  if(!allowFailure&&(out.error||out.status!==0))
    throw Error('DOCKER_TEST_FAILED: '+String(out.stderr||out.error?.message||''));
  return out;
};
const psql=(sql,{allowFailure=false}={})=>run([
  'exec','-i',container,'psql','-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-U','postgres','-d','postgres'
],{input:sql,allowFailure});
const claims=user=>`set request.jwt.claims='{"sub":"${user}"}'; set role authenticated;\n`;
const authSql=(user,sql,options={})=>psql(claims(user)+sql,options);
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
create table auth.users(
  id uuid primary key,
  email text,
  confirmed_at timestamptz,
  is_anonymous boolean not null default false,
  raw_user_meta_data jsonb not null default '{}'::jsonb
);
create or replace function auth.jwt()
returns jsonb language sql stable set search_path='' as $$
  select coalesce(nullif(pg_catalog.current_setting('request.jwt.claims',true),''),'{}')::jsonb
$$;
create or replace function auth.uid()
returns uuid language sql stable set search_path='' as $$
  select nullif(auth.jwt()->>'sub','')::uuid
$$;
`;

const dockerReady=run(['version','--format','{{.Server.Version}}'],{allowFailure:true});
if(dockerReady.error||dockerReady.status!==0)
  throw Error('BUSINESS_S1B_POSTGRES16_INTEGRATION_REQUIRES_DOCKER');

try{
  run(['run','-d','--name',container,'-e','POSTGRES_PASSWORD=postgres','-e','POSTGRES_DB=postgres','postgres:16-alpine']);
  let ready=false,consecutive=0;
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
  psql(identity);

  // Exactly one confirmed, non-anonymous Auth user is eligible for staging bootstrap.
  psql(`insert into auth.users(id,email,confirmed_at,raw_user_meta_data)
    values ('${admin}','admin@example.test',now(),'{"name":"Admin Fixture"}'::jsonb);`);
  psql(bootstrap);

  const counts=jsonResult(psql(`select jsonb_build_object(
    'orgs',(select count(*) from private_business_control.organizations),
    'members',(select count(*) from private_business_control.organization_members),
    'admins',(select count(*) from private_business_control.organization_members where role='ADMIN' and member_state='ACTIVE')
  );`));
  assert.deepEqual(counts,{orgs:1,members:1,admins:1});

  const secondBootstrap=psql(bootstrap,{allowFailure:true});
  expectFailure(secondBootstrap,/BUSINESS_BOOTSTRAP_ALREADY_INITIALIZED/,'bootstrap must be one-time/fail-closed');

  // Add a second authenticated-but-not-member identity only after bootstrap.
  psql(`insert into auth.users(id,email,confirmed_at,raw_user_meta_data)
    values ('${outsider}','outsider@example.test',now(),'{}'::jsonb);`);

  const profile=jsonResult(authSql(admin,'select public.bc_member_profile();'));
  assert.equal(profile.id,expectedProfile);
  assert.equal(profile.email,'admin@example.test');
  assert.equal(profile.name,'Admin Fixture');
  assert.equal(profile.nickname,'ChatAgent Business');

  const status=jsonResult(authSql(admin,'select public.bc_schema_status();'));
  assert.equal(status.organizationInitialized,true);
  assert.equal(status.organizationSlug,slug);
  assert.equal(status.role,'ADMIN');

  expectFailure(authSql(outsider,'select public.bc_member_profile();',{allowFailure:true}),/BUSINESS_MEMBER_NOT_FOUND/,'non-member profile denied');
  expectFailure(authSql(outsider,'select public.bc_schema_status();',{allowFailure:true}),/BUSINESS_MEMBER_NOT_FOUND/,'non-member schema status denied');
  expectFailure(psql('set role anon; select public.bc_member_profile();',{allowFailure:true}),/permission denied.*bc_member_profile/i,'anon profile denied');

  // Mutable user metadata/email are display fields only and cannot change opaque identity.
  psql(`update auth.users set email='changed@example.test', raw_user_meta_data='{"name":"Changed Name"}'::jsonb where id='${admin}';`);
  const changed=jsonResult(authSql(admin,'select public.bc_member_profile();'));
  assert.equal(changed.id,expectedProfile,'profile ID must ignore mutable email/name');
  assert.equal(changed.email,'changed@example.test');
  assert.equal(changed.name,'Changed Name');

  psql(`update private_business_control.organization_members
    set member_state='REVOKED', revoked_at=now()
    where user_id='${admin}';`);
  expectFailure(authSql(admin,'select public.bc_member_profile();',{allowFailure:true}),/BUSINESS_MEMBER_REVOKED/,'revoked member profile denied');
  expectFailure(authSql(admin,'select public.bc_schema_status();',{allowFailure:true}),/BUSINESS_MEMBER_REVOKED/,'revoked member schema status denied');

  expectFailure(authSql(outsider,'select * from private_business_control.organization_members;',{allowFailure:true}),/permission denied/i,'direct private table access remains denied');

  console.log('PASS PostgreSQL16 applies B-S1B member identity migration on authoritative B-S1A schema');
  console.log('PASS staging bootstrap selects exactly one eligible Auth identity without hardcoded UUID and is one-time fail-closed');
  console.log('PASS bc_member_profile preserves deterministic B-S0 opaque profile identity and standard profile fields');
  console.log('PASS mutable display metadata does not grant authority or change opaque profile ID');
  console.log('PASS anon, non-member, revoked-member and direct-table paths fail closed');
  console.log('BUSINESS_S1B_MEMBER_IDENTITY_POSTGRES=PASS');
} finally {
  run(['rm','-f',container],{allowFailure:true});
}
