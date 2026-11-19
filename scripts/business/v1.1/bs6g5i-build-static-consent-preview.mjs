#!/usr/bin/env node
// B-S6G-5I: static-only, nonfunctional consent preview for independent Netlify Free site.
// No secrets, SDK, user logins, APIs, OAuth grants, callbacks or write endpoints.
import {mkdirSync, writeFileSync, existsSync, readdirSync, rmSync} from 'node:fs';
import {resolve,join} from 'node:path';
const args=process.argv.slice(2);
if(args.length!==1||!args[0].startsWith('--out='))throw Error('BS6G5I_OUTPUT_REQUIRED');
const out=resolve(args[0].slice(6));
if(!out.startsWith('/tmp/chatagent-business-bs6g5i-'))throw Error('BS6G5I_TEMP_OUTPUT_ONLY');
if(existsSync(out)&&readdirSync(out).length)throw Error('BS6G5I_DESTINATION_NOT_EMPTY');
mkdirSync(join(out,'oauth'),{recursive:true});
mkdirSync(join(out,'assets'),{recursive:true});
const page=`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="referrer" content="no-referrer"><meta name="robots" content="noindex,nofollow,noarchive">
<title>ChatAgent Business v1.1 — Staging Consent Preview</title>
<link rel="stylesheet" href="/assets/preview.css"></head>
<body><main><section class="panel">
<p class="eyebrow">ISOLATED STAGING · PREVIEW ONLY</p>
<h1>ChatAgent Business</h1>
<h2>OAuth consent screen — security preview</h2>
<p class="notice">Authentication is intentionally disabled. This page cannot create accounts, sign users in, grant consent or access ChatAgent Business.</p>
<dl><dt>OAuth Client</dt><dd>Not registered</dd><dt>Callback URI</dt><dd>Not configured</dd>
<dt>Requested permissions</dt><dd>Not authorized</dd><dt>Environment</dt><dd>Static design preview only</dd></dl>
<fieldset disabled aria-label="Disabled consent controls">
<legend>Unavailable until independent authorization</legend>
<label for="email">Account email</label><input id="email" type="email" disabled autocomplete="off" placeholder="Disabled">
<label for="password">Password</label><input id="password" type="password" disabled autocomplete="off" placeholder="Disabled">
<div class="actions"><button disabled type="button">Sign in</button><button disabled type="button">Approve</button><button disabled type="button">Deny</button></div>
</fieldset>
<footer>Independent staging verification only. Production v1.0 remains separate.</footer>
</section></main></body></html>`;
const css=`:root{color-scheme:light;font-family:system-ui,-apple-system,sans-serif;color:#273449;background:#f3f6fa}*{box-sizing:border-box}body{margin:0}main{padding:40px 18px;min-height:100vh;display:grid;place-items:center}.panel{max-width:640px;width:100%;background:#fff;border:1px solid #dde4ee;border-radius:18px;padding:30px;box-shadow:0 14px 40px #223c6410}.eyebrow{letter-spacing:.1em;color:#58749a;font-weight:700;font-size:.73rem}h1{margin:.6rem 0 0;font-size:1.6rem}h2{font-size:1.05rem;font-weight:600;color:#566880;margin:.1rem 0 1.4rem}.notice{background:#f1f5fb;padding:15px;border-left:3px solid #497da8;border-radius:5px}dl{display:grid;grid-template-columns:140px 1fr;gap:12px 6px;margin:24px 0}dt{font-weight:600}dd{margin:0;overflow-wrap:anywhere}fieldset{border:1px solid #dae1ea;border-radius:10px;padding:18px}legend{color:#536985}label{display:block;margin:14px 0 4px}input{width:100%;padding:10px;border:1px solid #c6cfda;border-radius:6px}button{padding:10px 20px;border:0;border-radius:7px;background:#99a6b7;color:white;margin:10px 8px 0 0;cursor:not-allowed}footer{font-size:.8rem;color:#68778e;margin-top:25px}`;
const headers=`/*
  Content-Security-Policy: default-src 'none'; script-src 'none'; style-src 'self'; img-src 'none'; connect-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'; object-src 'none'
  X-Content-Type-Options: nosniff
  X-Frame-Options: DENY
  Referrer-Policy: no-referrer
  X-Robots-Tag: noindex, nofollow, noarchive
  Cache-Control: no-store, max-age=0
  Cross-Origin-Resource-Policy: same-origin
`;
const redirects=`/ /oauth/consent 302
/oauth/consent /oauth/consent.html 200
`;
writeFileSync(join(out,'oauth','consent.html'),page);
writeFileSync(join(out,'assets','preview.css'),css);
writeFileSync(join(out,'_headers'),headers);
writeFileSync(join(out,'_redirects'),redirects);
writeFileSync(join(out,'robots.txt'),'User-agent: *\nDisallow: /\n');
writeFileSync(join(out,'index.html'),`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="robots" content="noindex"><title>Staging Preview</title></head><body><p>Preview only. <a href="/oauth/consent">Open disabled consent screen</a>.</p></body></html>`);
console.log(JSON.stringify({result:'BS6G5I_STATIC_DISABLED_PREVIEW_BUILT',files:6,output:out,containsJavaScript:false,credentials:false,oauthEnabled:false}));
