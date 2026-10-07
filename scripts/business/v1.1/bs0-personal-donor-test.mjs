import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
const personal='/Volumes/SSD 4T/z_proj/proj04_chatagent/chatagent-personal';
const manifest=JSON.parse(readFileSync(new URL('../../../docs/verification/v1.1/B_S0_PERSONAL_DONOR_MANIFEST.json',import.meta.url),'utf8'));
const git=(...args)=>execFileSync('git',['-C',personal,...args],{encoding:'utf8'}).trim();
assert.equal(git('rev-parse',`${manifest.sourceTag}^{}`),manifest.sourceCommit,'PERSONAL_DONOR_COMMIT_DRIFT');
assert.equal(git('rev-parse',manifest.sourceTag),manifest.sourceTagObject,'PERSONAL_DONOR_TAG_OBJECT_DRIFT');
for(const [path,blob] of Object.entries({...manifest.core,...manifest.memory})){
  const actual=git('ls-tree',manifest.sourceTag,path).split(/\s+/)[2];
  assert.equal(actual,blob,`PERSONAL_DONOR_BLOB_DRIFT:${path}`);
}
console.log(`PASS Personal donor tag=${manifest.sourceTag} commit=${manifest.sourceCommit}`);
console.log(`PASS donor blobs frozen count=${Object.keys(manifest.core).length+Object.keys(manifest.memory).length}`);
console.log('B_S0_PERSONAL_DONOR=PASS');
