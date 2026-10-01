import {
 existsSync,mkdirSync,lstatSync,readFileSync,writeFileSync,copyFileSync,chmodSync,
 readdirSync,openSync,closeSync,fsyncSync,realpathSync
} from "node:fs";
import {join,dirname,basename,isAbsolute,resolve} from "node:path";
import {spawnSync} from "node:child_process";
import {randomUUID,createHash} from "node:crypto";
import {backupPersonalMemory,restorePersonalMemory} from "../l1/personal-memory-backup.mjs";
import {BusinessRegistry} from "./business-core.mjs";
import {BusinessContinuity} from "./business-continuity.mjs";

const sha=b=>createHash("sha256").update(b).digest("hex");
const fail=code=>{throw Error(code);};
const uid=()=>typeof process.getuid==="function"?process.getuid():null;
const ownedDir=p=>{
 const st=lstatSync(p);
 if(!st.isDirectory()||st.isSymbolicLink()||(st.mode&0o077)!==0||
    (uid()!==null&&st.uid!==uid()))fail("BUSINESS_BACKUP_DIRECTORY_UNSAFE");
 return st;
};
const ownedFile=p=>{
 const st=lstatSync(p);
 if(!st.isFile()||st.isSymbolicLink()||st.nlink!==1||(st.mode&0o077)!==0||
    (uid()!==null&&st.uid!==uid()))fail("BUSINESS_BACKUP_FILE_UNSAFE");
 return st;
};
const syncDir=p=>{const fd=openSync(p,"r");try{fsyncSync(fd);}finally{closeSync(fd);}};
const writeExclusive=(p,body)=>{
 writeFileSync(p,body,{flag:"wx",mode:0o600});
 const fd=openSync(p,"r");try{fsyncSync(fd);}finally{closeSync(fd);}
};
function assertNewPath(p){
 if(typeof p!=="string"||!isAbsolute(p)||resolve(p)==="/")fail("BUSINESS_BACKUP_PATH_UNSAFE");
 ownedDir(dirname(p));
 try{lstatSync(p);fail("BUSINESS_BACKUP_DESTINATION_EXISTS");}
 catch(e){if(e.code!=="ENOENT")throw e;}
}

function validatePublishHelper(path,expectedSha256){
 if(typeof path!=="string"||!isAbsolute(path)||!/^[a-f0-9]{64}$/.test(expectedSha256??""))
  fail("BUSINESS_BACKUP_PUBLISH_HELPER_REQUIRED");
 ownedDir(dirname(path));ownedFile(path);
 if(realpathSync(path)!==path)fail("BUSINESS_BACKUP_PUBLISH_HELPER_UNSAFE");
 if(sha(readFileSync(path))!==expectedSha256)fail("BUSINESS_BACKUP_PUBLISH_HELPER_HASH_MISMATCH");
}
function publishDirectory(stage,destination,helperPath,helperSha256){
 validatePublishHelper(helperPath,helperSha256);
 const st=ownedDir(stage);
 const result=spawnSync(helperPath,[stage,destination,String(st.dev),String(st.ino)],{
  timeout:10000,encoding:"utf8",maxBuffer:2048,
  env:{PATH:"/usr/bin:/bin",LANG:"C"},stdio:["ignore","pipe","pipe"]
 });
 if(result.error||result.signal){
  const e=Error("BUSINESS_BACKUP_PUBLISH_UNCERTAIN");e.effect="UNCERTAIN";e.retryable=false;e.stagePath=stage;throw e;
 }
 if(result.status!==0){
  const reason=(result.stderr??"").trim();
  if(reason==="PUBLISH_DESTINATION_EXISTS"){
   const e=Error("BUSINESS_BACKUP_DESTINATION_EXISTS");e.stagePath=stage;throw e;
  }
  const e=Error("BUSINESS_BACKUP_PUBLISH_UNCERTAIN");e.effect="UNCERTAIN";e.retryable=false;e.stagePath=stage;throw e;
 }
 if(result.stdout.trim()!=="PUBLISH_DONE"){
  const e=Error("BUSINESS_BACKUP_PUBLISH_UNCERTAIN");e.effect="UNCERTAIN";e.retryable=false;e.stagePath=stage;throw e;
 }
 const published=ownedDir(destination);
 if(published.dev!==st.dev||published.ino!==st.ino){
  const e=Error("BUSINESS_BACKUP_PUBLISH_UNCERTAIN");e.effect="UNCERTAIN";e.retryable=false;e.destination=destination;throw e;
 }
 return destination;
}
function copyPrivateFile(source,destination){
 ownedFile(source);copyFileSync(source,destination);chmodSync(destination,0o600);ownedFile(destination);
}
function auditNames(dir){
 ownedDir(dir);
 const names=readdirSync(dir).filter(n=>n==="audit.jsonl"||/^audit\.\d+\.jsonl$/.test(n)).sort();
 if(!names.includes("audit.jsonl"))fail("BUSINESS_BACKUP_AUDIT_MISSING");
 for(const name of names)ownedFile(join(dir,name));
 return names;
}
function cleanNonSecretConfig(value){
 if(!value||typeof value!=="object"||Array.isArray(value))fail("BUSINESS_BACKUP_CONFIG_INVALID");
 const allowed=["schemaVersion","expectedNodeVersion","port","continuityEnabled","auditEnabled",
  "safePilotMode","nativeSha256","tunnelConfigured"];
 if(Object.keys(value).some(k=>!allowed.includes(k))||value.schemaVersion!==1||
    typeof value.expectedNodeVersion!=="string"||!Number.isInteger(value.port)||
    typeof value.continuityEnabled!=="boolean"||typeof value.auditEnabled!=="boolean"||
    typeof value.safePilotMode!=="boolean"||typeof value.tunnelConfigured!=="boolean"||
    !value.nativeSha256||typeof value.nativeSha256!=="object"||Array.isArray(value.nativeSha256)||
    Object.keys(value.nativeSha256).sort().join(",")!=="create,mkdir,publish,replace"||
    Object.values(value.nativeSha256).some(v=>!/^[a-f0-9]{64}$/.test(v)))
  fail("BUSINESS_BACKUP_CONFIG_INVALID");
 const encoded=JSON.stringify(value);
 if(Buffer.byteLength(encoded)>16384)fail("BUSINESS_BACKUP_CONFIG_INVALID");
 return JSON.parse(encoded);
}

