import {spawn} from 'node:child_process';
import {promises as fs,constants as C} from 'node:fs';
import {createHash} from 'node:crypto';
import {dirname,isAbsolute} from 'node:path';

const SHA=/^[a-f0-9]{64}$/;
const MAX_OUTPUT=1024;
const fail=code=>{throw Error(code);};
const digest=value=>createHash('sha256').update(value).digest('hex');

async function verifyBinary(binary,expectedSha256,prefix){
  if(typeof binary!=='string'||!isAbsolute(binary)||!SHA.test(expectedSha256??''))
    fail(`${prefix}_CONFIG_INVALID`);
  let real;try{real=await fs.realpath(binary);}catch{fail(`${prefix}_BINARY_UNSAFE`);}
  if(real!==binary)fail(`${prefix}_BINARY_UNSAFE`);
  const parent=dirname(binary);
  if(await fs.realpath(parent)!==parent)fail(`${prefix}_BINARY_UNSAFE`);
  const ps=await fs.lstat(parent);
  if(!ps.isDirectory()||ps.isSymbolicLink()||(ps.mode&0o077)!==0||
     (typeof process.getuid==='function'&&ps.uid!==process.getuid()))
    fail(`${prefix}_BINARY_UNSAFE`);
  const fd=await fs.open(binary,C.O_RDONLY|C.O_NOFOLLOW);
  try{
    const st=await fd.stat();
    if(!st.isFile()||st.nlink!==1||(st.mode&0o077)!==0||
       (typeof process.getuid==='function'&&st.uid!==process.getuid()))
      fail(`${prefix}_BINARY_UNSAFE`);
    if(digest(await fd.readFile())!==expectedSha256)fail(`${prefix}_BINARY_HASH_MISMATCH`);
  }finally{await fd.close();}
}

async function run(binary,args,prefix){
  return await new Promise((resolve,reject)=>{
    let child;
    try{child=spawn(binary,args,{stdio:['ignore','pipe','pipe'],shell:false,
      env:{PATH:'/usr/bin:/bin:/usr/sbin:/sbin',HOME:process.env.HOME??'',LANG:process.env.LANG??'en_US.UTF-8'}});}
    catch{return reject(Error(`${prefix}_SPAWN_FAILED`));}
    let stdout='',stderr='',ended=false,limited=false,timedOut=false;
    const timer=setTimeout(()=>{timedOut=true;child.kill('SIGKILL');},15000);
    const capture=(channel,c)=>{
      if(limited)return;
      if(Buffer.byteLength(stdout)+Buffer.byteLength(stderr)+c.length>MAX_OUTPUT){limited=true;child.kill('SIGKILL');return;}
      if(channel==='out')stdout+=c.toString('utf8');else stderr+=c.toString('utf8');
    };
    child.stdout.on('data',c=>capture('out',c));child.stderr.on('data',c=>capture('err',c));
    child.on('error',()=>{if(!ended){ended=true;clearTimeout(timer);reject(Error(`${prefix}_SPAWN_FAILED`));}});
    child.on('close',code=>{
      if(ended)return;ended=true;clearTimeout(timer);
      if(limited||timedOut)return reject(Error(`${prefix}_UNCERTAIN`));
      if(code!==0){const reason=stderr.trim();return reject(Error(/^[A-Z][A-Z0-9_]{4,80}$/.test(reason)?reason:`${prefix}_FAILED`));}
      resolve(stdout.trim());
    });
  });
}

function uncertain(code){const e=Error(code);e.effect='UNCERTAIN';e.retryable=false;return e;}

