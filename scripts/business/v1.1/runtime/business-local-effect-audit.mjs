import {
  closeSync,existsSync,fsyncSync,lstatSync,openSync,readFileSync,writeSync
} from 'node:fs';
import {createHash,createHmac,randomBytes,randomUUID,timingSafeEqual} from 'node:crypto';
import {isAbsolute,join} from 'node:path';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SHA=/^[a-f0-9]{64}$/;
const PROJECT=/^[a-z0-9][a-z0-9._-]{0,63}$/;
const ORG=/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const TOOL=/^fs_[a-z0-9_]{3,48}$/;
const CODE=/^[A-Z][A-Z0-9_]{1,79}$/;
const PROFILES=new Set(['READ_ONLY','SAFE','STANDARD']);
const NODES=new Set(['PERSONAL_NODE','SHARED_NODE']);
const EFFECTS=new Set(['CREATE','REPLACE','PATCH','MOVE','DELETE']);
const STAGES=new Set(['ISSUED','COMPLETED','FAILED']);
const OUTCOMES=new Set(['PENDING','NONE','COMMITTED','UNCERTAIN']);
const fail=code=>{throw Error(code);};
const uid=()=>typeof process.getuid==='function'?process.getuid():null;
const actorDigest=value=>createHash('sha256').update(String(value)).digest('hex');

function safeDir(path){
  if(typeof path!=='string'||!isAbsolute(path)||!existsSync(path))fail('BUSINESS_LOCAL_AUDIT_STATE_UNSAFE');
  const st=lstatSync(path);
  if(!st.isDirectory()||st.isSymbolicLink()||(st.mode&0o077)!==0||(uid()!==null&&st.uid!==uid()))
    fail('BUSINESS_LOCAL_AUDIT_STATE_UNSAFE');
}
function safeFile(path){
  const st=lstatSync(path);
  if(!st.isFile()||st.isSymbolicLink()||st.nlink!==1||(st.mode&0o077)!==0||(uid()!==null&&st.uid!==uid()))
    fail('BUSINESS_LOCAL_AUDIT_STATE_UNSAFE');
  return st;
}
function writeNew(path,bytes){
  const fd=openSync(path,'wx',0o600);
  try{let at=0;while(at<bytes.length){const n=writeSync(fd,bytes,at,bytes.length-at);if(n<=0)fail('BUSINESS_LOCAL_AUDIT_WRITE_UNCERTAIN');at+=n;}fsyncSync(fd);}
  finally{closeSync(fd);}
}
function relative(value){
  if(typeof value!=='string'||value.length<1||value.length>4096||value.startsWith('/')||/[\0\r\n]/.test(value))
    fail('BUSINESS_LOCAL_AUDIT_EVENT_INVALID');
  return value;
}
function cleanActor(value){
  if(typeof value!=='string'||value.length<8||value.length>512||/[\0\r\n]/.test(value))fail('BUSINESS_LOCAL_AUDIT_EVENT_INVALID');
  return actorDigest(value);
}
function validatePayload(p){
  if(!p||typeof p!=='object'||Array.isArray(p)||!Number.isSafeInteger(p.seq)||p.seq<1||
     !(p.prevMac===null||SHA.test(p.prevMac))||!UUID.test(p.requestId??'')||!Number.isSafeInteger(p.timestamp)||
     !SHA.test(p.actorDigest??'')||!ORG.test(p.organizationId??'')||!PROJECT.test(p.projectId??'')||
     !UUID.test(p.runtimeNodeId??'')||!Number.isSafeInteger(p.mappingRevision)||p.mappingRevision<1||
     !NODES.has(p.nodeType)||!PROFILES.has(p.projectProfile)||!TOOL.test(p.tool??'')||!EFFECTS.has(p.effectClass)||
     !STAGES.has(p.stage)||!Array.isArray(p.targetRelativePaths)||p.targetRelativePaths.length<1||p.targetRelativePaths.length>2||
     p.targetRelativePaths.some(x=>{try{return relative(x)!==x;}catch{return true;}})||
     !(p.preconditionDigest===null||SHA.test(p.preconditionDigest))||!CODE.test(p.resultCode??'')||!OUTCOMES.has(p.effectOutcome))
    fail('BUSINESS_LOCAL_AUDIT_EVENT_INVALID');
  return p;
}

