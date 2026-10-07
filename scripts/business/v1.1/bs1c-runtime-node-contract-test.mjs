import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname,resolve} from 'node:path';

const here=dirname(fileURLToPath(import.meta.url));
const root=resolve(here,'../../..');
const sql=readFileSync(resolve(root,'supabase/migrations/20261007190000_business_v11_bs1_runtime_node_lifecycle.sql'),'utf8');
const frozen=JSON.parse(readFileSync(resolve(root,'docs/verification/v1.1/B_S0_SUPABASE_SCHEMA_RPC_CONTRACT.json'),'utf8'));

const runtimeRpc=['bc_runtime_enroll','bc_runtime_status','bc_runtime_list','bc_runtime_revoke'];
for(const name of runtimeRpc){
  assert.ok(frozen.rpc.control.includes(name),`frozen control RPC missing ${name}`);
  assert.match(sql,new RegExp(`create or replace function public\\.${name}\\(`,'i'));
}

assert.match(sql,/create unique index if not exists runtime_sessions_org_node_user_uidx/i);
assert.match(sql,/select \* into v_member from private_business_control\._current_member\(\)/i);
assert.doesNotMatch(sql,/p_owner|p_member|p_user_id/i,'caller must not supply authoritative owner/member identity');
assert.match(sql,/case when p_node_type='PERSONAL_NODE' then v_member\.member_user_id else null end/i);
assert.match(sql,/p_node_type='SHARED_NODE' and v_member\.member_role <> 'ADMIN'/i);
assert.match(sql,/p_approve and v_member\.member_role <> 'ADMIN'/i);
assert.match(sql,/set lifecycle='APPROVED'/i);
assert.match(sql,/set lifecycle='REVOKED'/i);
assert.match(sql,/shared_host_power_enabled=case when node_type='SHARED_NODE'/i);
assert.match(sql,/BUSINESS_PERSONAL_NODE_OWNER_MISMATCH/);
assert.match(sql,/BUSINESS_IDEMPOTENCY_CONFLICT/);
assert.match(sql,/operation_kind.*runtime_enroll/is);
assert.match(sql,/operation_kind.*runtime_revoke/is);
assert.match(sql,/authorization_lease_seconds/i);
assert.match(sql,/on conflict \(organization_id,runtime_node_id,user_id\) do update/i);
assert.match(sql,/session_state='REVOKED'/i);
assert.match(sql,/policy_revision=policy_revision\+1/i);
assert.match(sql,/grant execute on function public\.bc_runtime_enroll[\s\S]*to authenticated;/i);
assert.match(sql,/grant execute on function public\.bc_runtime_status[\s\S]*to authenticated;/i);
assert.match(sql,/grant execute on function public\.bc_runtime_list[\s\S]*to authenticated;/i);
assert.match(sql,/grant execute on function public\.bc_runtime_revoke[\s\S]*to authenticated;/i);
assert.doesNotMatch(sql,/service_role/i);
assert.doesNotMatch(sql,/private_business_continuity/i);

console.log('PASS frozen B-S1 runtime RPC names implemented without expanding public control contract');
console.log('PASS PERSONAL_NODE owner derives only from auth.uid() and SHARED/approval/revoke require ADMIN');
console.log('PASS enroll/revoke operation UUID idempotency and policy-revision mutation are explicit');
console.log('PASS status heartbeat mints bounded runtime lease and revoke invalidates runtime sessions');
console.log('BUSINESS_S1C_RUNTIME_NODE_CONTRACT=PASS');