export async function nativeMoveExclusive({binary,expectedBinarySha256,source,destination,expectedSourceSha256=null}={}){
  if(typeof source!=='string'||!isAbsolute(source)||typeof destination!=='string'||!isAbsolute(destination)||
     !(expectedSourceSha256===null||SHA.test(expectedSourceSha256??'')))fail('BUSINESS_NATIVE_MOVE_CONFIG_INVALID');
  await verifyBinary(binary,expectedBinarySha256,'BUSINESS_NATIVE_MOVE');
  let output;
  try{output=await run(binary,[source,destination,expectedSourceSha256??'-'],'BUSINESS_MOVE');}
  catch(e){
    const code=String(e?.message??'');
    if(code==='MOVE_DESTINATION_EXISTS')fail('BUSINESS_DESTINATION_EXISTS');
    if(code==='MOVE_SOURCE_MISSING')fail('BUSINESS_PATH_NOT_FOUND');
    if(['MOVE_PRECONDITION_MISMATCH','MOVE_SOURCE_CHANGED'].includes(code))fail('BUSINESS_WRITE_CONFLICT');
    if(['MOVE_SOURCE_UNSUPPORTED','MOVE_PRECONDITION_UNSUPPORTED','MOVE_CROSS_DEVICE_DENIED','MOVE_PARENT_UNSAFE','MOVE_DESTINATION_UNSAFE'].includes(code))
      fail('BUSINESS_MOVE_UNSUPPORTED');
    if(code.endsWith('_UNCERTAIN'))throw uncertain('BUSINESS_MOVE_UNCERTAIN');
    throw e;
  }
  const match=output.match(/^MOVE_DONE dev=(\d+) ino=(\d+) kind=(regular_file|directory)$/);
  if(!match)throw uncertain('BUSINESS_MOVE_UNCERTAIN');
  try{
    const real=await fs.realpath(destination);if(real!==destination)throw Error('mismatch');
    const st=await fs.lstat(destination);
    if(st.isSymbolicLink()||String(st.dev)!==match[1]||String(st.ino)!==match[2])throw Error('mismatch');
  }catch{throw uncertain('BUSINESS_MOVE_UNCERTAIN');}
  return {changed:true,kind:match[3],commitMode:'DIRFD_RENAME_EXCL'};
}

export async function nativeDeleteBounded({binary,expectedBinarySha256,target,expectedKind,expectedSha256=null}={}){
  if(typeof target!=='string'||!isAbsolute(target)||!['regular_file','empty_directory'].includes(expectedKind)||
     !(expectedSha256===null||SHA.test(expectedSha256??'')))fail('BUSINESS_NATIVE_DELETE_CONFIG_INVALID');
  await verifyBinary(binary,expectedBinarySha256,'BUSINESS_NATIVE_DELETE');
  let output;
  try{output=await run(binary,[target,expectedKind,expectedSha256??'-'],'BUSINESS_DELETE');}
  catch(e){
    const code=String(e?.message??'');
    if(code==='DELETE_TARGET_MISSING')fail('BUSINESS_PATH_NOT_FOUND');
    if(code==='DELETE_PRECONDITION_REQUIRED')fail('BUSINESS_DELETE_PRECONDITION_REQUIRED');
    if(['DELETE_PRECONDITION_MISMATCH','DELETE_TARGET_CHANGED'].includes(code))fail('BUSINESS_WRITE_CONFLICT');
    if(code==='DELETE_KIND_MISMATCH')fail('BUSINESS_DELETE_KIND_MISMATCH');
    if(code==='DELETE_DIRECTORY_NOT_EMPTY')fail('BUSINESS_DIRECTORY_NOT_EMPTY');
    if(['DELETE_TARGET_UNSUPPORTED','DELETE_PARENT_UNSAFE','DELETE_TARGET_UNSAFE'].includes(code))fail('BUSINESS_DELETE_UNSUPPORTED');
    if(code.endsWith('_UNCERTAIN'))throw uncertain('BUSINESS_DELETE_UNCERTAIN');
    throw e;
  }
  const match=output.match(/^DELETE_DONE dev=(\d+) ino=(\d+) kind=(regular_file|empty_directory)$/);
  if(!match)throw uncertain('BUSINESS_DELETE_UNCERTAIN');
  try{await fs.lstat(target);const e=uncertain('BUSINESS_DELETE_UNCERTAIN');e.effect='COMMITTED';throw e;}
  catch(e){if(e?.effect==='COMMITTED')throw e;if(e?.code!=='ENOENT')throw uncertain('BUSINESS_DELETE_UNCERTAIN');}
  return {changed:true,kind:match[3],commitMode:'DIRFD_QUARANTINE_UNLINK'};
}
