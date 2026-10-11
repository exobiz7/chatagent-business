import {randomBytes,createCipheriv,createDecipheriv,createHash} from 'node:crypto';
import {existsSync,lstatSync,readFileSync,writeFileSync,openSync,closeSync,fsyncSync} from 'node:fs';
import {dirname,isAbsolute} from 'node:path';
import {businessContinuityLogicalDigest,canonicalBusinessContinuityLogicalSnapshot,normalizeBusinessContinuityLogicalSnapshot} from './business-continuity-logical-contract.mjs';

const FORMAT='chatagent-business-continuity-backup-v1';
const MAX_BACKUP=96*1024*1024;
const AAD=Buffer.from(FORMAT,'utf8');
const fail=code=>{throw Error(code);};
const sha=data=>createHash('sha256').update(data).digest('hex');
const owner=()=>typeof process.getuid==='function'?process.getuid():null;
const keyCheck=key=>{if(!Buffer.isBuffer(key)||key.length!==32)fail('BUSINESS_BACKUP_KEY_REQUIRED');};
const ownerDir=path=>{
  const st=lstatSync(path);
  if(!st.isDirectory()||st.isSymbolicLink()||(st.mode&0o077)!==0||(owner()!==null&&st.uid!==owner()))
    fail('BUSINESS_BACKUP_PARENT_UNSAFE');
};
const ownerFile=path=>{
  const st=lstatSync(path);
  if(!st.isFile()||st.isSymbolicLink()||st.nlink!==1||(st.mode&0o077)!==0||(owner()!==null&&st.uid!==owner()))
    fail('BUSINESS_BACKUP_FILE_UNSAFE');
  return st;
};
const syncFile=path=>{const fd=openSync(path,'r');try{fsyncSync(fd);}finally{closeSync(fd);}};
const syncDir=path=>{const fd=openSync(path,'r');try{fsyncSync(fd);}finally{closeSync(fd);}};
const newArchivePath=path=>{
  if(typeof path!=='string'||!isAbsolute(path)||existsSync(path))fail('BUSINESS_BACKUP_NEW_PATH_REQUIRED');
  ownerDir(dirname(path));
};

function buildPackage({snapshot,backupRef,createdAt}){
  const normalized=normalizeBusinessContinuityLogicalSnapshot(snapshot);
  if(typeof backupRef!=='string'||!backupRef||backupRef.length>128||!Number.isSafeInteger(createdAt)||createdAt<=0)
    fail('BUSINESS_BACKUP_METADATA_INVALID');
  const logicalDigest=businessContinuityLogicalDigest(normalized);
  const canonicalSnapshot=canonicalBusinessContinuityLogicalSnapshot(normalized);
  const metadata={
    format:FORMAT,schemaVersion:1,contractVersion:1,backupRef,createdAt,
    organizationSlug:normalized.organizationSlug,contextSeq:normalized.contextSeq,
    logicalDigest,counts:normalized.counts
  };
  const entries={
    'metadata.json':JSON.stringify(metadata)+'\n',
    'snapshot.json':canonicalSnapshot+'\n'
  };
  const files=Object.fromEntries(Object.entries(entries).map(([name,body])=>[name,sha(Buffer.from(body,'utf8'))]));
  entries['manifest.json']=JSON.stringify({version:1,files,logicalDigest})+'\n';
  const body=Buffer.from(JSON.stringify({schema:1,entries}),'utf8');
  if(body.length<1||body.length>MAX_BACKUP)fail('BUSINESS_BACKUP_SIZE_LIMIT');
  return {body,logicalDigest,normalized};
}

