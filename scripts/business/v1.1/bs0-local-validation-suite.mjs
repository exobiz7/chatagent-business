import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const tests=[
 'bs0-production-baseline-test.mjs',
 'bs0-personal-donor-test.mjs',
 'bs0-architecture-probe.mjs',
 'bs0-tool-catalog-test.mjs',
 'bs0-mcp-descriptor-scan.mjs',
 'bs0-openai-security-scheme-adapter-probe.mjs',
 'bs0-live-fixture-smoke-test.mjs',
 'bs0-supabase-contract-test.mjs',
 'bs0-test-matrix-test.mjs'
];
for(const t of tests){
  const r=spawnSync(process.execPath,[fileURLToPath(new URL(t,import.meta.url))],{stdio:'inherit'});
  if(r.status!==0)process.exit(r.status??1);
}
console.log(`BUSINESS_V11_BS0_LOCAL_SUITE=PASS count=${tests.length}`);
