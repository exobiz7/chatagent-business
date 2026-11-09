#!/usr/bin/env node
// B-S6G-5I — Independent GET-only hosted evidence verifier.
// No authorization, user data, registry writes or Netlify management operations.
import {readFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';

const ORIGIN='https://chatagent-business-v11-consent-staging.netlify.app';
const LOCAL='/tmp/chatagent-business-bs6g5i-staging-preview-20261106';
const sha=v=>createHash('sha256').update(v).digest('hex');
function deny(code){throw Error(code)}
const hostComment=/\n?<!-- This site is hosted on Netlify\.[\s\S]*?Netlify hosting facts for this site:[\s\S]*?-->/g;
const hostHud=/<script async src="\/\.netlify\/scripts\/hud\?variant=public" data-nf-variant="public" data-netlify-site-id="6a561d90-21fe-4001-8a04-ea566236f236" data-app-host="app\.netlify\.com" data-account-tier="free"><\/script>\n?/g;
function normalizedHtml(bytes){
 const text=bytes.toString('utf8');
 const comments=(text.match(hostComment)||[]).length;
 const scripts=(text.match(hostHud)||[]).length;
 if(comments>1||scripts>1)deny('HOSTED_UNEXPECTED_INJECTION_COUNT');
 const normalized=text.replace(hostComment,'').replace(hostHud,'');
 if(/<script|<!-- This site is hosted on Netlify|\.netlify\/scripts\/hud/i.test(normalized))
   deny('HOSTED_UNRECOGNIZED_SCRIPT_OR_INJECTION');
 return {normalized:Buffer.from(normalized,'utf8'),
   knownNetlifyComment:comments===1,knownNetlifyHud:scripts===1};
}
async function get(path){
 const response=await fetch(ORIGIN+path,{method:'GET',redirect:'follow',
   signal:AbortSignal.timeout(13000),headers:{'user-agent':'ChatAgentBusiness-ReadonlyStagingAudit/1'}});
 const bytes=Buffer.from(await response.arrayBuffer());
 if(bytes.length>200000)deny('HOSTED_CONTENT_TOO_LARGE');
 return {status:response.status,url:response.url,body:bytes,headers:response.headers};
}
export async function verifyHostedStaticPreview(){
 const files=[['/','index.html'],['/oauth/consent','oauth/consent.html'],
  ['/oauth/consent.html','oauth/consent.html'],['/assets/preview.css','assets/preview.css'],
  ['/robots.txt','robots.txt']];
 const results=[];
 for(const [path,local] of files){
  const r=await get(path);
  if(r.status!==200||r.url!==ORIGIN+path)deny('HOSTED_HTTPS_200_REQUIRED_'+path);
  const filename=join(LOCAL,local);
  if(!existsSync(filename))deny('LOCAL_SOURCE_MISSING_'+local);
  let content=r.body;
  let injection={knownNetlifyComment:false,knownNetlifyHud:false};
  if(local.endsWith('.html')){
    const found=normalizedHtml(r.body);
    content=found.normalized;
    injection=found;
  }
  if(sha(content)!==sha(readFileSync(filename))){
   deny('HOSTED_SHA256_MISMATCH_'+path);
  }
  const csp=r.headers.get('content-security-policy')||'';
  if(!csp.includes("default-src 'none'")||
     !csp.includes("script-src 'none'")||
     !csp.includes("connect-src 'none'")||
     !csp.includes("form-action 'none'")||
     !csp.includes("frame-ancestors 'none'"))
    deny('HOSTED_CSP_MISSING_'+path);
  if(!/no-store/.test(r.headers.get('cache-control')||'')||
     !/noindex/.test(r.headers.get('x-robots-tag')||'')||
     r.headers.get('x-content-type-options')!=='nosniff'||
     !/max-age=/.test(r.headers.get('strict-transport-security')||''))
    deny('HOSTED_SECURITY_HEADERS_MISSING_'+path);
  if(path==='/oauth/consent'){
   const body=content.toString('utf8');
   if(!body.includes('<fieldset disabled')||
      (body.match(/<button disabled/g)||[]).length!==3||
      (body.match(/<input[^>]+ disabled/g)||[]).length!==2||
      /<script|<form|signUp\(|createClient|supabase\.co|https:\/\//i.test(body))
     deny('HOSTED_PREVIEW_NOT_STATIC_DISABLED');
  }
  results.push({path,status:200,bytes:r.body.length,sourceSha256:sha(content),
   exactLocalMatchAfterKnownNetlifyInjectionNormalization:true,
   netlifyEdgeCommentInjected:injection.knownNetlifyComment,
   netlifyHudScriptTagInjected:injection.knownNetlifyHud,
   netlifyInjectedScriptExecutionBlockedByCSP:true,
   csp:true,noStore:true,noIndex:true,hsts:true});
 }
 for(const path of ['/_headers','/_redirects']){
  const r=await get(path);
  if(r.status!==404)deny('NETLIFY_INTERNAL_FILE_EXPOSED_'+path);
 }
 return {verdict:'PASS_HOSTED_STATIC_PREVIEW_ONLY',origin:ORIGIN,
  exactPathsVerified:results.length,results,
  internalNetlifyRulesNotExposed:true,oauthEnabled:false,authOrConsentFlowTested:false,
  productionCutoverAuthorized:false};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 if(process.argv.length!==2)deny('READ_ONLY_NO_ARGS');
 verifyHostedStaticPreview().then(r=>console.log(JSON.stringify(r,null,2)))
  .catch(e=>{console.error(JSON.stringify({verdict:'FAILED_HOSTED_CHECK',reason:String(e.message).slice(0,160)}));process.exitCode=1});
}
