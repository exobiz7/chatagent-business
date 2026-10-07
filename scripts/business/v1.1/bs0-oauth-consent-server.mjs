import http from 'node:http';

const port=Number(process.env.BS0_CONSENT_PORT||32171);
const supabaseUrl=(process.env.BS0_SUPABASE_URL||'').replace(/\/$/,'');
const publishableKey=process.env.BS0_SUPABASE_PUBLISHABLE_KEY||'';
const consentPath=process.env.BS0_CONSENT_PATH||'/functions/v1/bs0-oauth-consent';
if(!Number.isInteger(port)||port<1024||port>65535)throw Error('BS0_CONSENT_PORT_INVALID');
if(!/^https:\/\/[^/]+\.supabase\.co$/.test(supabaseUrl))throw Error('BS0_SUPABASE_URL_REQUIRED');
if(!publishableKey.startsWith('sb_publishable_'))throw Error('BS0_SUPABASE_PUBLISHABLE_KEY_REQUIRED');
if(!consentPath.startsWith('/'))throw Error('BS0_CONSENT_PATH_INVALID');

const html=`<!doctype html>
<html lang="en"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>ChatAgent Business B-S0 OAuth Consent</title>
<style>body{font-family:system-ui,-apple-system,sans-serif;max-width:720px;margin:40px auto;padding:0 20px;line-height:1.45}input,button{font:inherit;padding:10px;margin:5px 0}input{width:100%;box-sizing:border-box}button{cursor:pointer}.row{display:flex;gap:8px;flex-wrap:wrap}.card{border:1px solid #ddd;border-radius:12px;padding:18px;margin:16px 0}.muted{color:#666}.ok{color:#176b2c}.err{color:#a11919;white-space:pre-wrap}code{word-break:break-all}</style></head>
<body><h1>ChatAgent Business B-S0</h1>
<p class="muted">Staging-only OAuth consent fixture. No production Business data is used.</p>
<div id="msg"></div><div class="card" id="authCard">
<h2>1. Sign in or create a staging account</h2>
<input id="email" type="email" autocomplete="username" placeholder="Email" />
<input id="password" type="password" autocomplete="current-password" placeholder="Password (8+ characters)" />
<div class="row"><button id="signIn">Sign in</button><button id="signUp">Create staging account</button><button id="signOut">Sign out</button></div>
<p class="muted">If email confirmation is enabled, confirm the email first, then return here and sign in.</p></div>
<div class="card" id="consentCard" hidden><h2>2. Review OAuth request</h2><div id="details"></div>
<div class="row"><button id="approve">Approve</button><button id="deny">Deny</button></div></div>
<script type="module">
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
const supabase=createClient(${JSON.stringify(supabaseUrl)},${JSON.stringify(publishableKey)},{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
const q=new URLSearchParams(location.search), authorizationId=q.get('authorization_id');
const msg=document.querySelector('#msg'), consent=document.querySelector('#consentCard'), details=document.querySelector('#details');
const show=(text,kind='')=>{msg.className=kind;msg.textContent=text};
const escapeHtml=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
async function refresh(){
 const {data:{user}}=await supabase.auth.getUser();
 if(!user){consent.hidden=true;show('Not signed in.');return;}
 show('Signed in as '+(user.email||user.id),'ok');
 if(!authorizationId){consent.hidden=true;show('Signed in, but authorization_id is missing. Start the flow from ChatGPT.','err');return;}
 const {data,error}=await supabase.auth.oauth.getAuthorizationDetails(authorizationId);
 if(error){consent.hidden=true;show('Authorization details failed: '+error.message,'err');return;}
 if(data && !('authorization_id' in data) && data.redirect_url){location.href=data.redirect_url;return;}
 const scopes=(data?.scope||'').split(' ').filter(Boolean);
 details.innerHTML='<p><strong>Client:</strong> '+escapeHtml(data?.client?.name||'Unknown')+'</p><p><strong>Redirect URI:</strong> <code>'+escapeHtml(data?.redirect_uri||'')+'</code></p><p><strong>Scopes:</strong> '+escapeHtml(scopes.join(', ')||'(default)')+'</p>';
 consent.hidden=false;
}
document.querySelector('#signIn').onclick=async()=>{const email=document.querySelector('#email').value,password=document.querySelector('#password').value;const {error}=await supabase.auth.signInWithPassword({email,password});if(error)show(error.message,'err');else refresh()};
document.querySelector('#signUp').onclick=async()=>{const email=document.querySelector('#email').value,password=document.querySelector('#password').value;const {data,error}=await supabase.auth.signUp({email,password});if(error)show(error.message,'err');else if(data.session){show('Account created and signed in.','ok');refresh()}else show('Account created. Check your email if confirmation is required, then sign in.','ok')};
document.querySelector('#signOut').onclick=async()=>{await supabase.auth.signOut();refresh()};
document.querySelector('#approve').onclick=async()=>{const {data,error}=await supabase.auth.oauth.approveAuthorization(authorizationId);if(error)show(error.message,'err');else location.href=data.redirect_url};
document.querySelector('#deny').onclick=async()=>{const {data,error}=await supabase.auth.oauth.denyAuthorization(authorizationId);if(error)show(error.message,'err');else location.href=data.redirect_url};
await refresh();
</script></body></html>`;

const headers={'content-type':'text/html; charset=utf-8','cache-control':'no-store','content-security-policy':`default-src 'self'; script-src 'self' https://esm.sh 'unsafe-inline'; connect-src 'self' ${supabaseUrl} https://esm.sh; style-src 'self' 'unsafe-inline'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'`};
const server=http.createServer((req,res)=>{
 const url=new URL(req.url||'/',`http://${req.headers.host||`localhost:${port}`}`);
 if(req.method==='GET'&&url.pathname==='/healthz'){res.writeHead(200,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify({status:'live',fixture:true,kind:'oauth-consent',port}));return;}
 if(req.method==='GET'&&url.pathname===consentPath){res.writeHead(200,headers);res.end(html);return;}
 res.writeHead(404,{'content-type':'text/plain; charset=utf-8','cache-control':'no-store'});res.end('Not Found');
});
server.listen(port,'127.0.0.1',()=>console.log(JSON.stringify({event:'bs0_oauth_consent_started',port,consentPath,supabaseUrl})));
