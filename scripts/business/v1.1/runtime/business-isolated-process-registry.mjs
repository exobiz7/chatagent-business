import {
  closeSync,existsSync,fsyncSync,lstatSync,openSync,readFileSync,renameSync,writeSync
} from 'node:fs';
import {createHash,createHmac,randomBytes,randomUUID,timingSafeEqual} from 'node:crypto';
import {dirname,isAbsolute,join} from 'node:path';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PROCESS=/^xexec_[a-f0-9]{32}$/;
const SHA=/^[a-f0-9]{64}$/;
const SLUG=/^[a-z0-9][a-z0-9._-]{0,63}$/;
const fail=code=>{throw Error(code);};
const uid=()=>typeof process.getuid==='function'?process.getuid():null;
const digest=value=>createHash('sha256').update(String(value)).digest('hex');

function safeDir(path){
  if(typeof path!=='string'||!isAbsolute(path)||!existsSync(path))fail('BUSINESS_ISOLATED_PROCESS_STATE_UNSAFE');
  const st=lstatSync(path);
  if(!st.isDirectory()||st.isSymbolicLink()||(st.mode&0o077)!==0||(uid()!==null&&st.uid!==uid()))
    fail('BUSINESS_ISOLATED_PROCESS_STATE_UNSAFE');
}
function safeFile(path){
  const st=lstatSync(path);
  if(!st.isFile()||st.isSymbolicLink()||st.nlink!==1||(st.mode&0o077)!==0||(uid()!==null&&st.uid!==uid()))
    fail('BUSINESS_ISOLATED_PROCESS_STATE_UNSAFE');
}
function atomic(path,bytes){
  const temp=`${path}.tmp-${randomUUID()}`,fd=openSync(temp,'wx',0o600);
  try{let at=0;while(at<bytes.length){const n=writeSync(fd,bytes,at,bytes.length-at);if(n<=0)fail('BUSINESS_ISOLATED_PROCESS_STATE_WRITE_UNCERTAIN');at+=n;}fsyncSync(fd);}
  finally{closeSync(fd);}
  renameSync(temp,path);const dfd=openSync(dirname(path),'r');try{fsyncSync(dfd);}finally{closeSync(dfd);}
}
function actor(value){
  if(typeof value!=='string'||value.length<8||value.length>512||/[\0\r\n]/.test(value))fail('BUSINESS_AUTHENTICATED_MEMBER_INVALID');
  return digest(value);
}
function validate(doc){
  if(!doc||typeof doc!=='object'||Array.isArray(doc)||doc.schemaVersion!==1||!Number.isSafeInteger(doc.revision)||doc.revision<0||!Array.isArray(doc.records))
    fail('BUSINESS_ISOLATED_PROCESS_STATE_INVALID');
  const ids=new Set();
  for(const r of doc.records){
    if(!r||typeof r!=='object'||Array.isArray(r)||!PROCESS.test(r.processId??'')||ids.has(r.processId)||!SHA.test(r.actorDigest??'')||
       !SLUG.test(r.projectId??'')||!UUID.test(r.runtimeNodeId??'')||!Number.isSafeInteger(r.mappingRevision)||r.mappingRevision<1||
       !['PERSONAL_NODE','SHARED_NODE'].includes(r.nodeType)||r.executionMode!=='ISOLATED'||!Number.isSafeInteger(r.createdAt))
      fail('BUSINESS_ISOLATED_PROCESS_STATE_INVALID');
    ids.add(r.processId);
  }
  return doc;
}
const copy=r=>Object.freeze({...r});

export class BusinessIsolatedProcessRegistry{
  constructor({stateDir,initialize=false}={}){
    safeDir(stateDir);this.file=join(stateDir,'business-isolated-process-bindings.json');this.keyFile=join(stateDir,'business-isolated-process-bindings.key');
    if(initialize){
      if(existsSync(this.file)||existsSync(this.keyFile))fail('BUSINESS_ISOLATED_PROCESS_STATE_ALREADY_INITIALIZED');
      this.key=randomBytes(32);atomic(this.keyFile,this.key);this.write({schemaVersion:1,revision:0,records:[]});
    }else{
      if(!existsSync(this.file)||!existsSync(this.keyFile))fail('BUSINESS_ISOLATED_PROCESS_STATE_NOT_INITIALIZED');
      safeFile(this.keyFile);this.key=readFileSync(this.keyFile);if(this.key.length!==32)fail('BUSINESS_ISOLATED_PROCESS_STATE_INVALID');
    }
    safeFile(this.keyFile);safeFile(this.file);this.read();
  }
  read(){
    safeFile(this.file);let sealed;try{sealed=JSON.parse(readFileSync(this.file,'utf8'));}catch{fail('BUSINESS_ISOLATED_PROCESS_STATE_INVALID');}
    if(!sealed||typeof sealed!=='object'||Array.isArray(sealed)||!sealed.payload||!SHA.test(sealed.mac??''))fail('BUSINESS_ISOLATED_PROCESS_STATE_INVALID');
    const expected=createHmac('sha256',this.key).update(JSON.stringify(sealed.payload)).digest('hex');
    if(!timingSafeEqual(Buffer.from(expected),Buffer.from(sealed.mac)))fail('BUSINESS_ISOLATED_PROCESS_STATE_INTEGRITY_FAILED');
    return validate(sealed.payload);
  }
  write(doc){
    const payload=validate(doc),mac=createHmac('sha256',this.key).update(JSON.stringify(payload)).digest('hex');
    atomic(this.file,Buffer.from(`${JSON.stringify({payload,mac},null,2)}\n`));return payload;
  }
  bind({processId,authenticatedMemberKey,projectId,runtimeNodeId,mappingRevision,nodeType}={}){
    const actorDigest=actor(authenticatedMemberKey);
    if(!PROCESS.test(processId??'')||!SLUG.test(projectId??'')||!UUID.test(runtimeNodeId??'')||
       !Number.isSafeInteger(mappingRevision)||mappingRevision<1||!['PERSONAL_NODE','SHARED_NODE'].includes(nodeType))
      fail('BUSINESS_ISOLATED_PROCESS_BINDING_INPUT_INVALID');
    const doc=this.read(),prior=doc.records.find(x=>x.processId===processId);
    if(prior){
      if(prior.actorDigest!==actorDigest||prior.projectId!==projectId||prior.runtimeNodeId!==runtimeNodeId||
         prior.mappingRevision!==mappingRevision||prior.nodeType!==nodeType)fail('BUSINESS_ISOLATED_PROCESS_BINDING_CONFLICT');
      return copy(prior);
    }
    const record={processId,actorDigest,projectId,runtimeNodeId,mappingRevision,nodeType,executionMode:'ISOLATED',createdAt:Date.now()};
    doc.records.push(record);doc.revision++;this.write(doc);return copy(record);
  }
  lookupForActor({processId,authenticatedMemberKey}={}){
    const actorDigest=actor(authenticatedMemberKey);
    if(!PROCESS.test(processId??''))fail('BUSINESS_PROCESS_NOT_OWNED');
    const record=this.read().records.find(x=>x.processId===processId);
    if(!record||record.actorDigest!==actorDigest)fail('BUSINESS_PROCESS_NOT_OWNED');
    return copy(record);
  }
  snapshot(){return this.read().records.map(copy);}
}
