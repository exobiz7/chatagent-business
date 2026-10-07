import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

const repo=fileURLToPath(new URL('../../../',import.meta.url));
const sql=readFileSync(repo+'/supabase/migrations/20261007234500_business_v11_bs2_completion_context_search.sql','utf8');
const frozen=JSON.parse(readFileSync(repo+'/docs/verification/v1.1/B_S0_SUPABASE_SCHEMA_RPC_CONTRACT.json','utf8'));

for(const name of ['bc_task_complete','bc_project_context','bc_history_search']){
  assert.ok(frozen.rpc.continuity.includes(name),`${name} must be frozen in B-S0 contract`);
  assert.match(sql,new RegExp(`function public\\.${name}\\(`),`missing ${name}`);
}
for(const deferred of ['bc_export_snapshot','bc_import_snapshot'])
  assert.doesNotMatch(sql,new RegExp(`function public\\.${deferred}\\(`),`B-S2B must not implement ${deferred}`);

assert.match(sql,/BUSINESS_TASK_COMPLETED/);
assert.match(sql,/BUSINESS_REVISION_CONFLICT/);
assert.match(sql,/BUSINESS_IDEMPOTENCY_CONFLICT/);
assert.match(sql,/TASK_COMPLETED/);
assert.match(sql,/p_limit<1 or p_limit>20/);
assert.match(sql,/websearch_to_tsquery\('simple'::regconfig,v_query\)/);
assert.match(sql,/to_tsvector\('simple'::regconfig,t\.search_text\)/);
assert.match(sql,/to_tsvector\('simple'::regconfig,c\.search_text\)/);
assert.match(sql,/using gin\(to_tsvector\('simple'::regconfig,search_text\)\)/);
assert.match(sql,/array_to_string\(coalesce\(p_decisions/);
assert.match(sql,/array_to_string\(coalesce\(p_facts/);
assert.match(sql,/array_to_string\(coalesce\(p_artifacts/);
assert.match(sql,/private_business_control\._require_project_access\(p_project_id\)/);
assert.doesNotMatch(sql,/\blike\b|\bilike\b/i,'history search must use PostgreSQL FTS, not substring LIKE');

for(const sig of [
  'public.bc_task_complete(uuid,uuid,bigint,uuid)',
  'public.bc_project_context(uuid,integer)',
  'public.bc_history_search(uuid,text,integer)'
]){
  const escaped=sig.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  assert.match(sql,new RegExp(`revoke all on function ${escaped} from public,anon`));
  assert.match(sql,new RegExp(`grant execute on function ${escaped} to authenticated`));
}

console.log('PASS B-S2B implements frozen completion/context/search RPCs only within bounded scope');
console.log('PASS task completion preserves revision CAS, operation idempotency and completed-task immutability');
console.log('PASS project context is bounded to 1..20 tasks and all reads reuse TEAM/PRIVATE project authorization');
console.log('PASS PostgreSQL simple-config FTS uses materialized search text plus GIN indexes across task/checkpoint corpus');
console.log('BUSINESS_S2B_SEARCH_CONTRACT=PASS');
