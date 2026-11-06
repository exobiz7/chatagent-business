#!/usr/bin/env node
// Strict local-only draft. No OAuth server configuration or external endpoint is created.
import http from 'node:http';
import {readFileSync,existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {PROJECT_REF} from './bs6g5f-consent-policy.mjs';
const fail=code=>{throw Error(code);};
const here=new URL('.',import.meta.url);
const vendor=new URL('../../../node_modules/@supabase/supabase-js/dist/umd/supabase.js',here);
const assets={
 '/assets/app.js':{type:'text/javascript; charset=utf-8',file:new URL('./bs6g5f-consent-browser.js',here)},
 '/assets/style.css':{type:'text/css; charset=utf-8',file:new URL('./bs6g5f-consent-style.css',here)},
 '/assets/vendor/supabase.js':{type:'text/javascript; charset=utf-8',file:vendor}
};
export const csp="default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'none'; img-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'; object-src 'none'";
const html=String.raw`<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="referrer" content="no-referrer"><title>ChatAgent Business — Consent Preview</title>
<link rel="stylesheet" href="/assets/style.css"></head><body><article>
<h1>ChatAgent Business — OAuth Consent</h1>
<p class="note">Read-only preview. No login, consent, account creation, or external access.</p>
<p id="message" role="status" aria-live="polite">Preview initialization</p>
<dl><dt>Client</dt><dd id="client"></dd><dt>Redirect</dt><dd id="redirect"></dd>
<dt>Scopes</dt><dd id="scopes"></dd></dl>
<section><label for="email">Existing account email</label><input id="email" type="email" disabled autocomplete="off">
<label for="password">Password</label><input id="password" type="password" disabled autocomplete="off">
<button id="login" disabled>Sign in</button><button id="approve" disabled>Approve</button><button id="deny" disabled>Deny</button></section>
<small>No public signup. This is not a working authorization screen.</small>
</article><script src="/assets/vendor/supabase.js" defer></script>
<script src="/assets/app.js" defer></script></body></html>`;
function send(res,status,body,type='application/json'){
 res.writeHead(status,{'content-type':type,'cache-control':'no-store, max-age=0',
  'referrer-policy':'no-referrer','x-content-type-options':'nosniff',
  'x-frame-options':'DENY','content-security-policy':csp,
  'cross-origin-resource-policy':'same-origin'});
 res.end(body);
}
export function createPreviewServer(){
 return http.createServer((req,res)=>{
  const path=req.url?.split('?')[0];
  if(req.method!=='GET'||(req.url?.includes('?')&&path!=='/oauth/consent')){
    return send(res,404,'{"error":"NOT_FOUND"}');
  }
  if(path==='/healthz'){
    return send(res,200,JSON.stringify({ready:true,preview:true,public:false,authEnabled:false,projectPinned:true}));
  }
  if(path==='/assets/config.json'){
    return send(res,200,JSON.stringify({mode:'PREVIEW_ONLY',projectRef:PROJECT_REF,authEnabled:false}));
  }
  if(path==='/oauth/consent')return send(res,200,html,'text/html; charset=utf-8');
  const asset=assets[path];
  if(asset&&existsSync(asset.file)){
    return send(res,200,readFileSync(asset.file),asset.type);
  }
  return send(res,404,'{"error":"NOT_FOUND"}');
 });
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 (async()=>{
  const args=process.argv.slice(2);
  if(args.length!==1||!args[0].startsWith('--local-preview-port='))
    fail('BS6G5F_PREVIEW_ONLY');
  const port=Number(args[0].slice('--local-preview-port='.length));
  if(!Number.isInteger(port)||port<1024||port>65535)
    fail('BS6G5F_INVALID_PORT');
  const server=createPreviewServer();
  server.listen(port,'127.0.0.1',()=>console.log(JSON.stringify({
    status:'LOCAL_PREVIEW_ONLY',port,authEnabled:false,public:false
  })));
 })().catch(()=>{process.stderr.write('BS6G5F_PREVIEW_START_DENIED\n');process.exitCode=1;});
}
