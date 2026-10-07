import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const repo=fileURLToPath(new URL('../../../',import.meta.url));
const foundation=readFileSync(repo+'/supabase/migrations/20261007161000_business_v11_bs1_control_foundation.sql','utf8');
const indexes=readFileSync(repo+'/supabase/migrations/20261007162500_business_v11_bs1_control_fk_indexes.sql','utf8');
const identity=readFileSync(repo+'/supabase/migrations/20261007170000_business_v11_bs1_member_identity.sql','utf8');
const runtime=readFileSync(repo+'/supabase/migrations/20261007190000_business_v11_bs1_runtime_node_lifecycle.sql','utf8');
const bootstrap=readFileSync(repo+'/scripts/business/v1.1/control/bs1b-bootstrap-single-admin-staging.sql','utf8');
const container='chatagent-business-s1c-pg16-'+process.pid;
const admin='20000000-0000-4000-8000-000000000001';
const member='20000000-0000-4000-8000-000000000002';
const outsider='20000000-0000-4000-8000-000000000003';
const personalNode='30000000-0000-4000-8000-000000000001';
const sharedNode='30000000-0000-4000-8000-000000000002';
const opEnroll='40000000-0000-4000-8000-000000000001';
const opApprove='40000000-0000-4000-8000-000000000002';
const opSharedEnroll='40000000-0000-4000-8000-000000000003';
const opSharedApprove='40000000-0000-4000-8000-000000000004';
const opRevoke='40000000-0000-4000-8000-000000000005';

