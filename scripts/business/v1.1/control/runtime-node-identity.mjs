import {
  existsSync,lstatSync,openSync,readFileSync,writeSync,fsyncSync,closeSync
} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {dirname,isAbsolute} from 'node:path';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const fail=code=>{throw Error(code);};
const owner=()=>typeof process.getuid==='function'?process.getuid():null;

const safeParent=path=>{
  const parent=dirname(path);
  if(!existsSync(parent))fail('BUSINESS_NODE_PARENT_MISSING');
  const st=lstatSync(parent);
  if(!st.isDirectory()||st.isSymbolicLink()||(st.mode&0o077)!==0||
     (owner()!==null&&st.uid!==owner()))
    fail('BUSINESS_NODE_PARENT_UNSAFE');
};

const safeFile=path=>{
  const st=lstatSync(path);
  if(!st.isFile()||st.isSymbolicLink()||st.nlink!==1||(st.mode&0o077)!==0||
     (owner()!==null&&st.uid!==owner()))
    fail('BUSINESS_NODE_FILE_UNSAFE');
};

const parse=value=>{
  let x;
  try{x=JSON.parse(value);}catch{fail('BUSINESS_NODE_FILE_INVALID');}
  if(!x||x.schemaVersion!==1||!UUID.test(x.nodeId??'')||
     typeof x.nodeName!=='string'||x.nodeName.length<1||x.nodeName.length>128||
     x.platform!=='macos'||!Number.isSafeInteger(x.createdAt)||x.createdAt<=0)
    fail('BUSINESS_NODE_FILE_INVALID');
  return Object.freeze({...x});
};

export function loadRuntimeNodeIdentity(path){
  if(typeof path!=='string'||!isAbsolute(path))fail('BUSINESS_NODE_PATH_INVALID');
  safeParent(path);
  if(!existsSync(path))fail('BUSINESS_NODE_NOT_ENROLLED');
  safeFile(path);
  return parse(readFileSync(path,'utf8'));
}

export function loadOrCreateRuntimeNodeIdentity(path,{nodeName,platform='macos'}={}){
  if(typeof path!=='string'||!isAbsolute(path))fail('BUSINESS_NODE_PATH_INVALID');
  if(typeof nodeName!=='string'||!nodeName.trim()||nodeName.trim().length>128||platform!=='macos')
    fail('BUSINESS_NODE_INPUT_INVALID');
  safeParent(path);
  if(existsSync(path))return loadRuntimeNodeIdentity(path);
  const record={schemaVersion:1,nodeId:randomUUID(),nodeName:nodeName.trim(),platform,createdAt:Date.now()};
  const body=Buffer.from(JSON.stringify(record)+'\n','utf8');
  const fd=openSync(path,'wx',0o600);
  try{
    let offset=0;
    while(offset<body.length){
      const n=writeSync(fd,body,offset,body.length-offset);
      if(n<=0)fail('BUSINESS_NODE_WRITE_UNCERTAIN');
      offset+=n;
    }
    fsyncSync(fd);
  }finally{closeSync(fd);}
  safeFile(path);
  return Object.freeze(record);
}
