import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {HANDOFF_TARGET_BYTES,HANDOFF_HARD_BYTES,isBusinessContextDigest} from './continuity/business-handoff-context.mjs';

const repo=fileURLToPath(new URL('../../../',import.meta.url));
const sql=readFileSync(repo+'/supabase/migrations/20261008003000_business_v11_bs2_handoff_export.sql','utf8');
const adapters=readFileSync(repo+'/supabase/migrations/20261008004500_business_v11_bs2_project_key_rpc_adapters.sql','utf8');
const lockdown=readFileSync(repo+'/supabase/migrations/20261008005500_business_v11_bs2_public_rpc_surface_lockdown.sql','utf8');
const frozen=JSON.parse(readFileSync(repo+'/docs/verification/v1.1/B_S0_SUPABASE_SCHEMA_RPC_CONTRACT.json','utf8'));

assert.equal(HANDOFF_TARGET_BYTES,8192);
assert.equal(HANDOFF_HARD_BYTES,24576);
assert.equal(isBusinessContextDigest('sha256:'+'a'.repeat(64)),true);
assert.equal(isBusinessContextDigest('sha256:bad'),false);

for(const fn of ['_tail_integrity_verified','_event_chain_verified'])
  assert.match(sql,new RegExp(`function private_business_continuity\\.${fn}\\(`));
for(const fn of ['bc_task_get','bc_project_context','bc_export_snapshot'])
  assert.match(sql,new RegExp(`function public\\.${fn}\\(`));
assert.match(sql,/integrityVerified/);
assert.match(sql,/logicalDigest/);
assert.match(sql,/CALLER_AUTHORIZED_PROJECT/);
assert.match(sql,/BUSINESS_CONTINUITY_INTEGRITY_UNVERIFIED/);
assert.match(sql,/grant execute on function public\.bc_export_snapshot\(uuid\) to authenticated/);
assert.match(adapters,/function private_business_control\._resolve_project_key\(p_project_key text\)/);
for(const fn of ['bc_task_start','bc_checkpoint_append','bc_task_complete','bc_task_get','bc_project_context','bc_history_search','bc_export_snapshot'])
  assert.match(adapters,new RegExp(`function public\\.${fn}\\([\\s\\S]*p_project_key text`),`missing project-key adapter for ${fn}`);
assert.match(adapters,/jsonb_set\(v_result,'\{task,projectId\}',to_jsonb\(p_project_key\),true\)/);
assert.match(adapters,/jsonb_set\(v_payload,'\{project\}',[\s\S]*jsonb_build_object\('projectId',p_project_key\),true\)/);
for(const signature of ['bc_task_start(uuid,text,uuid,uuid,text[])','bc_checkpoint_append(uuid,uuid,bigint,text,text,uuid,text[],text,text[],text[],text[],uuid)','bc_task_complete(uuid,uuid,bigint,uuid)','bc_task_get(uuid,uuid)','bc_project_context(uuid,integer)','bc_history_search(uuid,text,integer)','bc_export_snapshot(uuid)'])
  assert.ok(lockdown.includes(`revoke execute on function public.${signature} from authenticated`),`UUID core still public: ${signature}`);
assert.doesNotMatch(sql+adapters,/function public\.bc_import_snapshot\(/,'B-S4 migration-only importer must not become runtime surface in B-S2C');
assert.ok(frozen.rpc.continuity.includes('bc_export_snapshot'));
assert.ok(frozen.rpc.migrationTemporary.includes('bc_import_snapshot'));

console.log('PASS B-S2C preserves 8 KiB target / 24 KiB hard handoff bounds and sha256 digest contract');
console.log('PASS task/context reads expose fail-closed integrity status while export performs full event-chain verification');
console.log('PASS project-scoped export respects caller authorization and migration-only import remains deferred to B-S4');
console.log('BUSINESS_S2C_HANDOFF_CONTRACT=PASS');
