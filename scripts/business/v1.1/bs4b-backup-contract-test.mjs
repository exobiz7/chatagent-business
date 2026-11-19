import assert from 'node:assert/strict';
import {createHash,randomUUID,timingSafeEqual} from 'node:crypto';
import {chmodSync,mkdtempSync,readFileSync,rmSync,writeFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {MacKeychainBackupKeyStore} from './control/keychain-backup-key-store.mjs';

const repo=fileURLToPath(new URL('../../../',import.meta.url));
const manifest=JSON.parse(readFileSync(join(repo,'docs/verification/v1.1/B_S0_PERSONAL_DONOR_MANIFEST.json'),'utf8'));
const keySource=readFileSync(join(repo,'scripts/business/v1.1/control/keychain-backup-key-store.mjs'),'utf8');
const refreshSource=readFileSync(join(repo,'scripts/business/v1.1/control/keychain-refresh-token-store.mjs'));
const nativeSource=readFileSync(join(repo,'scripts/business/v1.1/control/native-keychain-secret.c'));
const backupSource=readFileSync(join(repo,'scripts/business/v1.1/backup/business-continuity-logical-backup.mjs'),'utf8');
const contractSource=readFileSync(join(repo,'scripts/business/v1.1/backup/business-continuity-logical-contract.mjs'),'utf8');
const sql=readFileSync(join(repo,'scripts/business/v1.1/backup/bs4b-logical-backup-restore.sql'),'utf8');
const frozen=JSON.parse(readFileSync(join(repo,'docs/verification/v1.1/B_S0_SUPABASE_SCHEMA_RPC_CONTRACT.json'),'utf8'));
const gitBlobSha=buffer=>createHash('sha1').update(Buffer.concat([Buffer.from(`blob ${buffer.length}\0`),buffer])).digest('hex');

assert.equal(gitBlobSha(refreshSource),manifest.memory['scripts/l1/memory/keychain-refresh-token-store.mjs']);
assert.equal(gitBlobSha(nativeSource),manifest.memory['scripts/l1/memory/native-keychain-secret.c']);
assert.match(keySource,/MacKeychainRefreshTokenStore/);
assert.match(keySource,/chatagent-business\.continuity-backup/);
assert.match(keySource,/randomBytes\(32\)/);
assert.doesNotMatch(keySource,/chatagent-personal|\.\.\/\.\.\/\.\.\/.*personal/i);
assert.match(backupSource,/aes-256-gcm/);
assert.match(backupSource,/randomBytes\(12\)/);
assert.match(backupSource,/setAAD\(AAD\)/);
assert.match(backupSource,/getAuthTag\(\)/);
assert.match(backupSource,/flag:'wx',mode:0o600/);
assert.match(contractSource,/chatagent-business-continuity-logical-v1/);
assert.match(sql,/function private_business_continuity\._backup_export\(p_organization_slug text\)/);
assert.match(sql,/function private_business_continuity\._restore_empty\(p_snapshot jsonb,p_restore_actor_user_id uuid\)/);
assert.match(sql,/BUSINESS_RESTORE_TARGET_NOT_EMPTY/);
assert.match(sql,/BUSINESS_RESTORE_MEMBER_PREREQUISITE_MISSING/);
assert.match(sql,/BUSINESS_RESTORE_NODE_PREREQUISITE_MISSING/);
assert.match(sql,/revoke all on function private_business_continuity\._backup_export\(text\) from public,anon,authenticated/);
assert.match(sql,/revoke all on function private_business_continuity\._restore_empty\(jsonb,uuid\) from public,anon,authenticated/);
assert.doesNotMatch(sql,/function public\.bc_(?:backup|restore)/,'backup/restore must not widen the frozen authenticated runtime RPC surface');
assert.deepEqual(frozen.rpc.migrationTemporary,['bc_import_snapshot']);

const root=mkdtempSync(join(tmpdir(),'business-bs4b-key-'));
const helper=join(root,'helper'),secret=join(root,'secret');
const service='chatagent-business.continuity-backup.test.'+randomUUID();
const account='backup-fixture';
const script=`#!/bin/sh\nset -eu\n[ "$2" = "${service}" ] || { echo KEYCHAIN_INVALID_LABEL >&2; exit 2; }\n[ "$3" = "${account}" ] || { echo KEYCHAIN_INVALID_LABEL >&2; exit 2; }\ncase "$1" in\n write) cat > '${secret}'; chmod 600 '${secret}' ;;\n read) [ -f '${secret}' ] || { echo KEYCHAIN_NOT_FOUND >&2; exit 2; }; cat '${secret}' ;;\n delete) [ -f '${secret}' ] || { echo KEYCHAIN_NOT_FOUND >&2; exit 2; }; rm '${secret}' ;;\n *) echo KEYCHAIN_INVALID_OPERATION >&2; exit 2 ;;\nesac\n`;
try{
  writeFileSync(helper,script,{mode:0o700,flag:'wx'});chmodSync(helper,0o700);
  const helperSha256=createHash('sha256').update(readFileSync(helper)).digest('hex');
  const store=new MacKeychainBackupKeyStore({binary:helper,binarySha256:helperSha256,backupRef:account,service});
  assert.equal(store.read(),null);
  const first=store.loadOrCreate();assert.equal(Buffer.isBuffer(first),true);assert.equal(first.length,32);
  const second=store.loadOrCreate();assert.deepEqual(second,first);
  assert.equal(readFileSync(secret,'utf8'),first.toString('base64'));
  store.delete();assert.equal(store.read(),null);
  first.fill(0);second.fill(0);

  if(process.env.BUSINESS_TEST_KEYCHAIN_LIVE==='1'){
    const nativeBinary=join(root,'native-keychain-helper');
    const nativePath=join(repo,'scripts/business/v1.1/control/native-keychain-secret.c');
    const cc=spawnSync('/usr/bin/clang',['-std=c11','-Wall','-Wextra','-Werror','-O2',nativePath,'-framework','Security','-framework','CoreFoundation','-o',nativeBinary],{encoding:'utf8',timeout:15000});
    assert.equal(cc.status,0,cc.stderr);chmodSync(nativeBinary,0o700);
    const nativeSha=createHash('sha256').update(readFileSync(nativeBinary)).digest('hex');
    const liveStore=new MacKeychainBackupKeyStore({binary:nativeBinary,binarySha256:nativeSha,backupRef:'bs4b-'+randomUUID(),service:'chatagent-business.continuity-backup.live-test.'+randomUUID()});
    let liveKey=null;
    try{
      assert.equal(liveStore.read(),null);liveKey=liveStore.loadOrCreate();const reread=liveStore.read();
      assert.equal(reread.length,32);assert.equal(timingSafeEqual(liveKey,reread),true);
      liveStore.delete();assert.equal(liveStore.read(),null);reread.fill(0);
      console.log('PASS live macOS Keychain backup-key create/read/delete through pinned native helper');
    }finally{try{liveStore.delete();}catch{} if(liveKey)liveKey.fill(0);}
  }else console.log('SKIP live backup-key Keychain mutation unless BUSINESS_TEST_KEYCHAIN_LIVE=1');
}finally{rmSync(root,{recursive:true,force:true});}

console.log('PASS frozen Business Keychain wrapper/native helper remain exact Personal v1.1.1 donor blobs');
console.log('PASS Business backup key adapter uses independent service/account and verified 32-byte Keychain custody interface');
console.log('PASS AES-256-GCM backup contract uses authenticated format AAD, fresh 12-byte nonce and exclusive 0600 archive creation');
console.log('PASS backup/restore SQL remains operator-private and does not widen the frozen authenticated RPC contract');
console.log('BUSINESS_S4B_BACKUP_CONTRACT=PASS');
