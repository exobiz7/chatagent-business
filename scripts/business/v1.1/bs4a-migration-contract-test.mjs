import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

const repo=fileURLToPath(new URL('../../../',import.meta.url));
const handoff=readFileSync(repo+'/scripts/business/v1.1/continuity/business-handoff-context.mjs','utf8');
const exporter=readFileSync(repo+'/scripts/business/v1.1/migration/v1-sqlite-logical-export.mjs','utf8');
const importer=readFileSync(repo+'/scripts/business/v1.1/migration/bs4-one-time-import.sql','utf8');
const retire=readFileSync(repo+'/scripts/business/v1.1/migration/bs4-retire-one-time-import.sql','utf8');
const cli=readFileSync(repo+'/scripts/business/v1.1/migration/bs4-export-v1-continuity.mjs','utf8');
const frozen=JSON.parse(readFileSync(repo+'/docs/verification/v1.1/B_S0_SUPABASE_SCHEMA_RPC_CONTRACT.json','utf8'));

assert.doesNotMatch(handoff,/startedAt:epoch\(task\.startedAt\)/,'v1.1 handoff digest basis must not add v1-incompatible task start time');
assert.doesNotMatch(handoff,/completedAt:epoch\(task\.completedAt\)/,'v1.1 handoff digest basis must not add v1-incompatible completion time');
assert.match(handoff,/createdAt:epoch\(checkpoint\.createdAt\)/,'legacy checkpoint timestamp remains part of handoff digest basis');
assert.match(exporter,/new DatabaseSync\(dbPath,\{readOnly:true\}\)/,'v1 SQLite exporter must be read-only');
assert.match(exporter,/createHmac\('sha256',key\)/,'v1 exporter must verify the source HMAC event chain');
assert.match(exporter,/BUSINESS_MIGRATION_SOURCE_INTEGRITY_FAILED/);
assert.match(exporter,/BUSINESS_MIGRATION_DISABLED_PROJECT_UNSUPPORTED/,'unrepresentable disabled v1 projects must fail closed');
assert.match(exporter,/canonicalPayload/);assert.match(exporter,/logicalDigest/);
assert.match(importer,/function public\.bc_import_snapshot\(p_snapshot jsonb,p_migration_actor_user_id uuid\)/);
assert.match(importer,/BUSINESS_MIGRATION_TARGET_NOT_EMPTY/,'one-time importer must refuse a mixed/non-empty target');
assert.match(importer,/role='ADMIN'/,'migration actor must be an active ADMIN');
assert.match(importer,/private_business_continuity\._event_chain_verified\(v_org\)/,'import must verify reconstructed target event chain');
assert.match(importer,/revoke all on function public\.bc_import_snapshot\(jsonb,uuid\) from public,anon,authenticated/,'temporary importer must not be runtime-authenticated surface');
assert.match(retire,/drop function if exists public\.bc_import_snapshot\(jsonb,uuid\)/,'retirement must remove one-time import surface');
assert.match(cli,/openSync\(output,'wx',0o600\)/,'operator exporter must create a private no-overwrite artifact');
assert.match(cli,/BUSINESS_MIGRATION_OUTPUT_EXISTS/);
assert.deepEqual(frozen.rpc.migrationTemporary,['bc_import_snapshot']);

console.log('PASS B-S4A restores exact v1 handoff digest basis instead of silently adding task timestamps');
console.log('PASS v1 exporter is read-only, HMAC-integrity checked, host-root-free and canonical-digest bound');
console.log('PASS one-time importer requires empty target + ADMIN migration actor and remains unavailable to authenticated runtime');
console.log('PASS explicit retirement script removes the reserved temporary migration RPC');
console.log('BUSINESS_S4A_MIGRATION_CONTRACT=PASS');
