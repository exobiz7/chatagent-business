import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname,resolve} from 'node:path';

const here=dirname(fileURLToPath(import.meta.url));
const root=resolve(here,'../../..');
const sql=readFileSync(resolve(root,'supabase/migrations/20261007170000_business_v11_bs1_member_identity.sql'),'utf8');
const bootstrap=readFileSync(resolve(root,'scripts/business/v1.1/control/bs1b-bootstrap-single-admin-staging.sql'),'utf8');

assert.match(sql,/create or replace function private_business_control\._current_member\(\)/i);
assert.match(sql,/v_user := auth\.uid\(\)/i,'validated auth identity must be authoritative');
assert.doesNotMatch(sql,/p_member|p_user|member_id\s+uuid\s*\)/i,'member identity must not be caller supplied');
assert.match(sql,/BUSINESS_MEMBER_NOT_FOUND/);
assert.match(sql,/BUSINESS_MEMBER_REVOKED/);
assert.match(sql,/create or replace function public\.bc_member_profile\(\)/i);
assert.match(sql,/extensions\.digest\(/i);
assert.match(sql,/organization_slug[\s\S]*decode\('00',\s*'hex'\)[\s\S]*member_user_id/i,'profile ID must bind organization + NUL + auth subject');
assert.match(sql,/'prf_'\s*\|\|\s*substr/i);
assert.match(sql,/jsonb_build_object\([\s\S]*'id'[\s\S]*'name'[\s\S]*'email'[\s\S]*'nickname'/i);
assert.match(sql,/grant execute on function public\.bc_member_profile\(\) to authenticated;/i);
assert.match(sql,/revoke all on function public\.bc_member_profile\(\) from public, anon;/i);
assert.match(sql,/create or replace function public\.bc_schema_status\(\)/i);
assert.match(sql,/private_business_control\._current_member\(\)/i,'schema status must now require active membership');
assert.match(sql,/revoke all on function private_business_control\._current_member\(\) from public, anon, authenticated;/i);
assert.doesNotMatch(sql,/service_role/i,'runtime service role must not be introduced');
assert.match(bootstrap,/v_eligible_count <> 1/,'bootstrap must require exactly one eligible Auth user');
assert.match(bootstrap,/v_org_count <> 0 or v_member_count <> 0/,'bootstrap must refuse an initialized control plane');
assert.match(bootstrap,/confirmed_at is not null[\s\S]*coalesce\(is_anonymous,false\)=false/i);
assert.doesNotMatch(bootstrap,/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i,'bootstrap must not hardcode an Auth user UUID');
assert.match(bootstrap,/values \('chatagent-business-v11-bs0','ChatAgent Business'\)/);
assert.match(bootstrap,/values \(v_org,v_user,'ADMIN','ACTIVE'\)/);

console.log('PASS bc_member_profile derives identity exclusively from auth.uid() active membership');
console.log('PASS profile ID binds organization slug + NUL + auth subject with SHA-256');
console.log('PASS profile/schema RPCs are authenticated-only and private helper is not client-executable');
console.log('PASS non-member/revoked-member fail-closed codes are explicit and no service_role path exists');
console.log('PASS staging bootstrap is exactly-one-user, empty-control-plane, UUID-free and ADMIN fail-closed');
console.log('BUSINESS_S1B_MEMBER_IDENTITY_CONTRACT=PASS');