function unpackPackage(buffer){
  if(!Buffer.isBuffer(buffer)||buffer.length<1||buffer.length>MAX_BACKUP)fail('BUSINESS_BACKUP_PAYLOAD_INVALID');
  let pkg;try{pkg=JSON.parse(buffer.toString('utf8'));}catch{fail('BUSINESS_BACKUP_PAYLOAD_INVALID');}
  const expected=['manifest.json','metadata.json','snapshot.json'];
  if(pkg?.schema!==1||!pkg.entries||typeof pkg.entries!=='object'||Object.keys(pkg.entries).sort().join(',')!==expected.join(','))
    fail('BUSINESS_BACKUP_PAYLOAD_INVALID');
  for(const name of expected)if(typeof pkg.entries[name]!=='string'||Buffer.byteLength(pkg.entries[name])>MAX_BACKUP)fail('BUSINESS_BACKUP_PAYLOAD_INVALID');
  let metadata,manifest,snapshot;
  try{
    metadata=JSON.parse(pkg.entries['metadata.json']);manifest=JSON.parse(pkg.entries['manifest.json']);snapshot=JSON.parse(pkg.entries['snapshot.json']);
  }catch{fail('BUSINESS_BACKUP_PAYLOAD_INVALID');}
  if(metadata?.format!==FORMAT||metadata.schemaVersion!==1||metadata.contractVersion!==1||
     typeof metadata.backupRef!=='string'||!metadata.backupRef||metadata.backupRef.length>128||
     !Number.isSafeInteger(metadata.createdAt)||metadata.createdAt<=0||typeof metadata.organizationSlug!=='string'||
     !Number.isSafeInteger(metadata.contextSeq)||metadata.contextSeq<0||!/^sha256:[a-f0-9]{64}$/.test(metadata.logicalDigest??'')||
     manifest?.version!==1||manifest.logicalDigest!==metadata.logicalDigest||!manifest.files||typeof manifest.files!=='object')
    fail('BUSINESS_BACKUP_MANIFEST_INVALID');
  if(Object.keys(manifest.files).sort().join(',')!==['metadata.json','snapshot.json'].sort().join(','))fail('BUSINESS_BACKUP_MANIFEST_INVALID');
  for(const name of ['metadata.json','snapshot.json'])if(manifest.files[name]!==sha(Buffer.from(pkg.entries[name],'utf8')))fail('BUSINESS_BACKUP_FILE_HASH_MISMATCH');
  const normalized=normalizeBusinessContinuityLogicalSnapshot(snapshot),digest=businessContinuityLogicalDigest(normalized);
  const countKeys=['projects','privateProjectMembers','tasks','checkpoints','operations','events'];
  if(canonicalBusinessContinuityLogicalSnapshot(normalized)+'\n'!==pkg.entries['snapshot.json']||digest!==metadata.logicalDigest||digest!==manifest.logicalDigest||
     normalized.organizationSlug!==metadata.organizationSlug||normalized.contextSeq!==metadata.contextSeq||
     !metadata.counts||countKeys.some(key=>metadata.counts[key]!==normalized.counts[key]))fail('BUSINESS_BACKUP_LOGICAL_DIGEST_MISMATCH');
  return {snapshot:normalized,metadata,manifest,digest};
}

export function createEncryptedBusinessContinuityBackup({snapshot,archivePath,archiveKey,backupRef,createdAt=Date.now()}={}){
  keyCheck(archiveKey);newArchivePath(archivePath);
  const {body,logicalDigest}=buildPackage({snapshot,backupRef,createdAt});
  const nonce=randomBytes(12),cipher=createCipheriv('aes-256-gcm',archiveKey,nonce);cipher.setAAD(AAD);
  const ciphertext=Buffer.concat([cipher.update(body),cipher.final()]);
  const envelope=Buffer.from(JSON.stringify({
    version:1,format:FORMAT,algorithm:'aes-256-gcm',nonce:nonce.toString('base64'),tag:cipher.getAuthTag().toString('base64'),ciphertext:ciphertext.toString('base64')
  })+'\n','utf8');
  if(envelope.length>MAX_BACKUP*2)fail('BUSINESS_BACKUP_SIZE_LIMIT');
  writeFileSync(archivePath,envelope,{flag:'wx',mode:0o600});syncFile(archivePath);syncDir(dirname(archivePath));ownerFile(archivePath);
  return Object.freeze({encrypted:true,format:FORMAT,logicalDigest,ciphertextSha256:sha(envelope)});
}

export function restoreEncryptedBusinessContinuityBackup({archivePath,archiveKey}={}){
  keyCheck(archiveKey);
  if(typeof archivePath!=='string'||!isAbsolute(archivePath)||!existsSync(archivePath))fail('BUSINESS_BACKUP_FILE_REQUIRED');
  const st=ownerFile(archivePath);if(st.size<1||st.size>MAX_BACKUP*2)fail('BUSINESS_BACKUP_FILE_UNSAFE');
  let envelope;try{envelope=JSON.parse(readFileSync(archivePath,'utf8'));}catch{fail('BUSINESS_BACKUP_PAYLOAD_INVALID');}
  if(envelope?.version!==1||envelope.format!==FORMAT||envelope.algorithm!=='aes-256-gcm'||
     !['nonce','tag','ciphertext'].every(k=>typeof envelope[k]==='string'))fail('BUSINESS_BACKUP_PAYLOAD_INVALID');
  const nonce=Buffer.from(envelope.nonce,'base64'),tag=Buffer.from(envelope.tag,'base64'),ciphertext=Buffer.from(envelope.ciphertext,'base64');
  if(nonce.length!==12||tag.length!==16||ciphertext.length>MAX_BACKUP)fail('BUSINESS_BACKUP_PAYLOAD_INVALID');
  const decipher=createDecipheriv('aes-256-gcm',archiveKey,nonce);decipher.setAAD(AAD);decipher.setAuthTag(tag);
  let plaintext;try{plaintext=Buffer.concat([decipher.update(ciphertext),decipher.final()]);}catch{fail('BUSINESS_BACKUP_AUTHENTICATION_FAILED');}
  const restored=unpackPackage(plaintext);
  return Object.freeze({...restored,encryptedSource:true,ciphertextSha256:sha(readFileSync(archivePath))});
}

export const BUSINESS_CONTINUITY_BACKUP_FORMAT=FORMAT;
