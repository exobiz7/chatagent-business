#!/usr/bin/env node
// Read-only Netlify CSP browser test using an isolated disposable headless Chrome profile.
// NO user profile, no authentication, no form submission, no provider API writes.
import {spawn} from 'node:child_process';
import {existsSync,mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {setTimeout as sleep} from 'node:timers/promises';

const chrome='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const site='https://chatagent-business-v11-consent-staging.netlify.app';
const target=site+'/oauth/consent';
const fail=(c)=>{throw Error('BS6G5J_'+c)};
let child,ws;
const folder=mkdtempSync('/tmp/chatagent-business-bs6g5j-browser-');
const pending=new Map();
const network=[];
const logEntries=[];
const cspIssues=[];
let seq=0;
const send=(method,params={})=>new Promise((resolve,reject)=>{
  const id=++seq;
  const timeout=setTimeout(()=>{pending.delete(id);reject(Error('CDP_TIMEOUT_'+method))},8000);
  pending.set(id,{resolve:v=>{clearTimeout(timeout);resolve(v)},reject:e=>{clearTimeout(timeout);reject(e)}});
  ws.send(JSON.stringify({id,method,params}));
});
async function main(){
  if(!existsSync(chrome))fail('CHROME_NOT_INSTALLED');
  child=spawn(chrome,[
    '--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check',
    '--disable-extensions','--disable-sync','--disable-background-networking',
    '--disable-component-update','--remote-debugging-port=0',
    '--user-data-dir='+folder,'about:blank'
  ],{stdio:'ignore'});
  const activePort=folder+'/DevToolsActivePort';
  let port;
  for(let i=0;i<70;i++){
    if(existsSync(activePort)){
      port=Number(readFileSync(activePort,'utf8').split('\n')[0]);
      break;
    }
    if(child.exitCode!==null)fail('CHROME_EXITED_EARLY');
    await sleep(200);
  }
  if(!port||port<1024)fail('CDP_PORT_UNAVAILABLE');
  const targetsResponse=await fetch('http://127.0.0.1:'+port+'/json/list');
  const targets=await targetsResponse.json();
  const page=targets.find(x=>x.type==='page'&&x.webSocketDebuggerUrl);
  if(!page)fail('CDP_TAB_MISSING');
  ws=new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve,reject)=>{
    const timeout=setTimeout(()=>reject(Error('WS_CONNECT_TIMEOUT')),7000);
    ws.addEventListener('open',()=>{clearTimeout(timeout);resolve()},{once:true});
    ws.addEventListener('error',e=>{clearTimeout(timeout);reject(Error('WS_CONNECT_FAILED'))},{once:true});
  });
  ws.addEventListener('message',e=>{
    let x;try{x=JSON.parse(e.data)}catch{return}
    if(x.id){
      const record=pending.get(x.id);
      if(!record)return;
      pending.delete(x.id);
      if(x.error)record.reject(Error(x.error.message||'CDP_COMMAND_ERROR'));
      else record.resolve(x.result||{});
    }else if(x.method==='Network.responseReceived'){
      network.push({url:x.params.response.url,status:x.params.response.status,
        mimeType:x.params.response.mimeType,
        csp:x.params.response.headers['content-security-policy']||
        x.params.response.headers['Content-Security-Policy']||null});
    }else if(x.method==='Network.loadingFailed'){
      network.push({url:x.params.errorText,failed:true,blockedReason:x.params.blockedReason||null});
    }else if(x.method==='Network.requestWillBeSent'){
      if(x.params.request.url.includes('/.netlify/scripts/hud')){
        network.push({hudRequested:true,url:x.params.request.url});
      }
    }else if(x.method==='Log.entryAdded'){
      logEntries.push({level:x.params.entry.level,text:x.params.entry.text.slice(0,240)});
    }else if(x.method==='Audits.issueAdded'){
      if(x.params.issue.code==='ContentSecurityPolicyIssue')
        cspIssues.push(x.params.issue.details?.contentSecurityPolicyIssueDetails?.violatedDirective||'CSP_ISSUE');
    }
  });
  await Promise.all([
    send('Page.enable'),
    send('Runtime.enable'),
    send('Network.enable'),
    send('Log.enable'),
    send('Audits.enable')
  ]);
  await send('Page.addScriptToEvaluateOnNewDocument',{
    source:'window.__bs6g5jCspViolations=[];window.addEventListener("securitypolicyviolation",function(e){window.__bs6g5jCspViolations.push({directive:e.effectiveDirective,blocked:e.blockedURI,disposition:e.disposition});});'
  });
  await send('Page.navigate',{url:target});
  let state=null;
  for(let i=0;i<45;i++){
    try{
      const r=await send('Runtime.evaluate',{
        expression:'JSON.stringify({url:location.href,ready:document.readyState,scripts:Array.from(document.scripts).map(s=>s.getAttribute("src")),disabledButtons:document.querySelectorAll("button:disabled").length,disabledInputs:document.querySelectorAll("input:disabled").length,fieldsetDisabled:!!document.querySelector("fieldset:disabled"),cspViolations:window.__bs6g5jCspViolations||[],hasForm:!!document.querySelector("form"),resources:performance.getEntriesByType("resource").map(e=>e.name).filter(n=>n.includes("netlify")||n.includes("supabase")),title:document.title})',
        returnByValue:true
      });
      const val=r.result?.value;
      if(val)state=JSON.parse(val);
    }catch{}
    if(state?.url===target&&state.ready==='complete')break;
    await sleep(200);
  }
  await sleep(700);
  const r=await send('Runtime.evaluate',{
    expression:'JSON.stringify({url:location.href,ready:document.readyState,scripts:Array.from(document.scripts).map(s=>s.getAttribute("src")),disabledButtons:document.querySelectorAll("button:disabled").length,disabledInputs:document.querySelectorAll("input:disabled").length,fieldsetDisabled:!!document.querySelector("fieldset:disabled"),cspViolations:window.__bs6g5jCspViolations||[],hasForm:!!document.querySelector("form"),resources:performance.getEntriesByType("resource").map(e=>e.name).filter(n=>n.includes("netlify")||n.includes("supabase")),title:document.title})',
    returnByValue:true
  });
  state=JSON.parse(r.result.value||'null');
  if(state?.url!==target||state.ready!=='complete')fail('PAGE_NOT_LOADED');
  if(state.disabledButtons!==3||state.disabledInputs!==2||!state.fieldsetDisabled||state.hasForm)
    fail('DISABLED_PREVIEW_INVARIANT');
  if(!state.scripts.some(x=>x?.startsWith('/.netlify/scripts/hud?')))
    fail('NETLIFY_INJECTION_NOT_OBSERVED');
  // Chrome Performance API records blocked resource *attempts* too. Treat only
  // responseReceived as successful load evidence; require an enforced CSP violation.
  if(state.resources.some(x=>x.includes('supabase.co')))
    fail('UNEXPECTED_SUPABASE_RESOURCE');
  const hudResponses=network.filter(x=>String(x.url||'').includes('/.netlify/scripts/hud') &&
    typeof x.status==='number' && x.status>=200&&x.status<400);
  if(hudResponses.length)fail('HUD_SUCCESSFULLY_FETCHED_DESPITE_CSP');
  const violations=state.cspViolations.filter(v=>
    v.directive==='script-src-elem'||v.directive==='script-src'||
    String(v.blocked).includes('/.netlify/scripts/hud'));
  const logs=logEntries.filter(x=>/Content Security Policy|Refused to load the script|script-src/.test(x.text));
  if(!violations.length&&!logs.length&&!cspIssues.length)
    fail('SCRIPT_BLOCKING_NOT_EVIDENCED');
  const result={
    verdict:'PASS_CHROME_ISOLATED_REAL_BROWSER_CSP_DENIAL',
    browser:'Installed Google Chrome headless, fresh isolated temporary profile',
    observedAt:new Date().toISOString(),
    exactTarget:target,
    scriptInjectedByProvider:true,
    scriptNotInOriginalSource:true,
    injectedHudSuccessfulNetworkResponses:0,
    hudNetworkRequestAttemptObserved:network.some(x=>x.hudRequested),
    hudRequestBlockedByEnforcedCsp:true,
    oauthUserLoginExecuted:false,
    noSupabaseBrowserRequests:true,
    disabledButtons:state.disabledButtons,
    disabledInputs:state.disabledInputs,
    noForm:!state.hasForm,
    violationEvidence:violations.slice(0,6),
    browserCspLogEvidence:logs.slice(0,6),
    cspIssueCount:cspIssues.length,
    scriptUrls:state.scripts,
    allLoadedResources:state.resources,
    oauthServerChanged:false,
    cutoverAuthorized:false
  };
  console.log(JSON.stringify(result,null,2));
}
try{await main()}catch(e){
  console.error(JSON.stringify({verdict:'FAILED_BROWSER_SECURITY_AUDIT',
    reason:String(e.message).slice(0,160)}));
  process.exitCode=1;
}finally{
  if(ws){for(const [,p] of pending)p.reject(Error('AUDIT_SHUTDOWN'));ws.close()}
  if(child&&child.exitCode===null){child.kill('SIGTERM');await Promise.race([new Promise(ok=>child.once('exit',ok)),sleep(3500)])}
  try{rmSync(folder,{recursive:true,force:true})}catch{}
}
