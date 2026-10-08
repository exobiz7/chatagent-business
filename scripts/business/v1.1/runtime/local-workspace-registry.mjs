import {
  closeSync,existsSync,fsyncSync,lstatSync,mkdirSync,openSync,readFileSync,
  realpathSync,renameSync,statSync,writeSync
} from 'node:fs';
import {homedir} from 'node:os';
import {dirname,isAbsolute,join,resolve,sep} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {spawnSync} from 'node:child_process';

const SLUG=/^[a-z0-9][a-z0-9._-]{0,63}$/;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const fail=code=>{throw Error(code);};
const uid=()=>typeof process.getuid==='function'?process.getuid():null;
const within=(child,parent)=>child===parent||child.startsWith(parent+sep);
const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');

function privateDir(path,{create=false}={}){
  if(typeof path!=='string'||!isAbsolute(path)||resolve(path)==='/')fail('BUSINESS_LOCAL_STATE_UNSAFE');
  if(!existsSync(path)){
    if(!create)fail('BUSINESS_LOCAL_STATE_NOT_INITIALIZED');
    mkdirSync(path,{mode:0o700,recursive:false});
  }
  const st=lstatSync(path);
  if(!st.isDirectory()||st.isSymbolicLink()||(st.mode&0o077)!==0||(uid()!==null&&st.uid!==uid()))
    fail('BUSINESS_LOCAL_STATE_UNSAFE');
  return realpathSync(path);
}

function privateFile(path){
  const st=lstatSync(path);
  if(!st.isFile()||st.isSymbolicLink()||st.nlink!==1||(st.mode&0o077)!==0||(uid()!==null&&st.uid!==uid()))
    fail('BUSINESS_LOCAL_STATE_FILE_UNSAFE');
}

function atomicJson(path,value){
  const temp=`${path}.tmp-${randomUUID()}`;
  const body=Buffer.from(`${JSON.stringify(value,null,2)}\n`);
  const fd=openSync(temp,'wx',0o600);
  try{
    let at=0;
    while(at<body.length){
      const n=writeSync(fd,body,at,body.length-at);
      if(n<=0)fail('BUSINESS_LOCAL_STATE_WRITE_UNCERTAIN');
      at+=n;
    }
    fsyncSync(fd);
  } finally { closeSync(fd); }
  renameSync(temp,path);
  const dfd=openSync(dirname(path),'r');
  try{fsyncSync(dfd);}finally{closeSync(dfd);}
}

function cleanSlug(value,code){if(typeof value!=='string'||!SLUG.test(value))fail(code);return value;}
function cleanUuid(value,code){if(typeof value!=='string'||!UUID.test(value))fail(code);return value.toLowerCase();}

function cleanRelative(value){
  if(typeof value!=='string'||value.length>4096||value.includes('\0')||isAbsolute(value))
    fail('BUSINESS_WORKSPACE_RELATIVE_PATH_INVALID');
  if(value===''||value==='.')return '';
  const parts=value.split('/');
  if(parts.some(x=>x===''||x==='.'||x==='..'))fail('BUSINESS_WORKSPACE_RELATIVE_PATH_INVALID');
  return parts.join('/');
}

function validateWorkspaceRoot(path,{stateDir}={}){
  if(typeof path!=='string'||!isAbsolute(path))fail('BUSINESS_WORKSPACE_ROOT_INVALID');
  let st;try{st=lstatSync(path);}catch{fail('BUSINESS_WORKSPACE_ROOT_UNAVAILABLE');}
  if(!st.isDirectory()||st.isSymbolicLink())fail('BUSINESS_WORKSPACE_ROOT_UNSAFE');
  const canonical=resolve(realpathSync(path));
  if(canonical==='/'||canonical===resolve(homedir()))fail('BUSINESS_WORKSPACE_ROOT_TOO_BROAD');
  if(stateDir&&(within(canonical,stateDir)||within(stateDir,canonical)))fail('BUSINESS_WORKSPACE_ROOT_STATE_OVERLAP');
  return canonical;
}

