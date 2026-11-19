/* B-S6G-5G browser integration candidate. NOT served by B-S6G5F preview.
 * Future approved staging router must explicitly provide this module and its
 * same-origin dependencies only after the independent external admission gates.
 * Authorization-code PKCE is handled by the OAuth client + Supabase OAuth Server,
 * not generated or exchanged by this consent page. */
import {createConsentController} from './bs6g5g-consent-controller.mjs';
const ROOT='hjgerbyofaxyfqdckret';
const $=id=>document.getElementById(id);
const show=s=>{$('message').textContent=String(s).slice(0,180);};
const disableAll=()=>{
 for(const id of ['login','approve','deny'])$(id).disabled=true;
};
const safely=async(fn)=>{
 disableAll();
 try{await fn();}
 catch{show('Authorization is unavailable. Verify the account and contact the administrator.');}
};
disableAll();
(async()=>{
 try{
  const res=await fetch('/assets/staging-config.json',{
    method:'GET',cache:'no-store',redirect:'error'
  });
  if(!res.ok)throw Error('STAGING_NOT_ARMED');
  const cfg=await res.json();
  if(cfg.mode!=='OWNER_APPROVED_STAGING'||
     cfg.externalOAuthReady!==true||
     cfg.projectRef!==ROOT||
     cfg.siteUrl!==location.origin||
     cfg.authorizationPath!=='/oauth/consent'||
     !cfg.clientId||!cfg.redirectUri||
     typeof globalThis.supabase?.createClient!=='function')
    throw Error('STAGING_NOT_ARMED');
  const authorizationId=new URL(location.href).searchParams.get('authorization_id');
  if(!/^[A-Za-z0-9_-]{8,256}$/.test(authorizationId??''))
    throw Error('MISSING_AUTHORIZATION_ID');
  // Ephemeral browser session; no localStorage refresh-token persistence.
  const client=globalThis.supabase.createClient(
    'https://'+ROOT+'.supabase.co',cfg.publishableKey,{
      auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}
    });
  const controller=createConsentController({
    client,authorizationId,
    allowlist:{projectRef:ROOT,clientId:cfg.clientId,redirectUri:cfg.redirectUri}
  });
  const inspect=async()=>{
    const r=await controller.inspect();
    $('client').textContent=r.clientLabel;
    $('redirect').textContent=r.redirectUri;
    $('scopes').textContent=r.scopes.join(', ');
    $('login').disabled=true;
    $('approve').disabled=false;
    $('deny').disabled=false;
    show('Review the application and requested permissions.');
  };
  $('login').disabled=false;
  $('login').addEventListener('click',()=>safely(async()=>{
    const email=$('email').value;
    const password=$('password').value;
    $('password').value='';
    await controller.login({email,password});
    await inspect();
  }));
  const decide=(action)=>safely(async()=>{
    const r=await controller.decide(action);
    // The controller validates exact origin/path and the OAuth response.
    location.assign(r.redirectUrl);
  });
  $('approve').addEventListener('click',()=>decide('approve'));
  $('deny').addEventListener('click',()=>decide('deny'));
  try{await inspect();}
  catch{show('Sign in with your approved account to continue.');}
 }catch{
  disableAll();
  show('Consent is not enabled for this staging application.');
 }
})();
