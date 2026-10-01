import {closeSync,existsSync,fsyncSync,lstatSync,mkdirSync,openSync,readFileSync,realpathSync,renameSync,writeSync} from "node:fs";
import {dirname,isAbsolute,join,resolve,sep} from "node:path";
import {homedir} from "node:os";
import {randomUUID} from "node:crypto";

export const BUSINESS_VERSION="0.1.0-dev.0";
export const PROFILES=Object.freeze(["READ_ONLY","SAFE","STANDARD"]);
const PROFILE_RANK=Object.freeze({READ_ONLY:0,SAFE:1,STANDARD:2});
const SLUG=/^[a-z0-9][a-z0-9._-]{0,63}$/;
const SAFE_TEXT=/^[^\x00-\x1f\x7f]+$/;
const fail=code=>{throw Error(code);};
const currentUid=()=>typeof process.getuid==="function"?process.getuid():null;
const within=(child,parent)=>child===parent||child.startsWith(parent+sep);

const TOOL_MIN_PROFILE=Object.freeze({
 business_status:"READ_ONLY",list_directory:"READ_ONLY",stat_path:"READ_ONLY",
 read_file:"READ_ONLY",hash_file:"READ_ONLY",make_directory:"SAFE",create_file:"SAFE",
 replace_file:"SAFE",apply_patch:"SAFE",continuity_open:"READ_ONLY",
 continuity_start_task:"SAFE",continuity_checkpoint:"SAFE",
 continuity_prepare_handoff:"READ_ONLY",continuity_complete_task:"SAFE",
 exec_command:"STANDARD",read_process:"STANDARD",terminate_process:"STANDARD"
});

function privateRoot(root,{create=false}={}){
 if(typeof root!=="string"||!isAbsolute(root)||resolve(root)==="/")fail("BUSINESS_STATE_ROOT_UNSAFE");
 if(!existsSync(root)){
  if(!create)fail("BUSINESS_STATE_NOT_INITIALIZED");
  mkdirSync(root,{mode:0o700,recursive:false});
 }
 const st=lstatSync(root);
 if(!st.isDirectory()||st.isSymbolicLink()||(st.mode&0o077)!==0||
    (currentUid()!==null&&st.uid!==currentUid()))fail("BUSINESS_STATE_ROOT_UNSAFE");
 return realpathSync(root);
}

function privateFile(path){
 const st=lstatSync(path);
 if(!st.isFile()||st.isSymbolicLink()||st.nlink!==1||(st.mode&0o077)!==0||
    (currentUid()!==null&&st.uid!==currentUid()))fail("BUSINESS_STATE_FILE_UNSAFE");
}

function atomicJson(path,value){
 const temp=path+".tmp-"+randomUUID(),body=Buffer.from(JSON.stringify(value,null,2)+"\n");
 const fd=openSync(temp,"wx",0o600);
 try{let o=0;while(o<body.length){const n=writeSync(fd,body,o,body.length-o);if(n<=0)fail("BUSINESS_STATE_WRITE_UNCERTAIN");o+=n;}fsyncSync(fd);}
 finally{closeSync(fd);}
 renameSync(temp,path);
 const dfd=openSync(dirname(path),"r");try{fsyncSync(dfd);}finally{closeSync(dfd);}
}

function cleanText(value,max,code){
 if(typeof value!=="string"||value.length<1||value.length>max||!SAFE_TEXT.test(value)||value.trim()!==value)fail(code);
 return value;
}
function cleanSlug(value,code){if(typeof value!=="string"||!SLUG.test(value))fail(code);return value;}
function cleanProfile(value){if(!PROFILES.includes(value))fail("BUSINESS_PROFILE_INVALID");return value;}