function resolveNoSymlink(root,relativePath){
  const relative=cleanRelative(relativePath);
  let current=root;
  for(const part of relative?relative.split('/'):[]){
    current=join(current,part);
    let st;try{st=lstatSync(current);}catch{fail('BUSINESS_PROJECT_MAPPING_PATH_UNAVAILABLE');}
    if(st.isSymbolicLink())fail('BUSINESS_PROJECT_MAPPING_SYMLINK_DENIED');
  }
  let final;try{final=statSync(current);}catch{fail('BUSINESS_PROJECT_MAPPING_PATH_UNAVAILABLE');}
  if(!final.isDirectory())fail('BUSINESS_PROJECT_MAPPING_NOT_DIRECTORY');
  const canonical=resolve(realpathSync(current));
  if(!within(canonical,root))fail('BUSINESS_PROJECT_MAPPING_ESCAPE');
  return {relative,canonical};
}

function publicMapping(mapping){
  return Object.freeze({
    projectId:mapping.projectId,
    runtimeNodeId:mapping.runtimeNodeId,
    workspaceRootId:mapping.workspaceRootId,
    workspaceRelativePath:mapping.workspaceRelativePath,
    mappingRevision:mapping.mappingRevision
  });
}

function validateDoc(doc,nodeId,rootIds){
  if(!doc||typeof doc!=='object'||Array.isArray(doc)||doc.schemaVersion!==1||doc.nodeId!==nodeId||
     !Number.isSafeInteger(doc.revision)||doc.revision<0||
     !Number.isSafeInteger(doc.nextMappingRevision)||doc.nextMappingRevision<1||
     !Array.isArray(doc.mappings)||!Array.isArray(doc.operations))fail('BUSINESS_LOCAL_MAPPING_STATE_INVALID');
  const projects=new Set();
  for(const m of doc.mappings){
    if(!m||typeof m!=='object'||Array.isArray(m)||!SLUG.test(m.projectId??'')||m.runtimeNodeId!==nodeId||
       !rootIds.has(m.workspaceRootId)||typeof m.workspaceRelativePath!=='string'||
       typeof m.canonicalPath!=='string'||!isAbsolute(m.canonicalPath)||
       !Number.isSafeInteger(m.mappingRevision)||m.mappingRevision<1||projects.has(m.projectId))
      fail('BUSINESS_LOCAL_MAPPING_STATE_INVALID');
    projects.add(m.projectId);
  }
  const ops=new Set();
  for(const op of doc.operations){
    if(!op||typeof op!=='object'||Array.isArray(op)||!UUID.test(op.operationId??'')||
       !['MAP_PROJECT','UNMAP_PROJECT'].includes(op.kind)||!/^[a-f0-9]{64}$/.test(op.inputSha256??'')||
       !op.receipt||typeof op.receipt!=='object'||Array.isArray(op.receipt)||ops.has(op.operationId))
      fail('BUSINESS_LOCAL_MAPPING_STATE_INVALID');
    ops.add(op.operationId);
  }
  return doc;
}

