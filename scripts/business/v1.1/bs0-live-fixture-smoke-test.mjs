import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const port=32000+Math.floor(Math.random()*10000);
const serverPath=fileURLToPath(new URL('./bs0-live-fixture-server.mjs',import.meta.url));
const child=spawn(process.execPath,[serverPath],{env:{...process.env,
  BS0_PUBLIC_ORIGIN:'https://bs0.example.invalid',
  BS0_SUPABASE_URL:'https://abcdefghijklmnopqrst.supabase.co',
  BS0_ORGANIZATION_ID:'bs0-test',BS0_FIXTURE_PORT:String(port)},stdio:['ignore','pipe','pipe']});
let buffer='';
const started=new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>reject(Error('FIXTURE_START_TIMEOUT')),5000);
  child.stdout.on('data',d=>{buffer+=d; if(buffer.includes('bs0_live_fixture_started')){clearTimeout(timer);resolve();}});
  child.once('exit',code=>reject(Error('FIXTURE_EXIT_'+code)));
});
try{
  await started;
  const health=await fetch(`http://127.0.0.1:${port}/healthz`);assert.equal(health.status,200);assert.equal((await health.json()).noEffect,true);
  const meta=await fetch(`http://127.0.0.1:${port}/.well-known/oauth-protected-resource`);const m=await meta.json();
  assert.equal(m.resource,'https://bs0.example.invalid/mcp');
  assert.deepEqual(m.scopes_supported,['openid','email','profile']);
  assert.deepEqual(m.authorization_servers,['https://abcdefghijklmnopqrst.supabase.co/auth/v1']);
  const unauth=await fetch(`http://127.0.0.1:${port}/mcp`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/list'})});
  assert.equal(unauth.status,401);assert.match(unauth.headers.get('www-authenticate')??'',/resource_metadata=.*oauth-protected-resource/);
  console.log('PASS B-S0 live fixture health/protected-resource metadata/unauth OAuth challenge');
  console.log('B_S0_LIVE_FIXTURE_SMOKE=PASS');
} finally {
  child.kill('SIGTERM');
}
