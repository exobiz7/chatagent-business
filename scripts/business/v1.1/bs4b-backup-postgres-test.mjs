import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import {chmodSync,lstatSync,mkdtempSync,readFileSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {assembleBusinessHandoff} from './continuity/business-handoff-context.mjs';
import {businessContinuityLogicalDigest,normalizeBusinessContinuityLogicalSnapshot} from './backup/business-continuity-logical-contract.mjs';
import {createEncryptedBusinessContinuityBackup,restoreEncryptedBusinessContinuityBackup} from './backup/business-continuity-logical-backup.mjs';

const repo=fileURLToPath(new URL('../../../',import.meta.url));
const root=mkdtempSync(join(tmpdir(),'chatagent-business-bs4b-'));chmodSync(root,0o700);
const archive=join(root,'continuity.cbbackup'),tamperedArchive=join(root,'tampered.cbbackup');
const key=randomBytes(32),wrongKey=randomBytes(32);
const org='chatagent-business-v11-bs0';
const admin='53000000-0000-4000-8000-000000000001';
const member='53000000-0000-4000-8000-000000000002';
const outsider='53000000-0000-4000-8000-000000000003';
const runtimeNode='53000000-0000-4000-8000-000000000004';
const container='chatagent-business-bs4b-pg16-'+process.pid;
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
].map(x=>readFileSync(join(repo,x),'utf8'));
const bootstrap=readFileSync(join(repo,'scripts/business/v1.1/control/bs1b-bootstrap-single-admin-staging.sql'),'utf8');
const backupSql=readFileSync(join(repo,'scripts/business/v1.1/backup/bs4b-logical-backup-restore.sql'),'utf8');

const run=(args,{input=null,allowFailure=false}={})=>{
  const out=spawnSync('docker',args,{input,encoding:'utf8',maxBuffer:32*1024*1024});
  if(!allowFailure&&(out.error||out.status!==0))throw Error(String(out.stderr||out.error?.message||'DOCKER_TEST_FAILED'));
  return out;
};
const psql=(sql,{allowFailure=false}={})=>run(['exec','-i',container,'psql','-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-U','postgres','-d','postgres'],{input:sql,allowFailure});
const claims=user=>`set request.jwt.claims='{"sub":"${user}"}'; set role authenticated;\n`;
const authSql=(user,sql,opts={})=>psql(claims(user)+sql,opts);
const line=out=>String(out.stdout).trim().split(/\r?\n/).filter(Boolean).at(-1)??'';
const json=out=>JSON.parse(line(out));
const q=s=>s.replaceAll("'","''");
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
const insertNode=()=>psql(`insert into private_business_control.runtime_nodes(
 id,organization_id,node_name,node_type,lifecycle,owner_user_id,shared_host_power_enabled,enrolled_by_user_id,approved_by_user_id,enrolled_at,approved_at,last_seen_at)
 select '${runtimeNode}',id,'B-S4B Shared Fixture','SHARED_NODE','APPROVED',null,false,'${admin}','${admin}',now(),now(),now()
 from private_business_control.organizations where slug='${org}';`);