export class LocalWorkspaceRegistry{
  constructor({stateDir,nodeId,workspaceRoots,initialize=false,gitExecutable='/usr/bin/git'}={}){
    this.nodeId=cleanUuid(nodeId,'BUSINESS_RUNTIME_NODE_ID_INVALID');
    this.stateDir=privateDir(stateDir,{create:initialize});
    if(!Array.isArray(workspaceRoots)||workspaceRoots.length<1||workspaceRoots.length>32)
      fail('BUSINESS_WORKSPACE_ROOT_CONFIG_INVALID');
    this.workspaceRoots=new Map();
    for(const item of workspaceRoots){
      if(!item||typeof item!=='object'||Array.isArray(item))fail('BUSINESS_WORKSPACE_ROOT_CONFIG_INVALID');
      const id=cleanSlug(item.workspaceRootId,'BUSINESS_WORKSPACE_ROOT_ID_INVALID');
      if(this.workspaceRoots.has(id))fail('BUSINESS_WORKSPACE_ROOT_CONFIG_INVALID');
      const path=validateWorkspaceRoot(item.path,{stateDir:this.stateDir});
      this.workspaceRoots.set(id,{workspaceRootId:id,path,label:typeof item.label==='string'?item.label.slice(0,128):id});
    }
    if(typeof gitExecutable!=='string'||!isAbsolute(gitExecutable))fail('BUSINESS_GIT_EXECUTABLE_INVALID');
    this.gitExecutable=gitExecutable;
    this.file=join(this.stateDir,'workspace-mappings.json');
    if(initialize){
      if(existsSync(this.file))fail('BUSINESS_LOCAL_STATE_ALREADY_INITIALIZED');
      atomicJson(this.file,{schemaVersion:1,nodeId:this.nodeId,revision:0,nextMappingRevision:1,mappings:[],operations:[]});
    }
    if(!existsSync(this.file))fail('BUSINESS_LOCAL_STATE_NOT_INITIALIZED');
    privateFile(this.file);this.read();
  }

  read(){
    privateFile(this.file);
    let doc;try{doc=JSON.parse(readFileSync(this.file,'utf8'));}catch{fail('BUSINESS_LOCAL_MAPPING_STATE_INVALID');}
    return validateDoc(doc,this.nodeId,new Set(this.workspaceRoots.keys()));
  }

  write(doc){
    validateDoc(doc,this.nodeId,new Set(this.workspaceRoots.keys()));
    atomicJson(this.file,doc);return doc;
  }

