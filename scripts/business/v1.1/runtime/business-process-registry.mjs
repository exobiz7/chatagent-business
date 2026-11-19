import {
  closeSync,existsSync,fsyncSync,lstatSync,openSync,readFileSync,renameSync,writeSync
} from 'node:fs';
import {createHash,createHmac,randomBytes,randomUUID,timingSafeEqual} from 'node:crypto';
import {dirname,isAbsolute,join} from 'node:path';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SLUG=/^[a-z0-9][a-z0-9._-]{0,63}$/;
const SHA=/^[a-f0-9]{64}$/;
const fail=code=>{throw Error(code);};
const uid=()=>typeof process.getuid==='function'?process.getuid():null;
const digest=value=>createHash('sha256').update(String(value)).digest('hex');

function safeDir(path){
  if(typeof path!=='string'||!isAbsolute(path)||!existsSync(path))fail('BUSINESS_PROCESS_STATE_UNSAFE');
  const st=lstatSync(path);
  if(!st.isDirectory()||st.isSymbolicLink()||(st.mode&0o077)!==0||(uid()!==null&&st.uid!==uid()))
    fail('BUSINESS_PROCESS_STATE_UNSAFE');
}
function safeFile(path){
  const st=lstatSync(path);
  if(!st.isFile()||st.isSymbolicLink()||st.nlink!==1||(st.mode&0o077)!==0||(uid()!==null&&st.uid!==uid()))
    fail('BUSINESS_PROCESS_STATE_UNSAFE');
}
function atomicBytes(path,body){
  const tmp=`${path}.tmp-${randomUUID()}`;
  const fd=openSync(tmp,'wx',0o600);
  try{
    let at=0;
    while(at<body.length){const n=writeSync(fd,body,at,body.length-at);if(n<=0)fail('BUSINESS_PROCESS_STATE_WRITE_UNCERTAIN');at+=n;}
    fsyncSync(fd);
  } finally { closeSync(fd); }
  renameSync(tmp,path);
  const dfd=openSync(dirname(path),'r');
  try{fsyncSync(dfd);}finally{closeSync(dfd);}
}
function cleanActor(value){
  if(typeof value!=='string'||value.length<8||value.length>512||/[\0\r\n]/.test(value))
    fail('BUSINESS_AUTHENTICATED_MEMBER_INVALID');
  return digest(value);
}
function validateDoc(doc){
  if(!doc||typeof doc!=='object'||Array.isArray(doc)||doc.schemaVersion!==1||
     !Number.isSafeInteger(doc.revision)||doc.revision<0||!Array.isArray(doc.records))
    fail('BUSINESS_PROCESS_STATE_INVALID');
  const keys=new Set(),processes=new Set();
  for(const r of doc.records){
    if(!r||typeof r!=='object'||Array.isArray(r)||!UUID.test(r.idempotencyKey??'')||!SHA.test(r.inputSha256??'')||
       !SHA.test(r.actorDigest??'')||!SLUG.test(r.projectId??'')||!UUID.test(r.runtimeNodeId??'')||
       !Number.isSafeInteger(r.mappingRevision)||r.mappingRevision<1||!['PERSONAL_NODE','SHARED_NODE'].includes(r.nodeType)||
       r.executionMode!=='HOST_USER'||!['RESERVED','BOUND'].includes(r.state)||
       !Number.isSafeInteger(r.createdAt)||!Number.isSafeInteger(r.updatedAt)||keys.has(r.idempotencyKey))
      fail('BUSINESS_PROCESS_STATE_INVALID');
    if(r.state==='BOUND'){
      if(!UUID.test(r.processId??'')||processes.has(r.processId))fail('BUSINESS_PROCESS_STATE_INVALID');
      processes.add(r.processId);
    } else if(r.processId!==null)fail('BUSINESS_PROCESS_STATE_INVALID');
    keys.add(r.idempotencyKey);
  }
  return doc;
}
const copy=r=>Object.freeze({...r});

