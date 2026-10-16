import {existsSync,lstatSync,readFileSync} from 'node:fs';
import {isAbsolute} from 'node:path';

const URL=/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i;
const PUB=/^sb_publishable_[A-Za-z0-9_-]{16,}$/;
const PROJECT_REF=/^[a-z0-9]{20}$/;
const KEYS=Object.freeze(['projectRef','publishableKey','schemaVersion','url'].sort());
const fail=code=>{throw Error(code);};
const owner=()=>typeof process.getuid==='function'?process.getuid():null;

export function loadBusinessPublishableRuntimeConfig(path){
  if(typeof path!=='string'||!isAbsolute(path)||!existsSync(path))
    fail('BUSINESS_PUBLIC_CONFIG_INVALID');
  const st=lstatSync(path);
  if(!st.isFile()||st.isSymbolicLink()||st.nlink!==1||(st.mode&0o077)!==0||
     (owner()!==null&&st.uid!==owner()))
    fail('BUSINESS_PUBLIC_CONFIG_UNSAFE');
  let cfg;
  try{cfg=JSON.parse(readFileSync(path,'utf8'));}
  catch{fail('BUSINESS_PUBLIC_CONFIG_INVALID');}
  if(!cfg||typeof cfg!=='object'||Array.isArray(cfg)||
     Object.keys(cfg).sort().join(',')!==KEYS.join(',')||cfg.schemaVersion!==1||
     typeof cfg.projectRef!=='string'||!PROJECT_REF.test(cfg.projectRef)||
     typeof cfg.url!=='string'||!URL.test(cfg.url)||
     typeof cfg.publishableKey!=='string'||!PUB.test(cfg.publishableKey))
    fail('BUSINESS_PUBLIC_CONFIG_INVALID');
  return Object.freeze({...cfg,url:cfg.url.replace(/\/$/,'')});
}
