import {existsSync,lstatSync,readFileSync,realpathSync} from 'node:fs';
import {isAbsolute} from 'node:path';

const SHA=/^[a-f0-9]{64}$/;
const ORG=/^[a-z0-9][a-z0-9._-]{0,63}$/;
const ENV=/^[A-Z][A-Z0-9_]{2,127}$/;
const fail=code=>{throw Error(code);};
const owner=()=>typeof process.getuid==='function'?process.getuid():null;
const KEYS=[
  'authConfigPath','backupKeyService','backupsDir','expectedNodeVersion','maintenanceDatabaseUrlEnv',
  'nodeBinary','organizationId','repoRoot','runtimeHealthUrl','schemaVersion'
].sort();

function privateFile(path){
  if(typeof path!=='string'||!isAbsolute(path)||!existsSync(path))fail('BUSINESS_V11_OPS_CONFIG_INVALID');
  const st=lstatSync(path);
  if(!st.isFile()||st.isSymbolicLink()||st.nlink!==1||(st.mode&0o022)!==0||(owner()!==null&&st.uid!==owner()))
    fail('BUSINESS_V11_OPS_CONFIG_UNSAFE');
  return realpathSync(path);
}
function absolute(value){if(typeof value!=='string'||!isAbsolute(value))fail('BUSINESS_V11_OPS_CONFIG_INVALID');return value;}
function healthUrl(value){
  if(typeof value!=='string'||value.length>512)fail('BUSINESS_V11_OPS_CONFIG_INVALID');
  let u;try{u=new URL(value);}catch{fail('BUSINESS_V11_OPS_CONFIG_INVALID');}
  if(u.protocol!=='http:'||!['127.0.0.1','localhost','::1'].includes(u.hostname)||!u.port||u.pathname!=='/healthz'||u.search||u.hash)
    fail('BUSINESS_V11_OPS_CONFIG_INVALID');
  return value;
}

export function loadBusinessV11OperatorConfig(path){
  path=privateFile(path);
  let cfg;try{cfg=JSON.parse(readFileSync(path,'utf8'));}catch{fail('BUSINESS_V11_OPS_CONFIG_INVALID');}
  if(!cfg||typeof cfg!=='object'||Array.isArray(cfg)||Object.keys(cfg).sort().join(',')!==KEYS.join(',')||
     cfg.schemaVersion!==2||typeof cfg.expectedNodeVersion!=='string'||!/^v24\.[0-9]+\.[0-9]+$/.test(cfg.expectedNodeVersion)||
     typeof cfg.nodeBinary!=='string'||!isAbsolute(cfg.nodeBinary)||typeof cfg.repoRoot!=='string'||!isAbsolute(cfg.repoRoot)||
     !ORG.test(cfg.organizationId??'')||typeof cfg.backupKeyService!=='string'||cfg.backupKeyService.length<3||cfg.backupKeyService.length>255||
     /[\0\r\n]/.test(cfg.backupKeyService)||!ENV.test(cfg.maintenanceDatabaseUrlEnv??''))
    fail('BUSINESS_V11_OPS_CONFIG_INVALID');
  absolute(cfg.authConfigPath);absolute(cfg.backupsDir);healthUrl(cfg.runtimeHealthUrl);
  return Object.freeze({...cfg,configPath:path});
}