export class BusinessProcessRegistry{
  constructor({stateDir,initialize=false}={}){
    safeDir(stateDir);this.file=join(stateDir,'business-process-bindings.json');
    this.keyFile=join(stateDir,'business-process-bindings.key');
    if(initialize){
      if(existsSync(this.file)||existsSync(this.keyFile))fail('BUSINESS_PROCESS_STATE_ALREADY_INITIALIZED');
      this.key=randomBytes(32);atomicBytes(this.keyFile,this.key);
      this.write({schemaVersion:1,revision:0,records:[]});
    } else {
      if(!existsSync(this.file)||!existsSync(this.keyFile))fail('BUSINESS_PROCESS_STATE_NOT_INITIALIZED');
      safeFile(this.keyFile);this.key=readFileSync(this.keyFile);
      if(this.key.length!==32)fail('BUSINESS_PROCESS_STATE_INVALID');
    }
    safeFile(this.keyFile);safeFile(this.file);this.read();
  }
  read(){
    safeFile(this.file);let sealed;
    try{sealed=JSON.parse(readFileSync(this.file,'utf8'));}catch{fail('BUSINESS_PROCESS_STATE_INVALID');}
    if(!sealed||typeof sealed!=='object'||Array.isArray(sealed)||!sealed.payload||typeof sealed.mac!=='string'||!SHA.test(sealed.mac))
      fail('BUSINESS_PROCESS_STATE_INVALID');
    const expected=createHmac('sha256',this.key).update(JSON.stringify(sealed.payload)).digest('hex');
    if(!timingSafeEqual(Buffer.from(expected),Buffer.from(sealed.mac)))fail('BUSINESS_PROCESS_STATE_INTEGRITY_FAILED');
    return validateDoc(sealed.payload);
  }
  write(doc){
    const payload=validateDoc(doc);
    const mac=createHmac('sha256',this.key).update(JSON.stringify(payload)).digest('hex');
    atomicBytes(this.file,Buffer.from(`${JSON.stringify({payload,mac},null,2)}\n`));return payload;
  }
  actorDigest(authenticatedMemberKey){return cleanActor(authenticatedMemberKey);}

  reserveStart({idempotencyKey,inputSha256,authenticatedMemberKey,projectId,runtimeNodeId,mappingRevision,nodeType}={}){
    const actorDigest=cleanActor(authenticatedMemberKey);
    if(!UUID.test(idempotencyKey??'')||!SHA.test(inputSha256??'')||!SLUG.test(projectId??'')||
       !UUID.test(runtimeNodeId??'')||!Number.isSafeInteger(mappingRevision)||mappingRevision<1||
       !['PERSONAL_NODE','SHARED_NODE'].includes(nodeType))fail('BUSINESS_PROCESS_BINDING_INPUT_INVALID');
    const doc=this.read(),prior=doc.records.find(x=>x.idempotencyKey===idempotencyKey);
    if(prior){
      if(prior.inputSha256!==inputSha256||prior.actorDigest!==actorDigest||prior.projectId!==projectId||
         prior.runtimeNodeId!==runtimeNodeId||prior.mappingRevision!==mappingRevision||prior.nodeType!==nodeType)
        fail('BUSINESS_IDEMPOTENCY_CONFLICT');
      return copy(prior);
    }
    const now=Date.now();
    const record={idempotencyKey,inputSha256,actorDigest,projectId,runtimeNodeId,mappingRevision,nodeType,
      executionMode:'HOST_USER',state:'RESERVED',processId:null,createdAt:now,updatedAt:now};
    doc.records.push(record);doc.revision++;this.write(doc);return copy(record);
  }

  bind({idempotencyKey,inputSha256,processId}={}){
    if(!UUID.test(idempotencyKey??'')||!SHA.test(inputSha256??'')||!UUID.test(processId??''))
      fail('BUSINESS_PROCESS_BINDING_INPUT_INVALID');
    const doc=this.read(),record=doc.records.find(x=>x.idempotencyKey===idempotencyKey);
    if(!record||record.inputSha256!==inputSha256)fail('BUSINESS_PROCESS_BINDING_MISSING');
    if(record.state==='BOUND'){
      if(record.processId!==processId)fail('BUSINESS_PROCESS_BINDING_CONFLICT');
      return copy(record);
    }
    if(doc.records.some(x=>x.processId===processId))fail('BUSINESS_PROCESS_BINDING_CONFLICT');
    record.state='BOUND';record.processId=processId;record.updatedAt=Date.now();doc.revision++;
    this.write(doc);return copy(record);
  }

  lookupForActor({processId,authenticatedMemberKey}={}){
    const actorDigest=cleanActor(authenticatedMemberKey);
    if(!UUID.test(processId??''))fail('BUSINESS_PROCESS_NOT_OWNED');
    const record=this.read().records.find(x=>x.state==='BOUND'&&x.processId===processId);
    if(!record||record.actorDigest!==actorDigest)fail('BUSINESS_PROCESS_NOT_OWNED');
    return copy(record);
  }

  snapshot(){return this.read().records.map(copy);}
}
