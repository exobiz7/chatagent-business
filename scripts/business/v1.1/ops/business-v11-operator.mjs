import {existsSync,lstatSync,mkdirSync,realpathSync} from 'node:fs';
import {isAbsolute,join,resolve} from 'node:path';
import {createEncryptedBusinessContinuityBackup,restoreEncryptedBusinessContinuityBackup} from '../backup/business-continuity-logical-backup.mjs';
import {normalizeBusinessContinuityLogicalSnapshot,businessContinuityLogicalDigest} from '../backup/business-continuity-logical-contract.mjs';

const NAME=/^[A-Za-z0-9][A-Za-z0-9._-]{0,95}$/;
const INCIDENT=/^[A-Za-z0-9][A-Za-z0-9._:/-]{2,127}$/;
const DIGEST=/^sha256:[a-f0-9]{64}$/;
const ORG=/^[a-z0-9][a-z0-9._-]{0,63}$/;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const fail=code=>{throw Error(code);};
const owner=()=>typeof process.getuid==='function'?process.getuid():null;

function privateDir(path,{create=false}={}){
  if(typeof path!=='string'||!isAbsolute(path)||resolve(path)==='/')fail('BUSINESS_V11_OPS_BACKUP_DIR_UNSAFE');
  if(!existsSync(path)){
    if(!create)fail('BUSINESS_V11_OPS_BACKUP_DIR_MISSING');
    mkdirSync(path,{mode:0o700});
  }
  const st=lstatSync(path);
  if(!st.isDirectory()||st.isSymbolicLink()||(st.mode&0o077)!==0||(owner()!==null&&st.uid!==owner()))
    fail('BUSINESS_V11_OPS_BACKUP_DIR_UNSAFE');
  return realpathSync(path);
}
function backupName(value){
  if(value===undefined||value===null||value==='')return 'business-v11-continuity-'+new Date().toISOString().replace(/[-:]/g,'').replace(/\.\d{3}Z$/,'Z')+'.bcbak';
  if(typeof value!=='string'||!NAME.test(value))fail('BUSINESS_V11_BACKUP_NAME_INVALID');
  return value.endsWith('.bcbak')?value:value+'.bcbak';
}
const safeProbe=async(fn,unavailable)=>{try{return await fn();}catch(error){return {ready:false,status:unavailable,code:String(error?.message??unavailable)};}};
const emptyTarget=value=>value&&['projects','privateMemberships','tasks','checkpoints','operations','events','contextSeq'].every(k=>Number(value[k])===0);