function structuralValidate(doc){
 if(!doc||typeof doc!=="object"||Array.isArray(doc)||doc.schemaVersion!==1||
    !Number.isSafeInteger(doc.revision)||doc.revision<0||
    !doc.organization||typeof doc.organization!=="object"||Array.isArray(doc.organization)||
    !Array.isArray(doc.projects))fail("BUSINESS_REGISTRY_INVALID");
 cleanSlug(doc.organization.organizationId,"BUSINESS_ORGANIZATION_INVALID");
 cleanText(doc.organization.displayName,128,"BUSINESS_ORGANIZATION_INVALID");
 const ids=new Set();
 for(const p of doc.projects){
  if(!p||typeof p!=="object"||Array.isArray(p))fail("BUSINESS_REGISTRY_INVALID");
  cleanSlug(p.projectId,"BUSINESS_PROJECT_ID_INVALID");
  if(ids.has(p.projectId))fail("BUSINESS_REGISTRY_INVALID");ids.add(p.projectId);
  cleanText(p.displayName,128,"BUSINESS_PROJECT_INVALID");
  if(typeof p.hostRoot!=="string"||!isAbsolute(p.hostRoot)||resolve(p.hostRoot)!==p.hostRoot)fail("BUSINESS_REGISTRY_INVALID");
  cleanProfile(p.profile);
  if(typeof p.enabled!=="boolean")fail("BUSINESS_REGISTRY_INVALID");
 }
 return doc;
}

export function validateProjectRoot(hostRoot,{protectedRoots=[]}={}){
 if(typeof hostRoot!=="string"||!isAbsolute(hostRoot))fail("BUSINESS_PROJECT_ROOT_INVALID");
 let st;try{st=lstatSync(hostRoot);}catch{fail("BUSINESS_PROJECT_ROOT_UNAVAILABLE");}
 if(!st.isDirectory()||st.isSymbolicLink())fail("BUSINESS_PROJECT_ROOT_UNSAFE");
 let canonical;try{canonical=realpathSync(hostRoot);}catch{fail("BUSINESS_PROJECT_ROOT_UNAVAILABLE");}
 canonical=resolve(canonical);
 if(canonical==="/"||canonical===resolve(homedir()))fail("BUSINESS_PROJECT_ROOT_TOO_BROAD");
 for(const root of protectedRoots){
  const protectedRoot=resolve(root);
  if(within(canonical,protectedRoot)||within(protectedRoot,canonical))fail("BUSINESS_PROJECT_ROOT_PROTECTED");
 }
 return canonical;
}

export class BusinessRegistry{
 constructor(root,{initialize=false,organizationId=null,displayName=null}={}){
  this.root=privateRoot(root,{create:initialize});this.file=join(this.root,"registry.json");
  if(initialize){
   if(existsSync(this.file))fail("BUSINESS_STATE_ALREADY_INITIALIZED");
   const organization={organizationId:cleanSlug(organizationId,"BUSINESS_ORGANIZATION_INVALID"),
    displayName:cleanText(displayName,128,"BUSINESS_ORGANIZATION_INVALID")};
   atomicJson(this.file,{schemaVersion:1,revision:0,organization,projects:[]});
  }
  if(!existsSync(this.file))fail("BUSINESS_STATE_NOT_INITIALIZED");
  privateFile(this.file);this.read();
 }
 read(){
  privateFile(this.file);let doc;try{doc=JSON.parse(readFileSync(this.file,"utf8"));}catch{fail("BUSINESS_REGISTRY_INVALID");}
  return structuralValidate(doc);
 }

