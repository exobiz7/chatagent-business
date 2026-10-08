import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {SENSITIVE_TEXT_PATTERN,assertContinuitySafe} from './continuity/sensitive-text-guard.mjs';

const repo=fileURLToPath(new URL('../../../',import.meta.url));
const project=readFileSync(repo+'/supabase/migrations/20261007230000_business_v11_bs2_project_policy_prereqs.sql','utf8');
const continuity=readFileSync(repo+'/supabase/migrations/20261007231500_business_v11_bs2_continuity_foundation.sql','utf8');
const indexes=readFileSync(repo+'/supabase/migrations/20261007232500_business_v11_bs2_continuity_fk_indexes.sql','utf8');
const frozen=JSON.parse(readFileSync(repo+'/docs/verification/v1.1/B_S0_SUPABASE_SCHEMA_RPC_CONTRACT.json','utf8'));

const tables=[...continuity.matchAll(/create table if not exists private_business_continuity\.([a-z_]+)/g)].map(x=>x[1]);
assert.deepEqual(tables,frozen.schemas.continuity.tables,'continuity table inventory drifted from frozen B-S0 contract');
assert.doesNotMatch(continuity,/private_business_continuity\.logical_projects|create table[^;]*continuity_projects/i,'continuity must not duplicate logical project master');
assert.match(continuity,/references private_business_control\.logical_projects/);

for(const name of ['bc_project_register','bc_project_set_mode','bc_private_member_add','bc_private_member_remove'])
  assert.match(project,new RegExp(`function public\\.${name}\\(`),`missing frozen control RPC ${name}`);
for(const name of ['bc_task_start','bc_checkpoint_append','bc_task_get'])
  assert.match(continuity,new RegExp(`function public\\.${name}\\(`),`missing B-S2A continuity RPC ${name}`);
for(const deferred of ['bc_task_complete','bc_project_context','bc_history_search','bc_export_snapshot','bc_import_snapshot'])
  assert.doesNotMatch(continuity,new RegExp(`function public\\.${deferred}\\(`),`B-S2A must not prematurely implement ${deferred}`);

assert.match(project,/p_collaboration_mode text default 'TEAM'/);
assert.match(project,/BUSINESS_PRIVATE_PROJECT_DENIED/);
assert.match(continuity,/BUSINESS_CONTINUITY_SENSITIVE_TEXT/);
assert.match(continuity,/BUSINESS_IDEMPOTENCY_CONFLICT/);
assert.match(continuity,/BUSINESS_REVISION_CONFLICT/);
assert.match(continuity,/for update/);
assert.match(continuity,/TASK_STARTED/);
assert.match(continuity,/CHECKPOINT_APPENDED/);
assert.match(continuity,/head_sha256/);
assert.match(continuity,/context_seq/);

for(const table of frozen.schemas.continuity.tables){
  assert.match(continuity,new RegExp(`alter table private_business_continuity\\.${table} enable row level security`));
}
for(const name of [
  'continuity_tasks_created_by_idx','continuity_tasks_assigned_to_idx','continuity_tasks_completed_by_idx',
  'continuity_checkpoints_project_idx','continuity_checkpoints_source_user_idx','continuity_checkpoints_source_node_idx',
  'continuity_events_task_idx','continuity_events_checkpoint_idx','continuity_events_actor_idx'
]) assert.match(indexes,new RegExp(`create index if not exists ${name}`));
assert.match(continuity,/revoke all on schema private_business_continuity from public,anon,authenticated/);
assert.match(continuity,/revoke all on all tables in schema private_business_continuity from public,anon,authenticated/);

const donor='(?:\\bsk-[A-Za-z0-9_-]{8,}|\\bgh[pousr]_[A-Za-z0-9_]{8,}|\\bBearer\\s+\\S+|\\bpassword\\s*[:=]|\\bapi[_-]?key\\s*[:=]|-----BEGIN\\s+\\w+\\s+PRIVATE KEY)';
assert.equal(SENSITIVE_TEXT_PATTERN.source,donor,'Personal sensitive-text pattern drifted');
for(const sample of ['password=hunter2','api_key: abcdefgh','Bearer abc.def.ghi','sk-abcdefghijk','ghp_abcdefghijk','-----BEGIN RSA PRIVATE KEY'])
  assert.throws(()=>assertContinuitySafe({value:sample}),/BUSINESS_CONTINUITY_SENSITIVE_TEXT/);
assert.doesNotThrow(()=>assertContinuitySafe({summary:'Normal team checkpoint',facts:['CI is green']}));

console.log('PASS frozen six-table continuity schema references control logical_projects only');
console.log('PASS frozen project policy prerequisites implement TEAM default and PRIVATE explicit membership');
console.log('PASS B-S2A task/checkpoint core preserves idempotency, revision CAS, event/head sequence and direct-table denial');
console.log('PASS Personal sensitive-text guard pattern is reused before cloud persistence');
console.log('BUSINESS_S2A_CONTINUITY_CONTRACT=PASS');