const dockerReady=run(['version','--format','{{.Server.Version}}'],{allowFailure:true});
if(dockerReady.error||dockerReady.status!==0)throw Error('BUSINESS_S4B_POSTGRES16_REQUIRES_DOCKER');
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
  psql(`insert into auth.users(id,email,confirmed_at) values('${admin}','admin@example.test',now());`);psql(bootstrap);
  psql(`insert into auth.users(id,email,confirmed_at) values('${member}','member@example.test',now()),('${outsider}','outsider@example.test',now());
    insert into private_business_control.organization_members(organization_id,user_id,role,member_state)
      select id,'${member}','MEMBER','ACTIVE' from private_business_control.organizations;
    insert into private_business_control.organization_members(organization_id,user_id,role,member_state)
      select id,'${outsider}','MEMBER','ACTIVE' from private_business_control.organizations;`);
  for(const sql of migrations.slice(3))psql(sql);psql(backupSql);insertNode();
  assert.equal(line(psql(`select has_function_privilege('authenticated','private_business_continuity._backup_export(text)','EXECUTE');`)),'f');
  assert.equal(line(psql(`select has_function_privilege('authenticated','private_business_continuity._restore_empty(jsonb,uuid)','EXECUTE');`)),'f');

  const team=json(authSql(admin,`select public.bc_project_register('backup-team','Backup Team','${randomUUID()}','STANDARD','TEAM');`));
  const priv=json(authSql(admin,`select public.bc_project_register('backup-private','Backup Private','${randomUUID()}','SAFE','PRIVATE');`));
  authSql(admin,`select public.bc_private_member_add('${priv.projectId}','${member}','${randomUUID()}');`);
  const teamTask=json(authSql(member,`select public.bc_task_start('backup-team','Encrypted backup active objective','${randomUUID()}','${admin}',array['backup','active']);`));
  authSql(member,`select public.bc_checkpoint_append('backup-team','${teamTask.taskId}',0,'Backup team checkpoint','Team state before backup','${randomUUID()}',array['restore team'],'team verified',array['preserve exact logical state'],array['team backup fact'],array['docs/team'],'${runtimeNode}');`);
  const privateTask=json(authSql(member,`select public.bc_task_start('backup-private','Encrypted private recovery objective','${randomUUID()}',null,array['private']);`));
  authSql(member,`select public.bc_checkpoint_append('backup-private','${privateTask.taskId}',0,'Private checkpoint','Private state before backup','${randomUUID()}',array['restore private'],'private verified',array['keep membership'],array['private backup fact'],array['docs/private'],'${runtimeNode}');`);
  authSql(member,`select public.bc_task_complete('backup-private','${privateTask.taskId}',1,'${randomUUID()}');`);
  const beforeDigests=new Map();
  for(const [projectId,taskId] of [['backup-team',teamTask.taskId],['backup-private',privateTask.taskId]]){
    const result=json(authSql(member,`select public.bc_task_get('${projectId}','${taskId}');`));
    beforeDigests.set(taskId,assembleBusinessHandoff({organizationId:org,taskResult:result}).contextDigest);
  }
  fail(authSql(outsider,`select public.bc_task_get('backup-private','${privateTask.taskId}');`,{allowFailure:true}),/BUSINESS_PRIVATE_PROJECT_DENIED/,'private outsider before backup');

  const rawSnapshot=json(psql(`select private_business_continuity._backup_export('${org}');`));
  const snapshot=normalizeBusinessContinuityLogicalSnapshot(rawSnapshot),sourceDigest=businessContinuityLogicalDigest(snapshot);
  assert.equal(snapshot.counts.projects,2);assert.equal(snapshot.counts.privateProjectMembers,2);
  assert.equal(snapshot.counts.tasks,2);assert.equal(snapshot.counts.checkpoints,2);assert.equal(snapshot.counts.events,snapshot.contextSeq);
  const created=createEncryptedBusinessContinuityBackup({snapshot,archivePath:archive,archiveKey:key,backupRef:org,createdAt:1792000000000});
  assert.equal(created.encrypted,true);assert.equal(created.logicalDigest,sourceDigest);assert.equal(lstatSync(archive).mode&0o777,0o600);
  const archiveText=readFileSync(archive,'utf8');
  assert.doesNotMatch(archiveText,/Encrypted backup active objective|Encrypted private recovery objective|backup-private|docs\/private/);
  assert.equal(archiveText.includes(key.toString('base64')),false,'backup key must not be embedded in archive');
  assert.throws(()=>createEncryptedBusinessContinuityBackup({snapshot,archivePath:archive,archiveKey:key,backupRef:org}),/BUSINESS_BACKUP_NEW_PATH_REQUIRED/);
  assert.throws(()=>restoreEncryptedBusinessContinuityBackup({archivePath:archive,archiveKey:wrongKey}),/BUSINESS_BACKUP_AUTHENTICATION_FAILED/);
  const envelope=JSON.parse(archiveText),tampered=Buffer.from(envelope.ciphertext,'base64');tampered[0]^=0x80;
  writeFileSync(tamperedArchive,JSON.stringify({...envelope,ciphertext:tampered.toString('base64')})+'\n',{mode:0o600,flag:'wx'});
  assert.throws(()=>restoreEncryptedBusinessContinuityBackup({archivePath:tamperedArchive,archiveKey:key}),/BUSINESS_BACKUP_AUTHENTICATION_FAILED/);
  const restoredArchive=restoreEncryptedBusinessContinuityBackup({archivePath:archive,archiveKey:key});
  assert.equal(restoredArchive.digest,sourceDigest);assert.deepEqual(restoredArchive.snapshot,snapshot);
  console.log('PASS AES-256-GCM archive hides continuity plaintext/key, rejects overwrite/wrong key/tampering, and restores exact logical digest');

  const orgId=line(psql(`select id from private_business_control.organizations where slug='${org}';`));
  psql(`delete from private_business_continuity.events where organization_id='${orgId}';
        delete from private_business_continuity.checkpoints where organization_id='${orgId}';
        delete from private_business_continuity.tasks where organization_id='${orgId}';
        delete from private_business_continuity.operations where organization_id='${orgId}';
        delete from private_business_continuity.continuity_state where organization_id='${orgId}';
        delete from private_business_control.private_project_members where organization_id='${orgId}';
        delete from private_business_control.logical_projects where organization_id='${orgId}';
        delete from private_business_control.runtime_nodes where organization_id='${orgId}' and id='${runtimeNode}';`);
  assert.equal(Number(line(psql(`select count(*) from private_business_control.logical_projects where organization_id='${orgId}';`))),0);
  assert.equal(Number(line(psql(`select count(*) from private_business_continuity.events where organization_id='${orgId}';`))),0);

  const snapshotJson=JSON.stringify(restoredArchive.snapshot);assert.equal(snapshotJson.includes('$restore$'),false);
  const missingNode=psql(`select private_business_continuity._restore_empty($restore$${snapshotJson}$restore$::jsonb,'${admin}');`,{allowFailure:true});
  fail(missingNode,/BUSINESS_RESTORE_NODE_PREREQUISITE_MISSING/,'missing runtime node prerequisite');
  assert.equal(Number(line(psql(`select count(*) from private_business_control.logical_projects where organization_id='${orgId}';`))),0,'failed restore must roll back project inserts');
  insertNode();
  const receipt=json(psql(`select private_business_continuity._restore_empty($restore$${snapshotJson}$restore$::jsonb,'${admin}');`));
  assert.equal(receipt.restored,true);assert.equal(receipt.integrityVerified,true);assert.equal(receipt.contextSeq,snapshot.contextSeq);
  assert.deepEqual(receipt.counts,snapshot.counts);
  const replay=psql(`select private_business_continuity._restore_empty($restore$${snapshotJson}$restore$::jsonb,'${admin}');`,{allowFailure:true});
  fail(replay,/BUSINESS_RESTORE_TARGET_NOT_EMPTY/,'second restore must not overwrite restored state');

  const readback=normalizeBusinessContinuityLogicalSnapshot(json(psql(`select private_business_continuity._backup_export('${org}');`)));
  assert.equal(businessContinuityLogicalDigest(readback),sourceDigest,'restore changed logical backup digest');
  assert.deepEqual(readback,snapshot,'restore readback must equal pre-loss logical snapshot');
  assert.equal(line(psql(`select private_business_continuity._event_chain_verified('${orgId}');`)),'t');
  for(const [projectId,taskId] of [['backup-team',teamTask.taskId],['backup-private',privateTask.taskId]]){
    const result=json(authSql(member,`select public.bc_task_get('${projectId}','${taskId}');`));
    assert.equal(assembleBusinessHandoff({organizationId:org,taskResult:result}).contextDigest,beforeDigests.get(taskId),'contextDigest changed after encrypted restore');
  }
  assert.equal(json(authSql(outsider,`select public.bc_task_get('backup-team','${teamTask.taskId}');`)).task.taskId,teamTask.taskId);
  fail(authSql(outsider,`select public.bc_task_get('backup-private','${privateTask.taskId}');`,{allowFailure:true}),/BUSINESS_PRIVATE_PROJECT_DENIED/,'private membership isolation after restore');
  console.log('PASS empty-target restore fails closed on missing node prerequisite and atomically rolls back partial effects');
  console.log('PASS restore preserves projects/private membership, IDs, revisions, event-chain head, authenticated access policy and contextDigest');
  console.log('BUSINESS_S4B_BACKUP_POSTGRES=PASS');
}finally{
  run(['rm','-f',container],{allowFailure:true});key.fill(0);wrongKey.fill(0);rmSync(root,{recursive:true,force:true});console.log('test_only_fixture_cleanup=COMPLETE');
}
