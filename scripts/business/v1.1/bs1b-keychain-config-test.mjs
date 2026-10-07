import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {createHash,randomUUID} from 'node:crypto';
import {chmodSync,mkdtempSync,readFileSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {MacKeychainRefreshTokenStore} from './control/keychain-refresh-token-store.mjs';
import {loadBusinessSupabaseConfig} from './control/supabase-runtime-config.mjs';

const repo=fileURLToPath(new URL('../../../',import.meta.url));
const manifest=JSON.parse(readFileSync(repo+'/docs/verification/v1.1/B_S0_PERSONAL_DONOR_MANIFEST.json','utf8'));
const gitBlobSha=buffer=>createHash('sha1').update(Buffer.concat([Buffer.from(`blob ${buffer.length}\0`),buffer])).digest('hex');
const wrapperBuffer=readFileSync(repo+'/scripts/business/v1.1/control/keychain-refresh-token-store.mjs');
const nativeBuffer=readFileSync(repo+'/scripts/business/v1.1/control/native-keychain-secret.c');
assert.equal(gitBlobSha(wrapperBuffer),manifest.memory['scripts/l1/memory/keychain-refresh-token-store.mjs']);
assert.equal(gitBlobSha(nativeBuffer),manifest.memory['scripts/l1/memory/native-keychain-secret.c']);

const root=mkdtempSync(join(tmpdir(),'business-s1b-keychain-'));
const binary=join(root,'keychain-helper');
const source=fileURLToPath(new URL('./control/native-keychain-secret.c',import.meta.url));
try{
  const cc=spawnSync('/usr/bin/clang',[
    '-std=c11','-Wall','-Wextra','-Werror','-O2',source,
    '-framework','Security','-framework','CoreFoundation','-o',binary
  ],{encoding:'utf8',timeout:15000});
  assert.equal(cc.status,0,cc.stderr);
  chmodSync(binary,0o700);
  const sha=createHash('sha256').update(readFileSync(binary)).digest('hex');

  assert.throws(()=>new MacKeychainRefreshTokenStore({
    binary,binarySha256:'0'.repeat(64),service:'chatagent-business.test',account:'fixture'
  }),/KEYCHAIN_HELPER_SHA_MISMATCH/);

  const store=new MacKeychainRefreshTokenStore({
    binary,binarySha256:sha,service:'chatagent-business.s1b-test.'+randomUUID(),account:'fixture'
  });
  if(process.env.BUSINESS_TEST_KEYCHAIN_LIVE==='1'){
    const secret='refresh-'+randomUUID();
    try{
      assert.equal(store.read(),null);
      store.write(secret);
      assert.equal(store.read(),secret);
      store.delete();
      assert.equal(store.read(),null);
    }finally{try{store.delete();}catch{}}
    console.log('PASS live macOS Keychain write/read/delete with secret only on stdin/stdout');
  }else{
    console.log('PASS native Keychain helper compiles and pinned-SHA wrapper validates');
    console.log('SKIP live Keychain mutation unless BUSINESS_TEST_KEYCHAIN_LIVE=1');
  }

  const cfgPath=join(root,'business-supabase.json');
  writeFileSync(cfgPath,JSON.stringify({
    schemaVersion:1,expectedSchemaVersion:1,
    projectRef:'abcdefghijklmnopqrst',url:'https://abcdefghijklmnopqrst.supabase.co',
    publishableKey:'sb_publishable_'+('k'.repeat(32)),
    keychainHelper:binary,keychainHelperSha256:sha,keychainService:'chatagent-business.auth'
  })+'\n',{mode:0o600});
  const cfg=loadBusinessSupabaseConfig(cfgPath);
  assert.equal(cfg.projectRef,'abcdefghijklmnopqrst');
  assert.ok(!Object.keys(cfg).some(k=>/secret|service_role|refresh_token/i.test(k)));

  const secretKey=join(root,'secret-key.json');
  const secretCfg=JSON.parse(readFileSync(cfgPath,'utf8'));
  secretCfg.publishableKey='sb_secret_'+('s'.repeat(32));
  writeFileSync(secretKey,JSON.stringify(secretCfg),{mode:0o600});
  assert.throws(()=>loadBusinessSupabaseConfig(secretKey),/BUSINESS_AUTH_CONFIG_INVALID/);

  const extraKey=join(root,'extra-key.json');
  writeFileSync(extraKey,JSON.stringify({...JSON.parse(readFileSync(cfgPath,'utf8')),serviceRoleKey:'forbidden'}),{mode:0o600});
  assert.throws(()=>loadBusinessSupabaseConfig(extraKey),/BUSINESS_AUTH_CONFIG_INVALID/);

  const unsafe=join(root,'unsafe.json');
  writeFileSync(unsafe,readFileSync(cfgPath),{mode:0o600});
  chmodSync(unsafe,0o666);
  assert.throws(()=>loadBusinessSupabaseConfig(unsafe),/BUSINESS_AUTH_CONFIG_UNSAFE/);

  console.log('PASS Keychain wrapper/native helper Git blobs exactly match frozen Personal v1.1.1 donor manifest');
  console.log('PASS publishable-only Business runtime config rejects secret/service-role fields and unsafe permissions');
  console.log('BUSINESS_S1B_KEYCHAIN_CONFIG=PASS');
}finally{
  rmSync(root,{recursive:true,force:true});
}
