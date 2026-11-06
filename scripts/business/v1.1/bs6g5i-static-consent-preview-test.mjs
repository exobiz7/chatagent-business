import assert from 'node:assert/strict';
import {mkdtempSync,readdirSync,readFileSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
const out=mkdtempSync('/tmp/chatagent-business-bs6g5i-');
try{
 const stdout=execFileSync(process.execPath,
   ['scripts/business/v1.1/bs6g5i-build-static-consent-preview.mjs','--out='+out],
   {encoding:'utf8',timeout:15000});
 const result=JSON.parse(stdout.trim());
 assert.equal(result.result,'BS6G5I_STATIC_DISABLED_PREVIEW_BUILT');
 assert.equal(result.containsJavaScript,false);
 assert.equal(result.credentials,false);
 assert.equal(result.oauthEnabled,false);
 const page=readFileSync(join(out,'oauth','consent.html'),'utf8');
 const css=readFileSync(join(out,'assets','preview.css'),'utf8');
 const headers=readFileSync(join(out,'_headers'),'utf8');
 const redirects=readFileSync(join(out,'_redirects'),'utf8');
 assert.equal(readdirSync(out).length,6);
 assert.match(page,/<fieldset disabled/);
 assert.equal((page.match(/<button disabled/g)||[]).length,3);
 assert.equal((page.match(/<input[^>]+ disabled/g)||[]).length,2);
 assert.match(page,/Not registered/);
 assert.match(page,/Not configured/);
 assert.doesNotMatch(page,/<script|<form|onerror=|onclick=|iframe|javascript:/i);
 assert.doesNotMatch(page,/supabase\.co|@supabase|service_role|signInWithPassword|createClient|localStorage/i);
 assert.match(headers,/script-src 'none'/);
 assert.match(headers,/connect-src 'none'/);
 assert.match(headers,/form-action 'none'/);
 assert.match(headers,/X-Robots-Tag: noindex, nofollow, noarchive/);
 assert.match(headers,/Cache-Control: no-store/);
 assert.match(redirects,/^\/oauth\/consent \/oauth\/consent\.html 200/m);
 assert.ok(css.length>300);
 assert.throws(()=>execFileSync(process.execPath,
   ['scripts/business/v1.1/bs6g5i-build-static-consent-preview.mjs','--out='+out],
   {encoding:'utf8',timeout:15000,stdio:['pipe','pipe','pipe']}));
 console.log('PASS B-S6G-5I deterministic six-file static preview; no scripts, forms, enabled controls, secrets or Auth traffic');
 console.log('PASS B-S6G-5I exact consent rewrite, strict CSP, cache/noindex and overwrite refusal');
 console.log('BUSINESS_BS6G5I_STATIC_PREVIEW_CONTRACT=PASS');
}finally{rmSync(out,{recursive:true,force:true})}