function verifyBundle(bundle){
 ownedDir(bundle);
 const manifestPath=join(bundle,"business-backup-manifest.json");ownedFile(manifestPath);
 let manifest;try{manifest=JSON.parse(readFileSync(manifestPath,"utf8"));}catch{fail("BUSINESS_BACKUP_MANIFEST_INVALID");}
 if(manifest?.version!==1||manifest?.schemaVersion!==1||manifest?.product!=="ChatAgent Business"||
    typeof manifest.organizationId!=="string"||manifest.organizationId.length<1||
    manifest.excludesDeploymentCredential!==true||manifest.containsContinuitySealKey!==true||
    manifest.includesNonSecretConfig!==true||!manifest.files||typeof manifest.files!=="object")
  fail("BUSINESS_BACKUP_MANIFEST_INVALID");
 for(const [name,digest] of Object.entries(manifest.files)){
  if(!/^[a-f0-9]{64}$/.test(digest)||name.includes("..")||name.startsWith("/"))
   fail("BUSINESS_BACKUP_MANIFEST_INVALID");
  const path=join(bundle,name);ownedFile(path);
  if(sha(readFileSync(path))!==digest)fail("BUSINESS_BACKUP_FILE_HASH_MISMATCH");
 }
 const registry=new BusinessRegistry(bundle);
 if(registry.organization().organizationId!==manifest.organizationId)
  fail("BUSINESS_BACKUP_ORGANIZATION_MISMATCH");
 const continuityBundle=join(bundle,"continuity");
 ownedDir(continuityBundle);
 for(const name of ["memory-seal.key","memory-head.json","memory.sqlite","backup-manifest.json"])
  ownedFile(join(continuityBundle,name));
 const auditDir=join(bundle,"audit");auditNames(auditDir);
 return {manifest,registry};
}
export async function backupBusinessState({sourceStateDir,destinationDir,publishHelperPath,
 publishHelperSha256,nonSecretConfig=null}){
 if(typeof sourceStateDir!=="string"||!isAbsolute(sourceStateDir))fail("BUSINESS_BACKUP_PATH_UNSAFE");
 ownedDir(sourceStateDir);assertNewPath(destinationDir);
 const registry=new BusinessRegistry(sourceStateDir);
 const organizationId=registry.organization().organizationId;
 const parent=dirname(destinationDir);
 const stage=join(parent,".business-backup-stage-"+randomUUID());
 mkdirSync(stage,{mode:0o700});const stageStat=ownedDir(stage);
 try{
  copyPrivateFile(join(sourceStateDir,"registry.json"),join(stage,"registry.json"));
  const continuitySource=join(sourceStateDir,"continuity");
  await backupPersonalMemory({sourceDir:continuitySource,destinationDir:join(stage,"continuity"),
   ownerStatus:()=>({paired:true})});
  const sourceAudit=join(sourceStateDir,"audit"),destAudit=join(stage,"audit");
  mkdirSync(destAudit,{mode:0o700});
  const names=auditNames(sourceAudit);
  for(const name of names)copyPrivateFile(join(sourceAudit,name),join(destAudit,name));

  const sanitizedConfig=cleanNonSecretConfig(nonSecretConfig);
  writeExclusive(join(stage,"non-secret-config.json"),JSON.stringify(sanitizedConfig,null,2)+"\n");
  const files={
   "registry.json":sha(readFileSync(join(stage,"registry.json"))),
   "non-secret-config.json":sha(readFileSync(join(stage,"non-secret-config.json"))),
   "continuity/memory-seal.key":sha(readFileSync(join(stage,"continuity","memory-seal.key"))),
   "continuity/memory-head.json":sha(readFileSync(join(stage,"continuity","memory-head.json"))),
   "continuity/memory.sqlite":sha(readFileSync(join(stage,"continuity","memory.sqlite"))),
   "continuity/backup-manifest.json":sha(readFileSync(join(stage,"continuity","backup-manifest.json")))
  };
  for(const name of names)files["audit/"+name]=sha(readFileSync(join(destAudit,name)));
  const manifest={
   version:1,schemaVersion:1,product:"ChatAgent Business",createdAt:Date.now(),
   organizationId,registryRevision:registry.read().revision,
   excludesDeploymentCredential:true,containsContinuitySealKey:true,
   includesNonSecretConfig:true,files
  };
  writeExclusive(join(stage,"business-backup-manifest.json"),JSON.stringify(manifest,null,2)+"\n");
  syncDir(destAudit);syncDir(stage);
  publishDirectory(stage,destinationDir,publishHelperPath,publishHelperSha256);
  verifyBundle(destinationDir);
  syncDir(parent);
  return {destination:destinationDir,organizationId,verified:true,
   excludesDeploymentCredential:true,containsContinuitySealKey:true};
 }catch(e){
  if(!e.stagePath&&existsSync(stage)){e.stagePath=stage;e.stageIdentity={dev:stageStat.dev,ino:stageStat.ino};}
  throw e;
 }
}