export class BusinessLocalEffectAudit{
  constructor({stateDir,initialize=false,maxBytes=4*1024*1024}={}){
    if(!Number.isInteger(maxBytes)||maxBytes<64*1024||maxBytes>32*1024*1024)fail('BUSINESS_LOCAL_AUDIT_CONFIG_INVALID');
    safeDir(stateDir);this.file=join(stateDir,'local-effect-audit.jsonl');this.keyFile=join(stateDir,'local-effect-audit.key');this.maxBytes=maxBytes;
    if(initialize){
      if(existsSync(this.file)||existsSync(this.keyFile))fail('BUSINESS_LOCAL_AUDIT_ALREADY_INITIALIZED');
      writeNew(this.keyFile,randomBytes(32));writeNew(this.file,Buffer.alloc(0));
    }
    if(!existsSync(this.file)||!existsSync(this.keyFile))fail('BUSINESS_LOCAL_AUDIT_NOT_INITIALIZED');
    safeFile(this.file);safeFile(this.keyFile);this.key=readFileSync(this.keyFile);if(this.key.length!==32)fail('BUSINESS_LOCAL_AUDIT_INTEGRITY_FAILED');
    this.verify();
  }

  verify(){
    safeFile(this.file);const text=readFileSync(this.file,'utf8');const lines=text?text.trimEnd().split('\n').filter(Boolean):[];
    const out=[];let prev=null,seq=0;
    for(const line of lines){
      let sealed;try{sealed=JSON.parse(line);}catch{fail('BUSINESS_LOCAL_AUDIT_INTEGRITY_FAILED');}
      if(!sealed||typeof sealed!=='object'||Array.isArray(sealed)||!sealed.payload||!SHA.test(sealed.mac??''))
        fail('BUSINESS_LOCAL_AUDIT_INTEGRITY_FAILED');
      const payload=validatePayload(sealed.payload);
      if(payload.seq!==seq+1||payload.prevMac!==prev)fail('BUSINESS_LOCAL_AUDIT_INTEGRITY_FAILED');
      const expected=createHmac('sha256',this.key).update(JSON.stringify(payload)).digest('hex');
      if(!timingSafeEqual(Buffer.from(expected),Buffer.from(sealed.mac)))fail('BUSINESS_LOCAL_AUDIT_INTEGRITY_FAILED');
      out.push({...payload,mac:sealed.mac});prev=sealed.mac;seq=payload.seq;
    }
    return out;
  }

  append({requestId=randomUUID(),authenticatedMemberKey,organizationId,projectId,runtimeNodeId,mappingRevision,nodeType,
    projectProfile,tool,effectClass,stage,targetRelativePaths,preconditionDigest=null,resultCode,effectOutcome}={}){
    const records=this.verify(),prev=records.at(-1)?.mac??null;
    const payload=validatePayload({seq:records.length+1,prevMac:prev,requestId,timestamp:Date.now(),actorDigest:cleanActor(authenticatedMemberKey),
      organizationId,projectId,runtimeNodeId,mappingRevision,nodeType,projectProfile,tool,effectClass,stage,
      targetRelativePaths:[...targetRelativePaths],preconditionDigest,resultCode,effectOutcome});
    const mac=createHmac('sha256',this.key).update(JSON.stringify(payload)).digest('hex');
    const line=Buffer.from(JSON.stringify({payload,mac})+'\n');
    const st=safeFile(this.file);if(st.size+line.length>this.maxBytes)fail('BUSINESS_LOCAL_AUDIT_FULL');
    const fd=openSync(this.file,'a',0o600);
    try{let at=0;while(at<line.length){const n=writeSync(fd,line,at,line.length-at);if(n<=0)fail('BUSINESS_LOCAL_AUDIT_WRITE_UNCERTAIN');at+=n;}fsyncSync(fd);}
    finally{closeSync(fd);}
    return {...payload,mac};
  }

  readRecent(limit=50){
    if(!Number.isInteger(limit)||limit<1||limit>200)fail('BUSINESS_LOCAL_AUDIT_LIMIT_INVALID');
    return this.verify().slice(-limit).map(x=>({...x}));
  }
}