 write(doc){structuralValidate(doc);atomicJson(this.file,doc);return doc;}
 organization(){return {...this.read().organization};}
 list(){return this.read().projects.map(p=>({...p}));}
 addProject({projectId,displayName,hostRoot,profile,enabled=true}){
  projectId=cleanSlug(projectId,"BUSINESS_PROJECT_ID_INVALID");
  displayName=cleanText(displayName,128,"BUSINESS_PROJECT_INVALID");
  profile=cleanProfile(profile);
  if(typeof enabled!=="boolean")fail("BUSINESS_PROJECT_INVALID");
  const doc=this.read();
  if(doc.projects.some(p=>p.projectId===projectId))fail("BUSINESS_PROJECT_EXISTS");
  const canonical=validateProjectRoot(hostRoot,{protectedRoots:[this.root]});
  doc.projects.push({projectId,displayName,hostRoot:canonical,profile,enabled});
  doc.projects.sort((a,b)=>a.projectId.localeCompare(b.projectId));
  doc.revision++;this.write(doc);
  return this.inspect(projectId);
 }
 setEnabled(projectId,enabled){
  cleanSlug(projectId,"BUSINESS_PROJECT_ID_INVALID");
  if(typeof enabled!=="boolean")fail("BUSINESS_PROJECT_INVALID");
  const doc=this.read(),project=doc.projects.find(p=>p.projectId===projectId);
  if(!project)fail("BUSINESS_PROJECT_UNKNOWN");
  if(project.enabled!==enabled){project.enabled=enabled;doc.revision++;this.write(doc);}
  return this.inspect(projectId);
 }
 inspect(projectId){
  cleanSlug(projectId,"BUSINESS_PROJECT_ID_INVALID");
  const project=this.read().projects.find(p=>p.projectId===projectId);
  if(!project)fail("BUSINESS_PROJECT_UNKNOWN");
  try{
   const root=validateProjectRoot(project.hostRoot,{protectedRoots:[this.root]});
   if(root!==project.hostRoot)fail("BUSINESS_PROJECT_ROOT_CHANGED");
   return {...project,rootAvailable:true,rootStatus:"AVAILABLE"};
  }catch(e){
   return {...project,rootAvailable:false,rootStatus:String(e?.message||"BUSINESS_PROJECT_ROOT_UNAVAILABLE")};
  }
 }
 resolve(projectId){
  const project=this.inspect(projectId);
  if(!project.enabled)fail("BUSINESS_PROJECT_DISABLED");
  if(!project.rootAvailable)fail(project.rootStatus);
  return {...project};
 }
}

export function requiredProfileForTool(tool){
 const required=TOOL_MIN_PROFILE[tool];
 if(!required)fail("BUSINESS_TOOL_UNKNOWN");
 return required;
}

export function authorizeProjectTool(registry,{projectId,tool}){
 const project=registry.resolve(projectId),required=requiredProfileForTool(tool);
 if(PROFILE_RANK[project.profile]<PROFILE_RANK[required])fail("BUSINESS_PROFILE_DENIED");
 return {organizationId:registry.organization().organizationId,projectId:project.projectId,
  profile:project.profile,hostRoot:project.hostRoot,tool,requiredProfile:required};
}

export function businessStatus(registry,{safeFilesReady=false,continuityReady=false,auditReady=false,execReady=false}={}){
 const organization=registry.organization(),projects=registry.list().map(p=>{
  const inspected=registry.inspect(p.projectId);
  return {projectId:p.projectId,displayName:p.displayName,profile:p.profile,enabled:p.enabled,
   available:inspected.rootAvailable};
 });
 return {
  product:"ChatAgent Business",edition:"SMB",version:BUSINESS_VERSION,
  phase:execReady?"B5":auditReady?"B4":continuityReady?"B3":safeFilesReady?"B2":"B1",
  organization,
  projects,
  projectCounts:{registered:projects.length,enabled:projects.filter(p=>p.enabled).length,
   available:projects.filter(p=>p.available).length},
  safeFiles:safeFilesReady?"READY_B2":"NOT_CONFIGURED_B1",
  continuity:continuityReady?"READY_B3":safeFilesReady?"NOT_IMPLEMENTED_B2":"NOT_IMPLEMENTED_B1",
  audit:auditReady?"READY_B4":"NOT_CONFIGURED",
  ops:execReady?"LOCAL_OPERATOR_B5":auditReady?"LOCAL_OPERATOR_B4":"NOT_CONFIGURED",
  exec:execReady?"READY_B5":auditReady?"NOT_IMPLEMENTED_B4":continuityReady?"NOT_IMPLEMENTED_B3":safeFilesReady?"NOT_IMPLEMENTED_B2":"NOT_IMPLEMENTED_B1",
  runtimeHealth:execReady?"READY_B5":auditReady?"READY_B4":continuityReady?"READY_B3":safeFilesReady?"READY_B2":"READY_B1"
 };
}