const run=(args,{input=null,allowFailure=false}={})=>{
  const out=spawnSync('docker',args,{input,encoding:'utf8',maxBuffer:6*1024*1024});
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
  throw Error('BUSINESS_S1C_POSTGRES16_INTEGRATION_REQUIRES_DOCKER');

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
  psql(runtime);

  psql(`insert into auth.users(id,email,confirmed_at) values ('${admin}','admin@example.test',now());`);
  psql(bootstrap);
  psql(`
    insert into auth.users(id,email,confirmed_at) values
      ('${member}','member@example.test',now()),
      ('${outsider}','outsider@example.test',now());
    insert into private_business_control.organization_members(organization_id,user_id,role,member_state)
    select id,'${member}','MEMBER','ACTIVE' from private_business_control.organizations;
    insert into private_business_control.organization_members(organization_id,user_id,role,member_state)
    select id,'${outsider}','MEMBER','ACTIVE' from private_business_control.organizations;
  `);

  const pending=jsonResult(authSql(member,`select public.bc_runtime_enroll(
    '${personalNode}','Member MacBook','PERSONAL_NODE','${opEnroll}',false,false);`));
  assert.equal(pending.lifecycle,'PENDING');
  assert.equal(pending.ownedByCaller,true);
  assert.equal(pending.approvalTransitioned,false);

  const replay=jsonResult(authSql(member,`select public.bc_runtime_enroll(
    '${personalNode}','Member MacBook','PERSONAL_NODE','${opEnroll}',false,false);`));
  assert.deepEqual(replay,pending,'same operation + same input must replay receipt');
  expectFailure(authSql(member,`select public.bc_runtime_enroll(
    '${personalNode}','Changed Name','PERSONAL_NODE','${opEnroll}',false,false);`,{allowFailure:true}),
    /BUSINESS_IDEMPOTENCY_CONFLICT/,'changed input under same operation ID');

  const pendingStatus=jsonResult(authSql(member,`select public.bc_runtime_status('${personalNode}');`));
  assert.equal(pendingStatus.lifecycle,'PENDING');
  assert.equal(pendingStatus.ownedByCaller,true);
  assert.equal('leaseExpiresAt' in pendingStatus,false);

  expectFailure(authSql(member,`select public.bc_runtime_enroll(
    '${sharedNode}','Shared Build Mac','SHARED_NODE','${opSharedEnroll}',false,false);`,{allowFailure:true}),
    /BUSINESS_ADMIN_REQUIRED/,'member cannot enroll SHARED_NODE');

  const approved=jsonResult(authSql(admin,`select public.bc_runtime_enroll(
    '${personalNode}','Member MacBook','PERSONAL_NODE','${opApprove}',true,false);`));
  assert.equal(approved.lifecycle,'APPROVED');
  assert.equal(approved.approvalTransitioned,true);
  assert.equal(approved.ownedByCaller,false,'ADMIN approval does not become PERSONAL_NODE ownership');

  expectFailure(authSql(outsider,`select public.bc_runtime_status('${personalNode}');`,{allowFailure:true}),
    /BUSINESS_RUNTIME_NODE_DENIED/,'non-owner cannot inspect/use another PERSONAL_NODE');

  const ownerStatus=jsonResult(authSql(member,`select public.bc_runtime_status('${personalNode}');`));
  assert.equal(ownerStatus.lifecycle,'APPROVED');
  assert.equal(ownerStatus.ownedByCaller,true);
  assert.equal(typeof ownerStatus.leaseExpiresAt,'string');
  assert.ok(ownerStatus.authorizationLeaseSeconds>=30&&ownerStatus.authorizationLeaseSeconds<=3600);

  const session=jsonResult(psql(`select jsonb_build_object(
    'state',session_state,'future',lease_expires_at>now()
  ) from private_business_control.runtime_sessions
  where runtime_node_id='${personalNode}' and user_id='${member}';`));
  assert.deepEqual(session,{state:'ACTIVE',future:true});

  const memberList=jsonResult(authSql(member,'select public.bc_runtime_list();'));
  assert.equal(memberList.count,1);
  assert.equal(memberList.nodes[0].nodeId,personalNode);
  const outsiderBeforeShared=jsonResult(authSql(outsider,'select public.bc_runtime_list();'));
  assert.equal(outsiderBeforeShared.count,0,'other member must not discover personal node');

  const sharedPending=jsonResult(authSql(admin,`select public.bc_runtime_enroll(
    '${sharedNode}','Shared Build Mac','SHARED_NODE','${opSharedEnroll}',false,false);`));
  assert.equal(sharedPending.lifecycle,'PENDING');
  expectFailure(authSql(admin,`select public.bc_runtime_enroll(
    '${sharedNode}','Shared Build Mac','SHARED_NODE','40000000-0000-4000-8000-000000000099',false,true);`,{allowFailure:true}),
    /BUSINESS_SHARED_HOST_POWER_INVALID/,'shared host power requires explicit approval leg');

  const sharedApproved=jsonResult(authSql(admin,`select public.bc_runtime_enroll(
    '${sharedNode}','Shared Build Mac','SHARED_NODE','${opSharedApprove}',true,true);`));
  assert.equal(sharedApproved.lifecycle,'APPROVED');
  assert.equal(sharedApproved.sharedHostPowerEnabled,true);
  assert.equal(sharedApproved.ownedByCaller,false);
  const sharedForMember=jsonResult(authSql(member,`select public.bc_runtime_status('${sharedNode}');`));
  assert.equal(sharedForMember.lifecycle,'APPROVED');
  assert.equal(sharedForMember.sharedHostPowerEnabled,true);

  const outsiderAfterShared=jsonResult(authSql(outsider,'select public.bc_runtime_list();'));
  assert.equal(outsiderAfterShared.count,1);
  assert.equal(outsiderAfterShared.nodes[0].nodeId,sharedNode,'approved shared node is caller-eligible');

  expectFailure(authSql(member,`select public.bc_runtime_revoke('${personalNode}','${opRevoke}');`,{allowFailure:true}),
    /BUSINESS_ADMIN_REQUIRED/,'only ADMIN may revoke node');
  const revoked=jsonResult(authSql(admin,`select public.bc_runtime_revoke('${personalNode}','${opRevoke}');`));
  assert.equal(revoked.lifecycle,'REVOKED');
  assert.equal(revoked.revocationTransitioned,true);
  const revokeReplay=jsonResult(authSql(admin,`select public.bc_runtime_revoke('${personalNode}','${opRevoke}');`));
  assert.deepEqual(revokeReplay,revoked);

  const revokedSession=lastLine(psql(`select session_state from private_business_control.runtime_sessions
    where runtime_node_id='${personalNode}' and user_id='${member}';`).stdout);
  assert.equal(revokedSession,'REVOKED');
  const revokedStatus=jsonResult(authSql(member,`select public.bc_runtime_status('${personalNode}');`));
  assert.equal(revokedStatus.lifecycle,'REVOKED');
  assert.equal('leaseExpiresAt' in revokedStatus,false);
  const memberAfterRevoke=jsonResult(authSql(member,'select public.bc_runtime_list();'));
  assert.equal(memberAfterRevoke.nodes.some(x=>x.nodeId===personalNode),false);
  expectFailure(authSql(member,`select public.bc_runtime_enroll(
    '${personalNode}','Member MacBook','PERSONAL_NODE','40000000-0000-4000-8000-000000000006',false,false);`,{allowFailure:true}),
    /BUSINESS_RUNTIME_NODE_REVOKED/,'revoked node ID is terminal');

  expectFailure(psql(`set role anon; select public.bc_runtime_list();`,{allowFailure:true}),
    /permission denied.*bc_runtime_list/i,'anon runtime list denied');
  expectFailure(authSql(member,'select * from private_business_control.runtime_nodes;',{allowFailure:true}),
    /permission denied/i,'direct private runtime-node table access denied');

  const revisions=jsonResult(psql(`select jsonb_build_object(
    'policyRevision',(select policy_revision from private_business_control.control_state),
    'enrollOps',(select count(*) from private_business_control.operations where operation_kind='runtime_enroll'),
    'revokeOps',(select count(*) from private_business_control.operations where operation_kind='runtime_revoke')
  );`));
  assert.ok(revisions.policyRevision>=4);
  assert.equal(revisions.enrollOps,4);
  assert.equal(revisions.revokeOps,1);

  console.log('PASS PostgreSQL16 applies B-S1C runtime lifecycle migration on B-S1A/B foundation');
  console.log('PASS PERSONAL_NODE enrollment binds auth.uid owner, requires ADMIN approval, and hides from other members');
  console.log('PASS SHARED_NODE enrollment/approval is ADMIN-only and explicit shared host-power opt-in is preserved');
  console.log('PASS status heartbeat mints bounded session lease; revoke invalidates session and terminal node ID');
  console.log('PASS enroll/revoke operation UUID receipt replay and conflict semantics fail closed');
  console.log('BUSINESS_S1C_RUNTIME_NODE_POSTGRES=PASS');
} finally {
  run(['rm','-f',container],{allowFailure:true});
}
