#!/usr/bin/env node
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const repo=fileURLToPath(new URL('../../../',import.meta.url));
const pkg=JSON.parse(readFileSync(`${repo}/package.json`,'utf8'));
const full=String(pkg.scripts?.['test:ci']||'');
if(!full)throw Error('BUSINESS_HOSTED_CI_FULL_SUITE_MISSING');

const replacements=new Map([
  ['npm run test:business:bs3f1','node scripts/business/v1.1/bs3f1-isolated-contract-test.mjs && node --check scripts/business/v1.1/bs3f1-isolated-effects-test.mjs'],
  ['npm run test:business:bs4a','node scripts/business/v1.1/bs4a-migration-contract-test.mjs && node --check scripts/business/v1.1/bs4a-migration-postgres-test.mjs'],
  ['npm run test:business:bs4b','node scripts/business/v1.1/bs4b-backup-contract-test.mjs && node --check scripts/business/v1.1/bs4b-backup-postgres-test.mjs'],
  ['npm run test:business:bs4c','node scripts/business/v1.1/bs4c-ops-contract-test.mjs && node --check scripts/business/v1.1/bs4c-ops-postgres-test.mjs && node scripts/business/v1.1/bs4c-degraded-continuity-test.mjs'],
  ['npm run test:business:bs5a','node --check scripts/business/v1.1/bs5a-distributed-team-node-security-postgres-test.mjs'],
  ['npm run test:business:bs5c','node --check scripts/business/v1.1/bs5c-failure-recovery-test.mjs && node --check scripts/business/v1.1/bs5c-live-failure-fixture-server.mjs']
]);
let hosted=full;
for(const [from,to] of replacements){
  const occurrences=hosted.split(from).length-1;
  if(occurrences!==1)throw Error(`BUSINESS_HOSTED_CI_REPLACEMENT_COUNT_INVALID:${from}:${occurrences}`);
  hosted=hosted.replace(from,to);
}
for(const from of replacements.keys())if(hosted.includes(from))throw Error(`BUSINESS_HOSTED_CI_DOCKER_EFFECT_REMAINED:${from}`);
console.log('BUSINESS_HOSTED_CI_DOCKER_POSTGRES_EFFECTS=RELEASE_HOST_ONLY');
const child=spawnSync('/bin/sh',['-c',hosted],{cwd:repo,stdio:'inherit',env:process.env});
process.exit(child.status??1);