export function restoreBusinessState({backupDir,destinationStateDir,publishHelperPath,publishHelperSha256}){
 if(typeof backupDir!=="string"||!isAbsolute(backupDir))fail("BUSINESS_BACKUP_PATH_UNSAFE");
 const {manifest}=verifyBundle(backupDir);
 assertNewPath(destinationStateDir);
 const parent=dirname(destinationStateDir);
 const stage=join(parent,".business-restore-stage-"+randomUUID());
 mkdirSync(stage,{mode:0o700});const stageStat=ownedDir(stage);
 try{
  copyPrivateFile(join(backupDir,"registry.json"),join(stage,"registry.json"));
  const sourceAudit=join(backupDir,"audit"),destAudit=join(stage,"audit");
  mkdirSync(destAudit,{mode:0o700});
  const auditFiles=auditNames(sourceAudit);
  for(const name of auditFiles)copyPrivateFile(join(sourceAudit,name),join(destAudit,name));
  restorePersonalMemory({backupDir:join(backupDir,"continuity"),destinationDir:join(stage,"continuity"),
   ownerStatus:()=>({paired:true}),publishHelperPath,publishHelperSha256});
  const registry=new BusinessRegistry(stage);
  if(registry.organization().organizationId!==manifest.organizationId)
   fail("BUSINESS_BACKUP_ORGANIZATION_MISMATCH");
  const continuity=new BusinessContinuity(registry,{root:join(stage,"continuity")});
  continuity.close();
  for(const name of auditFiles)ownedFile(join(destAudit,name));
  syncDir(destAudit);syncDir(stage);
  publishDirectory(stage,destinationStateDir,publishHelperPath,publishHelperSha256);
  new BusinessRegistry(destinationStateDir);
  syncDir(parent);
  return {destination:destinationStateDir,organizationId:manifest.organizationId,verified:true,
   credentialRestored:false};
 }catch(e){
  if(!e.stagePath&&existsSync(stage)){e.stagePath=stage;e.stageIdentity={dev:stageStat.dev,ino:stageStat.ino};}
  throw e;
 }
}
