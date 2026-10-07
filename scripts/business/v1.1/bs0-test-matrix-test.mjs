import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const m=JSON.parse(readFileSync(new URL('../../../docs/verification/v1.1/B_S0_TEST_MATRIX.json',import.meta.url),'utf8'));
assert.equal(m.status,'B-S0_TEST_MATRIX_FROZEN');
const ids=m.tests.map(x=>x.id);assert.equal(new Set(ids).size,ids.length,'DUPLICATE_TEST_ID');
for(const t of m.tests){assert.equal(t.required,true,'NON_REQUIRED_GATE:'+t.id);assert.match(t.phase,/^B-S[0-6]$/);}
for(const p of ['B-S0','B-S1','B-S2','B-S3','B-S4','B-S5','B-S6'])assert.ok(m.tests.some(x=>x.phase===p),'MISSING_PHASE:'+p);
for(const c of ['reuse','openai-live','distributed','authority','parity','concurrency','security','e2e','release'])assert.ok(m.tests.some(x=>x.class===c),'MISSING_CLASS:'+c);
for(const required of ['S0-SELECTION','S0-OAUTH','S2-IDEMPOTENCY','S2-CAS','S3-HOST-PROCESS','S3-GIT','S4-MIGRATION','S5-MULTI-NODE','S6-POST-PUBLISH'])assert.ok(ids.includes(required),'MISSING_TEST:'+required);
console.log(`PASS frozen parity/safety/E2E matrix tests=${m.tests.length}`);
console.log('PASS phases B-S0..B-S6 and reuse/OpenAI/distributed/concurrency/release classes covered');
console.log('B_S0_TEST_MATRIX=PASS');
