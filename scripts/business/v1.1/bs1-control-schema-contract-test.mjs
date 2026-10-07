import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname,resolve} from 'node:path';

const here=dirname(fileURLToPath(import.meta.url));
const root=resolve(here,'../../..');
const foundation=readFileSync(resolve(root,'supabase/migrations/20261007161000_business_v11_bs1_control_foundation.sql'),'utf8');
const indexes=readFileSync(resolve(root,'supabase/migrations/20261007162500_business_v11_bs1_control_fk_indexes.sql'),'utf8');
const sql=foundation+'\n'+indexes;
const frozen=JSON.parse(readFileSync(resolve(root,'docs/verification/v1.1/B_S0_SUPABASE_SCHEMA_RPC_CONTRACT.json'),'utf8'));

assert.equal(frozen.schemas.control.name,'private_business_control');
const expectedTables=[...frozen.schemas.control.tables].sort();
const tables=[...foundation.matchAll(/create table if not exists private_business_control\.([a-z0-9_]+)/g)].map(m=>m[1]).sort();
assert.deepEqual(tables,expectedTables,'B-S1A control table inventory drifted from frozen B-S0 contract');

assert.match(foundation,/create schema if not exists private_business_control;/);
assert.doesNotMatch(sql,/create schema if not exists private_business_continuity;/,'B-S1A must not implement B-S2 continuity');
assert.match(foundation,/role in \('ADMIN','PM','MEMBER'\)/);
assert.match(foundation,/node_type in \('PERSONAL_NODE','SHARED_NODE'\)/);
assert.match(foundation,/lifecycle in \('PENDING','APPROVED','REVOKED'\)/);
assert.match(foundation,/collaboration_mode in \('TEAM','PRIVATE'\)/);
assert.match(foundation,/project_profile in \('READ_ONLY','SAFE','STANDARD'\)/);
assert.match(foundation,/node_type='PERSONAL_NODE' and owner_user_id is not null and shared_host_power_enabled=false/);
assert.match(foundation,/node_type='SHARED_NODE' and owner_user_id is null/);
assert.match(foundation,/singleton boolean not null default true unique check \(singleton\)/,'one organization per Supabase project must be structurally enforced');

for(const table of expectedTables){
  assert.match(foundation,new RegExp(`alter table private_business_control\\.${table} enable row level security;`),`RLS missing:${table}`);
}
for(const role of ['public','anon','authenticated']){
  assert.match(foundation,new RegExp(`revoke all on (?:all tables in schema private_business_control|schema private_business_control) from ${role};`),`direct grant boundary missing:${role}`);
}
assert.doesNotMatch(sql,/grant\s+.*service_role/i,'runtime service_role grant is forbidden');

assert.ok(frozen.rpc.control.includes('bc_schema_status'));
assert.match(foundation,/create or replace function public\.bc_schema_status\(\)/);
assert.match(foundation,/security definer/);
assert.match(foundation,/grant execute on function public\.bc_schema_status\(\) to authenticated;/);
assert.match(foundation,/revoke all on function public\.bc_schema_status\(\) from anon;/);
for(const deferred of frozen.rpc.control.filter(name=>name!=='bc_schema_status')){
  assert.doesNotMatch(foundation,new RegExp(`create or replace function public\\.${deferred}\\(`),`DEFERRED_RPC_IMPLEMENTED_TOO_EARLY:${deferred}`);
}
for(const rpc of frozen.rpc.continuity){
  assert.doesNotMatch(sql,new RegExp(`public\\.${rpc}\\(`),`CONTINUITY_RPC_MUST_WAIT_FOR_BS2:${rpc}`);
}

assert.match(foundation,/operation_id uuid not null/);
assert.match(foundation,/input_sha256 text not null/);
const requiredFkIndexes=[
  'organization_members_user_idx','runtime_nodes_owner_member_idx','runtime_nodes_enrolled_by_idx',
  'runtime_nodes_approved_by_idx','runtime_nodes_revoked_by_idx','runtime_sessions_member_idx',
  'logical_projects_created_by_idx','private_project_members_member_idx','private_project_members_granted_by_idx'
];
for(const index of requiredFkIndexes)assert.match(indexes,new RegExp(`create index if not exists ${index}`),`FK index missing:${index}`);

console.log(`PASS frozen control tables exact count=${expectedTables.length}`);
console.log('PASS minimal roles/node lifecycle/project modes and PERSONAL_NODE owner invariant');
console.log('PASS private direct-table denial + RLS + no runtime service_role grant');
console.log('PASS only authenticated read-only bc_schema_status is implemented in B-S1A');
console.log(`PASS FK covering indexes count=${requiredFkIndexes.length}`);
console.log('PASS later B-S1 RPCs and B-S2 continuity remain deferred');
console.log('BUSINESS_S1A_CONTROL_CONTRACT=PASS');
