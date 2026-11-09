import {randomBytes,timingSafeEqual} from 'node:crypto';
import {MacKeychainRefreshTokenStore} from './keychain-refresh-token-store.mjs';

const fail=code=>{throw Error(code);};
const decode=value=>{
  if(typeof value!=='string'||value.length<1||value.length>256)
    fail('BUSINESS_BACKUP_KEY_INVALID');
  let key;
  try{key=Buffer.from(value,'base64');}catch{fail('BUSINESS_BACKUP_KEY_INVALID');}
  if(key.length!==32||key.toString('base64')!==value)
    fail('BUSINESS_BACKUP_KEY_INVALID');
  return key;
};

export class MacKeychainBackupKeyStore {
  constructor({binary,binarySha256,backupRef,service='chatagent-business.continuity-backup'}={}){
    if(typeof backupRef!=='string'||!backupRef||backupRef.length>128)
      fail('BUSINESS_BACKUP_KEY_CONFIG_INVALID');
    this.store=new MacKeychainRefreshTokenStore({
      binary,binarySha256,service,account:backupRef
    });
  }
  read(){
    const encoded=this.store.read();
    return encoded===null?null:decode(encoded);
  }
  loadOrCreate(){
    const existing=this.read();
    if(existing)return existing;
    const created=randomBytes(32);
    try{
      this.store.write(created.toString('base64'));
      const verified=this.read();
      if(!verified||!timingSafeEqual(created,verified))
        fail('BUSINESS_BACKUP_KEY_WRITE_UNCERTAIN');
      return verified;
    }finally{
      created.fill(0);
    }
  }
  delete(){this.store.delete();}
}
