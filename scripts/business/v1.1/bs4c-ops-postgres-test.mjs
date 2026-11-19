import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import {chmodSync,mkdtempSync,mkdirSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {BusinessV11MaintenancePostgres} from './ops/business-v11-maintenance-postgres.mjs';
import {BusinessV11Operator} from './ops/business-v11-operator.mjs';
import {businessContinuityLogicalDigest,normalizeBusinessContinuityLogicalSnapshot} from './backup/business-continuity-logical-contract.mjs';

const repo=fileURLToPath(new URL('../../../',import.meta.url));
const root=mkdtempSync(join(tmpdir(),'chatagent-business-bs4c-pg-'));chmodSync(root,0o700);const backups=join(root,'backups');mkdirSync(backups,{mode:0o700});
const org='chatagent-business-v11-bs0',admin='54000000-0000-4000-8000-000000000001',member='54000000-0000-4000-8000-000000000002';
const container='chatagent-business-bs4c-pg16-'+process.pid,key=randomBytes(32);
const migrations=[
 'supabase/migrations/20261007161000_business_v11_bs1_control_foundation.sql','supabase/migrations/20261007162500_business_v11_bs1_control_fk_indexes.sql',
 'supabase/migrations/20261007170000_business_v11_bs1_member_identity.sql','supabase/migrations/20261007190000_business_v11_bs1_runtime_node_lifecycle.sql',
 'supabase/migrations/20261007230000_business_v11_bs2_project_policy_prereqs.sql','supabase/migrations/20261007231500_business_v11_bs2_continuity_foundation.sql',
 'supabase/migrations/20261007232500_business_v11_bs2_continuity_fk_indexes.sql','supabase/migrations/20261007234500_business_v11_bs2_completion_context_search.sql',
 'supabase/migrations/20261008003000_business_v11_bs2_handoff_export.sql','supabase/migrations/20261008004500_business_v11_bs2_project_key_rpc_adapters.sql',
 'supabase/migrations/20261008005500_business_v11_bs2_public_rpc_surface_lockdown.sql'
].map(x=>readFileSync(join(repo,x),'utf8'));
const bootstrap=readFileSync(join(repo,'scripts/business/v1.1/control/bs1b-bootstrap-single-admin-staging.sql'),'utf8');
const backupSql=readFileSync(join(repo,'scripts/business/v1.1/backup/bs4b-logical-backup-restore.sql'),'utf8');
const run=(args,{input=null,allowFailure=false}={})=>{const out=spawnSync('docker',args,{input,encoding:'utf8',maxBuffer:32*1024*1024});if(!allowFailure&&(out.error||out.status!==0))throw Error(String(out.stderr||out.error?.message||'DOCKER_TEST_FAILED'));return out;};
const psql=(sql,{allowFailure=false}={})=>run(['exec','-i',container,'psql','-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-U','postgres','-d','postgres'],{input:sql,allowFailure});
const line=out=>String(out.stdout).trim().split(/\r?\n/).filter(Boolean).at(-1)??'';
const json=out=>JSON.parse(line(out));
const claims=user=>`set request.jwt.claims='{"sub":"${user}"}'; set role authenticated;\n`;
const authSql=(user,sql)=>psql(claims(user)+sql);
const fixture=`create role anon nologin;create role authenticated nologin;create schema auth;
create table auth.users(id uuid primary key,email text,confirmed_at timestamptz,is_anonymous boolean not null default false,raw_user_meta_data jsonb not null default '{}'::jsonb);
create or replace function auth.jwt() returns jsonb language sql stable set search_path='' as $$ select coalesce(nullif(pg_catalog.current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;
create or replace function auth.uid() returns uuid language sql stable set search_path='' as $$ select nullif(auth.jwt()->>'sub','')::uuid $$;create schema extensions;`;
try{
 run(['run','-d','--name',container,'-e','POSTGRES_PASSWORD=postgres','-e','POSTGRES_DB=postgres','-p','127.0.0.1::5432','postgres:16-alpine']);
 let ready=false,consecutive=0;for(let i=0;i<80;i++){const r=run(['exec',container,'pg_isready','-U','postgres'],{allowFailure:true});const sqlProbe=r.status===0?psql('select 1;',{allowFailure:true}):null;consecutive=r.status===0&&sqlProbe?.status===0?consecutive+1:0;if(consecutive>=3){ready=true;break;}Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,150);}assert.equal(ready,true);
 psql(fixture);for(const sql of migrations.slice(0,3))psql(sql);psql(`insert into auth.users(id,email,confirmed_at) values('${admin}','admin@example.test',now());`);psql(bootstrap);
 psql(`insert into auth.users(id,email,confirmed_at) values('${member}','member@example.test',now());insert into private_business_control.organization_members(organization_id,user_id,role,member_state) select id,'${member}','MEMBER','ACTIVE' from private_business_control.organizations;`);
 for(const sql of migrations.slice(3))psql(sql);psql(backupSql);
 const project=json(authSql(admin,`select public.bc_project_register('ops-project','Ops Project','${randomUUID()}','STANDARD','TEAM');`));
 const task=json(authSql(member,`select public.bc_task_start('ops-project','B-S4C operator backup objective','${randomUUID()}',null,array['ops']);`));
 authSql(member,`select public.bc_checkpoint_append('ops-project','${task.taskId}',0,'Ops checkpoint','Ready for encrypted operator backup','${randomUUID()}',array['restore'],'ops verified',array['operator integration'],array['backup fact'],array['docs/ops'],null);`);
 const original=normalizeBusinessContinuityLogicalSnapshot(json(psql(`select private_business_continuity._backup_export('${org}');`))),digest=businessContinuityLogicalDigest(original);
 const portText=run(['port',container,'5432/tcp']).stdout.trim(),port=Number(portText.match(/:(\d+)$/)?.[1]);assert.ok(port>0);
 const maintenance=new BusinessV11MaintenancePostgres({connectionString:`postgresql://postgres:postgres@127.0.0.1:${port}/postgres`,allowInsecureLocal:true,timeoutMs:10000});
 const keyStore={read:()=>Buffer.from(key),loadOrCreate:()=>Buffer.from(key)};
 let continuityReady=true;
 const operator=new BusinessV11Operator({organizationId:org,backupsDir:backups,keyStore,maintenance,
  runtimeProbe:async()=>({ready:true,status:'READY'}),continuityProbe:async()=>continuityReady?{ready:true,status:'AUTHENTICATED_RPC_READY',organizationId:org}:Promise.reject(Error('BUSINESS_BACKEND_UNAVAILABLE'))});
 const normal=await operator.status();assert.equal(normal.mode,'NORMAL');const healthyDoctor=await operator.doctor();assert.equal(healthyDoctor.ok,true);
 const backup=await operator.backup({name:'ops-integration'});assert.equal(backup.logicalDigest,digest);assert.equal(backup.counts.tasks,1);
 const orgId=line(psql(`select id from private_business_control.organizations where slug='${org}';`));
 psql(`delete from private_business_continuity.events where organization_id='${orgId}';delete from private_business_continuity.checkpoints where organization_id='${orgId}';delete from private_business_continuity.tasks where organization_id='${orgId}';delete from private_business_continuity.operations where organization_id='${orgId}';delete from private_business_continuity.continuity_state where organization_id='${orgId}';delete from private_business_control.private_project_members where organization_id='${orgId}';delete from private_business_control.logical_projects where organization_id='${orgId}';`);
 const before=await maintenance.inspectTarget({organizationId:org});assert.deepEqual({...before,organizationId:undefined},{organizationId:undefined,projects:0,privateMemberships:0,tasks:0,checkpoints:0,operations:0,events:0,contextSeq:0});
 const restored=await operator.restore({archiveName:'ops-integration.bcbak',incidentRef:'INC-BS4C-001',expectedLogicalDigest:digest,confirmOrganizationId:org,actorUserId:admin});
 assert.equal(restored.reconciled,true);assert.equal(restored.logicalDigest,digest);const after=normalizeBusinessContinuityLogicalSnapshot(await maintenance.exportSnapshot({organizationId:org}));assert.deepEqual(after,original);
 await assert.rejects(()=>operator.restore({archiveName:'ops-integration.bcbak',incidentRef:'INC-BS4C-002',expectedLogicalDigest:digest,confirmOrganizationId:org,actorUserId:admin}),/BUSINESS_RESTORE_TARGET_NOT_EMPTY/);
 continuityReady=false;const degraded=await operator.status();assert.equal(degraded.mode,'DEGRADED_CONTINUITY');assert.equal(degraded.localWork,'AVAILABLE');assert.equal(degraded.continuityMutation,'FAIL_CLOSED');
 console.log('PASS concrete pg maintenance transport performs operator backup -> loss -> explicit empty-target restore -> exact logical reconciliation');
 console.log('PASS Status/Doctor report healthy state and Status switches to DEGRADED_CONTINUITY without disabling local work');
 console.log('BUSINESS_S4C_OPS_POSTGRES=PASS');
}finally{run(['rm','-f',container],{allowFailure:true});key.fill(0);rmSync(root,{recursive:true,force:true});console.log('test_only_fixture_cleanup=COMPLETE');}
