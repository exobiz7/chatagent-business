import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,statSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';
const src=readFileSync('scripts/business/v1.1/bs6b-runtime-reconciliation-probe.mjs','utf8');
assert.match(src,/readOnly:true,repairPerformed:false,cutoverPerformed:false/);
assert.match(src,/STALE_AFTER_HOST_REBOOT_CONSISTENT/);
assert.match(src,/NO_GO_RECONCILIATION_REQUIRED/);
assert.match(src,/EXPLICIT_APPROVAL_REQUIRED/);
assert.doesNotMatch(src,/\b(?:writeFileSync|renameSync|unlinkSync|rmSync|mkdirSync|copyFileSync|openSync|execSync|fork|kill)\s*\(/);
assert.doesNotMatch(src,/['"](?:POST|PUT|PATCH|DELETE)['"]/);
assert.doesNotMatch(src,/(?:launchctl.*(?:kickstart|bootstrap|bootout|remove)|git\s+(?:push|reset|clean)|gh\s+(?:pr merge|repo edit|auth refresh))/i);
const fixture=mkdtempSync(join(tmpdir(),'business-bs6b-'));
try{
 const runtime=join(fixture,'runtime'),state=join(fixture,'state/continuity'),backup=join(fixture,'backups/pre-canary');
 mkdirSync(runtime,{recursive:true});mkdirSync(state,{recursive:true});mkdirSync(backup,{recursive:true});
 const p=join(runtime,'business-runtime.json');
 const config=join(fixture,'operator.json');
 const record={pid:2147483647,port:31850,instanceId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
 nodeBinary:'/nonexistent/node',serverPath:'/nonexistent/server',startedAt:1000};
 writeFileSync(p,JSON.stringify(record));writeFileSync(config,JSON.stringify({runtimeDir:runtime,port:31850}));
 const snapshots=[p,config].map(v=>({contents:readFileSync(v),mtime:statSync(v).mtimeMs}));
 const x=spawnSync(process.execPath,['scripts/business/v1.1/bs6b-runtime-reconciliation-probe.mjs','--root='+fixture],
 {encoding:'utf8',timeout:10000,maxBuffer:100_000});
 assert.equal(x.status,3,x.stderr);
 const r=JSON.parse(x.stdout);
 assert.equal(r.readOnly,true);assert.equal(r.repairPerformed,false);
 assert.equal(r.runtime.recordValid,true);assert.equal(r.runtime.processPresent,false);
 assert.equal(r.runtime.recordPrecedesCurrentBoot,true);
 assert.equal(r.diagnosis,'STALE_AFTER_HOST_REBOOT_CONSISTENT');
 assert.equal(r.verdict,'NO_GO_RECONCILIATION_REQUIRED');
 assert.equal(r.source.backupSnapshotDirectoryCount,1);
 for(let i=0;i<2;i++){assert.deepEqual(readFileSync([p,config][i]),snapshots[i].contents);
 assert.equal(statSync([p,config][i]).mtimeMs,snapshots[i].mtime);}
 console.log('PASS disposable stale-after-reboot record diagnoses NO-GO without mutating config/record');
 console.log('PASS contract forbids repair/restart/delete and reserves explicit owner approval');
 console.log('BUSINESS_S6B_RUNTIME_RECONCILIATION_READONLY_CONTRACT=PASS');
}finally{rmSync(fixture,{recursive:true,force:true});}
