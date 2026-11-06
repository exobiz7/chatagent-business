import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {chmodSync,lstatSync,mkdtempSync,mkdirSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {BusinessRegistry} from '../business-core.mjs';
import {BusinessContinuity} from '../business-continuity.mjs';
import {assembleBusinessHandoff} from './continuity/business-handoff-context.mjs';
import {exportBusinessV1Continuity,validateBusinessV1MigrationBundle} from './migration/v1-sqlite-logical-export.mjs';

const repo=fileURLToPath(new URL('../../../',import.meta.url));
const base=mkdtempSync(join(tmpdir(),'chatagent-business-bs4a-'));chmodSync(base,0o700);
const state=join(base,'state'),p1=join(base,'project-alpha'),p2=join(base,'project-beta');
for(const p of [state,p1,p2])mkdirSync(p,{mode:0o700});
const org='chatagent-business-v11-bs0';
const registry=new BusinessRegistry(state,{initialize:true,organizationId:org,displayName:'Migration Fixture'});
registry.addProject({projectId:'migrate-alpha',displayName:'Migrate Alpha',hostRoot:p1,profile:'STANDARD'});
registry.addProject({projectId:'migrate-beta',displayName:'Migrate Beta',hostRoot:p2,profile:'SAFE'});
const continuity=new BusinessContinuity(registry,{root:join(state,'continuity')});
const alpha=continuity.startTask({projectId:'migrate-alpha',objective:'Preserve active migration context',operationId:randomUUID()});
continuity.checkpoint({projectId:'migrate-alpha',taskId:alpha.taskId,expectedTaskRevision:0,operationId:randomUUID(),summary:'Alpha checkpoint',currentState:'Alpha state ready',nextActions:['Import alpha'],verification:'alpha PASS',decisions:['retain digest'],facts:['alpha fact'],artifacts:['docs/alpha']});
const beta=continuity.startTask({projectId:'migrate-beta',objective:'Preserve completed migration context',operationId:randomUUID()});
continuity.checkpoint({projectId:'migrate-beta',taskId:beta.taskId,expectedTaskRevision:0,operationId:randomUUID(),summary:'Beta checkpoint',currentState:'Beta state ready',nextActions:['Close beta'],verification:'beta PASS',decisions:['complete beta'],facts:['beta fact'],artifacts:['docs/beta']});
continuity.completeTask({projectId:'migrate-beta',taskId:beta.taskId,expectedTaskRevision:1,operationId:randomUUID()});
const legacyDigests=new Map([
  [alpha.taskId,continuity.prepareHandoff({projectId:'migrate-alpha',taskId:alpha.taskId}).contextDigest],
  [beta.taskId,continuity.prepareHandoff({projectId:'migrate-beta',taskId:beta.taskId}).contextDigest]
]);
continuity.close();
const hash=p=>createHash('sha256').update(readFileSync(p)).digest('hex');
const protectedFiles=['registry.json','continuity/memory-seal.key','continuity/memory-head.json','continuity/memory.sqlite'];
const sourceHashes=new Map(protectedFiles.map(x=>[x,hash(join(state,x))]));

let bundle;
try{
  bundle=exportBusinessV1Continuity({sourceStateDir:state});
  validateBusinessV1MigrationBundle(bundle);
  const second=exportBusinessV1Continuity({sourceStateDir:state});
  assert.equal(second.logicalDigest,bundle.logicalDigest,'logical export must be deterministic apart from exportedAt');
  assert.equal(second.canonicalPayload,bundle.canonicalPayload);
  for(const [name,digest] of sourceHashes)assert.equal(hash(join(state,name)),digest,`export mutated source ${name}`);
  assert.equal(bundle.payload.counts.projects,2);assert.equal(bundle.payload.counts.tasks,2);assert.equal(bundle.payload.counts.checkpoints,2);
  assert.equal(bundle.payload.counts.operations,5);assert.equal(bundle.payload.counts.events,5);assert.equal(bundle.payload.counts.sourceRawEvents,7);
  assert.equal(JSON.stringify(bundle).includes(base),false,'migration bundle must never include source host paths');
  for(const project of bundle.payload.projects)for(const h of project.handoffDigests)assert.equal(h.contextDigest,legacyDigests.get(h.taskId),'exported handoff digest must equal v1.0 digest');
  const corrupt=structuredClone(bundle);corrupt.payload.projects[0].displayName='Tampered';
  assert.throws(()=>validateBusinessV1MigrationBundle(corrupt),/BUSINESS_MIGRATION_DIGEST_MISMATCH/);
  const cliOutput=join(base,'v1-logical-export.json');
  const cli=spawnSync(process.execPath,[join(repo,'scripts/business/v1.1/migration/bs4-export-v1-continuity.mjs'),'--source-state-dir',state,'--output',cliOutput],{encoding:'utf8',maxBuffer:16*1024*1024});
  assert.equal(cli.status,0,cli.stderr);assert.equal(lstatSync(cliOutput).mode&0o777,0o600);
  const cliBundle=JSON.parse(readFileSync(cliOutput,'utf8'));assert.equal(cliBundle.logicalDigest,bundle.logicalDigest);
  const cliSummary=JSON.parse(cli.stdout.trim());assert.equal(cliSummary.logicalDigest,bundle.logicalDigest);assert.equal(JSON.stringify(cliSummary).includes(base),false);
  const overwrite=spawnSync(process.execPath,[join(repo,'scripts/business/v1.1/migration/bs4-export-v1-continuity.mjs'),'--source-state-dir',state,'--output',cliOutput],{encoding:'utf8'});
  assert.notEqual(overwrite.status,0);assert.match(overwrite.stderr,/BUSINESS_MIGRATION_OUTPUT_EXISTS/);
  console.log('PASS read-only v1 SQLite export verifies HMAC source and preserves source bytes/deterministic logical digest');
  console.log('PASS exporter normalizes PROJECT events into control projects while preserving 5 continuity operations/events and v1 handoff digests');

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
  const importer=readFileSync(join(repo,'scripts/business/v1.1/migration/bs4-one-time-import.sql'),'utf8');
  const retire=readFileSync(join(repo,'scripts/business/v1.1/migration/bs4-retire-one-time-import.sql'),'utf8');
  const container='chatagent-business-bs4a-pg16-'+process.pid,admin='52000000-0000-4000-8000-000000000001';
  const run=(args,{input=null,allowFailure=false}={})=>{const out=spawnSync('docker',args,{input,encoding:'utf8',maxBuffer:24*1024*1024});if(!allowFailure&&(out.error||out.status!==0))throw Error(String(out.stderr||out.error?.message||'DOCKER_TEST_FAILED'));return out;};
  const psql=(sql,{allowFailure=false}={})=>run(['exec','-i',container,'psql','-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-U','postgres','-d','postgres'],{input:sql,allowFailure});
  const claims=user=>`set request.jwt.claims='{"sub":"${user}"}'; set role authenticated;\n`;
  const authSql=(user,sql,opts={})=>psql(claims(user)+sql,opts);
  const line=out=>String(out.stdout).trim().split(/\r?\n/).filter(Boolean).at(-1)??'';
  const json=out=>JSON.parse(line(out));
  const q=s=>s.replaceAll("'","''");
  const fixture=`create role anon nologin; create role authenticated nologin; create schema auth;\ncreate table auth.users(id uuid primary key,email text,confirmed_at timestamptz,is_anonymous boolean not null default false,raw_user_meta_data jsonb not null default '{}'::jsonb);\ncreate or replace function auth.jwt() returns jsonb language sql stable set search_path='' as $$ select coalesce(nullif(pg_catalog.current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;\ncreate or replace function auth.uid() returns uuid language sql stable set search_path='' as $$ select nullif(auth.jwt()->>'sub','')::uuid $$;\ncreate schema extensions;`;
  const readyProbe=run(['version','--format','{{.Server.Version}}'],{allowFailure:true});if(readyProbe.error||readyProbe.status!==0)throw Error('BUSINESS_S4A_POSTGRES16_REQUIRES_DOCKER');
  try{
    run(['run','-d','--name',container,'-e','POSTGRES_PASSWORD=postgres','-e','POSTGRES_DB=postgres','postgres:16-alpine']);
    let ready=false,consecutive=0;for(let i=0;i<80;i++){const r=run(['exec',container,'pg_isready','-U','postgres'],{allowFailure:true});const sqlProbe=r.status===0?psql('select 1;',{allowFailure:true}):null;consecutive=r.status===0&&sqlProbe?.status===0?consecutive+1:0;if(consecutive>=3){ready=true;break;}Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,200);}assert.equal(ready,true,'PostgreSQL 16 fixture did not become stably ready');
    psql(fixture);for(const sql of migrations.slice(0,3))psql(sql);psql(`insert into auth.users(id,email,confirmed_at) values('${admin}','admin@example.test',now());`);psql(bootstrap);for(const sql of migrations.slice(3))psql(sql);psql(importer);
    assert.equal(line(psql(`select has_function_privilege('authenticated','public.bc_import_snapshot(jsonb,uuid)','EXECUTE');`)),'f','temporary importer must not be authenticated-runtime callable');
    const snap=JSON.stringify(bundle);assert.equal(snap.includes('$snapshot$'),false);
    const receipt=json(psql(`select public.bc_import_snapshot($snapshot$${snap}$snapshot$::jsonb,'${admin}');`));
    assert.equal(receipt.imported,true);assert.equal(receipt.integrityVerified,true);assert.deepEqual(receipt.counts,{events:5,tasks:2,projects:2,operations:5,checkpoints:2});
    const replay=psql(`select public.bc_import_snapshot($snapshot$${snap}$snapshot$::jsonb,'${admin}');`,{allowFailure:true});assert.notEqual(replay.status,0);assert.match(replay.stderr,/BUSINESS_MIGRATION_TARGET_NOT_EMPTY/);
    for(const project of bundle.payload.projects){
      const exported=json(authSql(admin,`select public.bc_export_snapshot('${q(project.projectKey)}');`));
      assert.equal(exported.integrityVerified,true);assert.match(exported.logicalDigest,/^sha256:[a-f0-9]{64}$/);
      assert.equal(exported.project.projectId,project.projectKey);assert.equal(exported.project.projectProfile,project.projectProfile);
      assert.equal(exported.counts.tasks,project.tasks.length);assert.equal(exported.counts.checkpoints,project.checkpoints.length);
      const projectEvents=bundle.payload.sourceEvents.filter(x=>x.projectKey===project.projectKey).length;
      assert.equal(exported.counts.operations,projectEvents);assert.equal(exported.counts.events,projectEvents);
      assert.deepEqual(exported.tasks.map(x=>x.taskId).sort(),project.tasks.map(x=>x.taskId).sort());
      for(const task of project.tasks){
        const taskResult=json(authSql(admin,`select public.bc_task_get('${q(project.projectKey)}','${task.taskId}');`));
        assert.equal(taskResult.task.taskId,task.taskId);assert.equal(taskResult.task.revision,task.revision);assert.equal(taskResult.task.status,task.status);
        const targetHandoff=assembleBusinessHandoff({organizationId:org,taskResult});
        assert.equal(targetHandoff.contextDigest,legacyDigests.get(task.taskId),'v1 -> v1.1 handoff digest changed across migration');
      }
    }
    assert.equal(line(psql(`select private_business_continuity._event_chain_verified((select id from private_business_control.organizations limit 1));`)),'t');
    console.log('PASS disposable PostgreSQL16 one-time import preserves project/task/checkpoint identity, revisions and reconstructed event-chain integrity');
    console.log('PASS authenticated readback/export counts reconcile with normalized v1 source and every migrated task preserves the v1.0 contextDigest');
    psql(retire);assert.equal(Number(line(psql(`select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='bc_import_snapshot';`))),0);
    console.log('PASS one-time migration surface is retired after accepted disposable import rehearsal');
  } finally {run(['rm','-f',container],{allowFailure:true});}
  for(const [name,digest] of sourceHashes)assert.equal(hash(join(state,name)),digest,`migration rehearsal mutated source ${name}`);
  console.log('BUSINESS_S4A_MIGRATION_POSTGRES=PASS');
} finally {rmSync(base,{recursive:true,force:true});console.log('test_only_fixture_cleanup=COMPLETE');}