export class BusinessV11Operator{
  constructor({organizationId,backupsDir,keyStore,maintenance,runtimeProbe,continuityProbe,nodeVersionProbe=()=>process.version}={}){
    if(typeof organizationId!=='string'||!ORG.test(organizationId)||typeof backupsDir!=='string'||!isAbsolute(backupsDir)||
       !keyStore||typeof keyStore.read!=='function'||typeof keyStore.loadOrCreate!=='function'||
       !maintenance||typeof maintenance.probe!=='function'||typeof maintenance.inspectTarget!=='function'||
       typeof maintenance.exportSnapshot!=='function'||typeof maintenance.restoreEmpty!=='function'||
       typeof runtimeProbe!=='function'||typeof continuityProbe!=='function'||typeof nodeVersionProbe!=='function')
      fail('BUSINESS_V11_OPERATOR_CONFIG_INVALID');
    this.organizationId=organizationId;this.backupsDir=backupsDir;this.keyStore=keyStore;this.maintenance=maintenance;
    this.runtimeProbe=runtimeProbe;this.continuityProbe=continuityProbe;this.nodeVersionProbe=nodeVersionProbe;
  }
  async status(){
    const runtime=await safeProbe(this.runtimeProbe,'LOCAL_RUNTIME_UNAVAILABLE');
    const continuity=await safeProbe(this.continuityProbe,'CONTINUITY_BACKEND_UNAVAILABLE');
    const localReady=runtime?.ready===true;
    const continuityReady=continuity?.ready===true&&continuity.organizationId===this.organizationId;
    const mode=continuityReady?(localReady?'NORMAL':'LOCAL_RUNTIME_UNAVAILABLE'):(localReady?'DEGRADED_CONTINUITY':'DEGRADED_UNAVAILABLE');
    let keyInitialized=false;try{const key=this.keyStore.read();keyInitialized=Buffer.isBuffer(key)&&key.length===32;if(key)key.fill(0);}catch{}
    return Object.freeze({product:'ChatAgent Business',version:'1.1',organizationId:this.organizationId,mode,
      localWork:localReady?'AVAILABLE':'UNAVAILABLE',continuity:continuityReady?'READY':'DEGRADED_UNAVAILABLE',
      continuityMutation:continuityReady?'AVAILABLE':'FAIL_CLOSED',backupKey:keyInitialized?'READY':'NOT_INITIALIZED',
      runtimeStatus:runtime?.status??(localReady?'READY':'UNAVAILABLE'),continuityStatus:continuity?.status??(continuityReady?'READY':'UNAVAILABLE')});
  }
  async doctor(){
    const status=await this.status(),checks=[];
    const add=(name,ok,statusValue,required=true)=>checks.push({name,ok,required,status:statusValue});
    let version='UNKNOWN';try{version=await this.nodeVersionProbe();add('node',typeof version==='string'&&version.startsWith('v24.'),version);}catch(e){add('node',false,String(e?.message??'NODE_FAILED'));}
    add('runtime',status.localWork==='AVAILABLE',status.runtimeStatus);
    add('continuity',status.continuity==='READY',status.continuityStatus);
    try{privateDir(this.backupsDir,{create:false});add('backup_directory',true,'PRIVATE');}catch(e){add('backup_directory',false,String(e.message));}
    let key=null;try{key=this.keyStore.read();add('backup_key',key===null||Buffer.isBuffer(key),key?'READY':'WILL_CREATE_ON_BACKUP');}catch(e){add('backup_key',false,String(e.message));}finally{if(Buffer.isBuffer(key))key.fill(0);}
    try{const m=await this.maintenance.probe({organizationId:this.organizationId});add('maintenance',m.backupReady===true&&m.restoreReady===true,'BACKUP_RESTORE_SQL_READY');}
    catch(e){add('maintenance',false,String(e?.message??'BUSINESS_MAINTENANCE_DATABASE_UNAVAILABLE'));}
    return Object.freeze({product:'ChatAgent Business',version:'1.1',organizationId:this.organizationId,
      ok:checks.filter(x=>x.required).every(x=>x.ok),mode:status.mode,checks});
  }
  async backup({name=null}={}){
    const dir=privateDir(this.backupsDir,{create:true}),archiveName=backupName(name),archivePath=join(dir,archiveName);
    const probe=await this.maintenance.probe({organizationId:this.organizationId});
    if(probe.backupReady!==true)fail('BUSINESS_BACKUP_NOT_READY');
    const snapshot=normalizeBusinessContinuityLogicalSnapshot(await this.maintenance.exportSnapshot({organizationId:this.organizationId}));
    if(snapshot.organizationSlug!==this.organizationId)fail('BUSINESS_BACKUP_ORGANIZATION_MISMATCH');
    const key=this.keyStore.loadOrCreate();
    try{
      const created=createEncryptedBusinessContinuityBackup({snapshot,archivePath,archiveKey:key,backupRef:archiveName});
      return Object.freeze({archiveName,encrypted:true,organizationId:this.organizationId,logicalDigest:created.logicalDigest,
        ciphertextSha256:created.ciphertextSha256,counts:snapshot.counts,keyStoredInKeychain:true});
    }finally{key.fill(0);}
  }
  async restore({archiveName,incidentRef,expectedLogicalDigest,confirmOrganizationId,actorUserId}={}){
    if(typeof archiveName!=='string'||!NAME.test(archiveName)||!archiveName.endsWith('.bcbak')||
       typeof incidentRef!=='string'||!INCIDENT.test(incidentRef)||!DIGEST.test(expectedLogicalDigest??'')||
       confirmOrganizationId!==this.organizationId||!UUID.test(actorUserId??''))fail('BUSINESS_RESTORE_CONFIRMATION_REQUIRED');
    const dir=privateDir(this.backupsDir),archivePath=join(dir,archiveName);
    const key=this.keyStore.read();if(!Buffer.isBuffer(key)||key.length!==32)fail('BUSINESS_BACKUP_KEY_REQUIRED');
    let restored;
    try{restored=restoreEncryptedBusinessContinuityBackup({archivePath,archiveKey:key});}finally{key.fill(0);}
    if(restored.digest!==expectedLogicalDigest||restored.snapshot.organizationSlug!==this.organizationId)
      fail('BUSINESS_RESTORE_PRECONDITION_MISMATCH');
    const probe=await this.maintenance.probe({organizationId:this.organizationId});
    if(probe.restoreReady!==true)fail('BUSINESS_RESTORE_NOT_READY');
    const before=await this.maintenance.inspectTarget({organizationId:this.organizationId});
    if(!emptyTarget(before))fail('BUSINESS_RESTORE_TARGET_NOT_EMPTY');
    const receipt=await this.maintenance.restoreEmpty({snapshot:restored.snapshot,actorUserId});
    let after;
    try{after=normalizeBusinessContinuityLogicalSnapshot(await this.maintenance.exportSnapshot({organizationId:this.organizationId}));}
    catch(error){const e=Error('BUSINESS_RESTORE_RECONCILIATION_UNCERTAIN');e.effect='COMMITTED';e.retryable=false;throw e;}
    const digest=businessContinuityLogicalDigest(after);
    if(digest!==expectedLogicalDigest){const e=Error('BUSINESS_RESTORE_RECONCILIATION_FAILED');e.effect='COMMITTED';e.retryable=false;throw e;}
    return Object.freeze({restored:true,incidentRef,archiveName,organizationId:this.organizationId,logicalDigest:digest,
      contextSeq:after.contextSeq,counts:after.counts,integrityVerified:receipt?.integrityVerified===true,reconciled:true});
  }
}