  #replay(doc,operationId,inputSha256){
    const prior=doc.operations.find(x=>x.operationId===operationId);
    if(!prior)return null;
    if(prior.inputSha256!==inputSha256)fail('BUSINESS_IDEMPOTENCY_CONFLICT');
    return Object.freeze({...prior.receipt});
  }

  #record(doc,{operationId,kind,inputSha256,receipt}){
    doc.operations.push({operationId,kind,inputSha256,receipt});
  }

  #verifyGitRemote(canonical,expectedGitRemoteUrl){
    if(expectedGitRemoteUrl===undefined)return;
    if(typeof expectedGitRemoteUrl!=='string'||expectedGitRemoteUrl.length<1||expectedGitRemoteUrl.length>2048)
      fail('BUSINESS_GIT_REMOTE_EXPECTATION_INVALID');
    const out=spawnSync(this.gitExecutable,['-C',canonical,'remote','get-url','origin'],{
      encoding:'utf8',timeout:3000,maxBuffer:65536,env:{PATH:process.env.PATH??'/usr/bin:/bin:/usr/sbin:/sbin'}
    });
    if(out.status!==0||out.stdout.trim()!==expectedGitRemoteUrl.trim())fail('BUSINESS_GIT_REMOTE_MISMATCH');
  }

  mapProject({projectId,runtimeNodeId,workspaceRootId,workspaceRelativePath='',expectedGitRemoteUrl,operationId}={}){
    projectId=cleanSlug(projectId,'BUSINESS_PROJECT_ID_INVALID');
    runtimeNodeId=cleanUuid(runtimeNodeId,'BUSINESS_RUNTIME_NODE_ID_INVALID');
    operationId=cleanUuid(operationId,'BUSINESS_OPERATION_ID_INVALID');
    workspaceRootId=cleanSlug(workspaceRootId,'BUSINESS_WORKSPACE_ROOT_ID_INVALID');
    if(runtimeNodeId!==this.nodeId)fail('BUSINESS_RUNTIME_NODE_MISMATCH');
    const root=this.workspaceRoots.get(workspaceRootId);if(!root)fail('BUSINESS_WORKSPACE_ROOT_UNKNOWN');
    const relative=cleanRelative(workspaceRelativePath);
    const input={projectId,runtimeNodeId,workspaceRootId,workspaceRelativePath:relative,
      expectedGitRemoteUrl:expectedGitRemoteUrl??null};
    const inputSha256=digest(input),doc=this.read(),replay=this.#replay(doc,operationId,inputSha256);
    if(replay)return replay;
    if(doc.mappings.some(x=>x.projectId===projectId))fail('BUSINESS_PROJECT_ALREADY_MAPPED');
    const resolved=resolveNoSymlink(root.path,relative);
    this.#verifyGitRemote(resolved.canonical,expectedGitRemoteUrl);
    const mapping={...input,expectedGitRemoteUrl:undefined,canonicalPath:resolved.canonical,
      mappingRevision:doc.nextMappingRevision++};
    delete mapping.expectedGitRemoteUrl;
    doc.mappings.push(mapping);doc.mappings.sort((a,b)=>a.projectId.localeCompare(b.projectId));doc.revision++;
    const receipt={...publicMapping(mapping),mapped:true};
    this.#record(doc,{operationId,kind:'MAP_PROJECT',inputSha256,receipt});
    this.write(doc);return Object.freeze(receipt);
  }

  unmapProject({projectId,runtimeNodeId,expectedMappingRevision,operationId}={}){
    projectId=cleanSlug(projectId,'BUSINESS_PROJECT_ID_INVALID');
    runtimeNodeId=cleanUuid(runtimeNodeId,'BUSINESS_RUNTIME_NODE_ID_INVALID');
    operationId=cleanUuid(operationId,'BUSINESS_OPERATION_ID_INVALID');
    if(runtimeNodeId!==this.nodeId)fail('BUSINESS_RUNTIME_NODE_MISMATCH');
    if(!Number.isSafeInteger(expectedMappingRevision)||expectedMappingRevision<1)
      fail('BUSINESS_MAPPING_REVISION_INVALID');
    const input={projectId,runtimeNodeId,expectedMappingRevision};
    const inputSha256=digest(input),doc=this.read(),replay=this.#replay(doc,operationId,inputSha256);
    if(replay)return replay;
    const index=doc.mappings.findIndex(x=>x.projectId===projectId);
    if(index<0)fail('BUSINESS_PROJECT_NOT_MAPPED');
    const mapping=doc.mappings[index];
    if(mapping.mappingRevision!==expectedMappingRevision)fail('BUSINESS_MAPPING_REVISION_CONFLICT');
    doc.mappings.splice(index,1);doc.revision++;
    const receipt={projectId,runtimeNodeId,mappingRevision:expectedMappingRevision,unmapped:true};
    this.#record(doc,{operationId,kind:'UNMAP_PROJECT',inputSha256,receipt});
    this.write(doc);return Object.freeze(receipt);
  }

  listMappings(){return this.read().mappings.map(publicMapping);}
  listWorkspaceRoots(){return [...this.workspaceRoots.values()].map(x=>Object.freeze({workspaceRootId:x.workspaceRootId,label:x.label}));}

  resolveProject(projectId){
    projectId=cleanSlug(projectId,'BUSINESS_PROJECT_ID_INVALID');
    const mapping=this.read().mappings.find(x=>x.projectId===projectId);
    if(!mapping)fail('BUSINESS_PROJECT_NOT_MAPPED');
    const root=this.workspaceRoots.get(mapping.workspaceRootId);
    const resolved=resolveNoSymlink(root.path,mapping.workspaceRelativePath);
    if(resolved.canonical!==mapping.canonicalPath)fail('BUSINESS_PROJECT_MAPPING_CHANGED');
    return Object.freeze({...publicMapping(mapping),canonicalPath:mapping.canonicalPath});
  }
}
