import {promises as fs} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {isAbsolute,join,sep} from 'node:path';
import {BusinessFileOps} from '../../business-file-ops.mjs';
import {resolveBusinessRuntimeRoute} from './business-runtime-router.mjs';
import {nativeMoveExclusive,nativeDeleteBounded} from './business-native-path-effects.mjs';

const PROJECT=/^[a-z0-9][a-z0-9._-]{0,63}$/;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SHA=/^[a-f0-9]{64}$/;
const PROFILES=new Set(['READ_ONLY','SAFE','STANDARD']);
const MUTATING_TOOLS=new Set(['fs_create_directory','fs_create_file','fs_replace_file','fs_patch_file','fs_move_path','fs_delete_path']);
const EFFECT_CLASS=Object.freeze({
  fs_create_directory:'CREATE',fs_create_file:'CREATE',fs_replace_file:'REPLACE',fs_patch_file:'PATCH',
  fs_move_path:'MOVE',fs_delete_path:'DELETE'
});
const fail=code=>{throw Error(code);};
const within=(child,parent)=>child===parent||child.startsWith(parent+sep);
const errorCode=e=>{
  const message=String(e?.message??'BUSINESS_FILE_OPERATION_FAILED');
  return /^[A-Z][A-Z0-9_]{2,79}$/.test(message)?message:'BUSINESS_FILE_OPERATION_FAILED';
};

function member(value){
  if(typeof value!=='string'||value.length<8||value.length>512||/[\0\r\n]/.test(value))fail('BUSINESS_AUTHENTICATED_MEMBER_INVALID');
  return value;
}
function project(value){if(typeof value!=='string'||!PROJECT.test(value))fail('BUSINESS_PROJECT_ID_INVALID');return value;}
function relative(value,{allowRoot=false}={}){
  if(typeof value!=='string'||value.length>4096||isAbsolute(value)||value.includes('\0')||/[\r\n]/.test(value))fail('BUSINESS_RELATIVE_PATH_INVALID');
  if(value===''&&allowRoot)return '';
  if(!value)fail('BUSINESS_RELATIVE_PATH_INVALID');
  const parts=value.split('/');
  if(parts.some(x=>!x||x==='.'||x==='..'))fail('BUSINESS_RELATIVE_PATH_INVALID');
  if(parts.includes('.git'))fail('BUSINESS_GIT_PATH_DENIED');
  return parts.join('/');
}
function routePayload(value){
  if(Array.isArray(value))return {routes:value,controlReachable:true,nowMs:Date.now()};
  if(!value||typeof value!=='object'||Array.isArray(value)||!Array.isArray(value.routes))fail('BUSINESS_RUNTIME_ROUTE_INPUT_INVALID');
  return {routes:value.routes,controlReachable:value.controlReachable!==false,nowMs:Number.isFinite(value.nowMs)?value.nowMs:Date.now()};
}
function projectAuthorization(value,projectId){
  if(!value||typeof value!=='object'||Array.isArray(value)||value.projectId!==projectId||value.authorized!==true||
     !PROFILES.has(value.projectProfile)||typeof value.organizationId!=='string'||!value.organizationId||value.organizationId.length>128)
    fail('BUSINESS_PROJECT_AUTHORIZATION_DENIED');
  return value;
}
async function resolvedPath(root,relativePath,{leafMayMissing=false}={}){
  if(typeof root!=='string'||!isAbsolute(root))fail('BUSINESS_RUNTIME_ROUTE_INVALID');
  const rootStat=await fs.lstat(root);if(!rootStat.isDirectory()||rootStat.isSymbolicLink())fail('BUSINESS_RUNTIME_ROUTE_INVALID');
  const canonicalRoot=await fs.realpath(root);let current=canonicalRoot;
  for(const [i,part] of relative(relativePath).split('/').entries()){
    current=join(current,part);
    try{
      const st=await fs.lstat(current);if(st.isSymbolicLink())fail('BUSINESS_SYMLINK_DENIED');
      if(i<relativePath.split('/').length-1&&!st.isDirectory())fail('BUSINESS_PARENT_NOT_DIRECTORY');
    }catch(e){
      if(e?.code==='ENOENT'&&leafMayMissing&&i===relativePath.split('/').length-1)return {absolute:current,missing:true,root:canonicalRoot};
      if(e?.code==='ENOENT')fail(i<relativePath.split('/').length-1?'BUSINESS_PARENT_NOT_FOUND':'BUSINESS_PATH_NOT_FOUND');
      throw e;
    }
  }
  const real=await fs.realpath(current);if(!within(real,canonicalRoot))fail('BUSINESS_PATH_ESCAPE');
  return {absolute:real,missing:false,root:canonicalRoot};
}

class RouteRegistry{
  constructor({organizationId,projectId,projectProfile,hostRoot}){this.org=organizationId;this.projectId=projectId;this.profile=projectProfile;this.hostRoot=hostRoot;}
  organization(){return {organizationId:this.org};}
  resolve(projectId){
    if(projectId!==this.projectId)fail('BUSINESS_PROJECT_UNKNOWN');
    return {projectId,displayName:projectId,hostRoot:this.hostRoot,profile:this.profile,enabled:true,rootAvailable:true};
  }
}

export class BusinessSemanticFileService{
  constructor({authorizeProject,loadRoutes,audit,nativeConfig}={}){
    if(typeof authorizeProject!=='function'||typeof loadRoutes!=='function'||!audit||typeof audit.append!=='function'||!nativeConfig)
      fail('BUSINESS_SEMANTIC_FILE_SERVICE_CONFIG_INVALID');
    for(const key of ['nativeCreateBinary','nativeCreateSha256','nativeReplaceBinary','nativeReplaceSha256','nativeMkdirBinary','nativeMkdirSha256',
      'nativeMoveBinary','nativeMoveSha256','nativeDeleteBinary','nativeDeleteSha256'])
      if(typeof nativeConfig[key]!=='string'||!nativeConfig[key])fail('BUSINESS_SEMANTIC_FILE_SERVICE_CONFIG_INVALID');
    this.authorizeProject=authorizeProject;this.loadRoutes=loadRoutes;this.audit=audit;this.nativeConfig=nativeConfig;
  }

  async #context({authenticatedMemberKey,projectId,runtimeNodeId,tool}){
    authenticatedMemberKey=member(authenticatedMemberKey);projectId=project(projectId);
    const auth=projectAuthorization(await this.authorizeProject({authenticatedMemberKey,projectId}),projectId);
    const source=routePayload(await this.loadRoutes({authenticatedMemberKey,projectId}));
    const route=resolveBusinessRuntimeRoute({projectId,runtimeNodeId,toolName:tool,...source});
    const registry=new RouteRegistry({organizationId:auth.organizationId,projectId,projectProfile:auth.projectProfile,hostRoot:route.localProjectRoot});
    const files=new BusinessFileOps(registry,this.nativeConfig);
    return {authenticatedMemberKey,projectId,auth,route,files};
  }

  #auditBase(ctx,{requestId,tool,targetRelativePaths,preconditionDigest=null}){
    return {requestId,authenticatedMemberKey:ctx.authenticatedMemberKey,organizationId:ctx.auth.organizationId,
      projectId:ctx.projectId,runtimeNodeId:ctx.route.nodeId,mappingRevision:ctx.route.mappingRevision,nodeType:ctx.route.nodeType,
      projectProfile:ctx.auth.projectProfile,tool,effectClass:EFFECT_CLASS[tool],targetRelativePaths,preconditionDigest};
  }
  async #mutate(ctx,{tool,targetRelativePaths,preconditionDigest=null},execute){
    if(!MUTATING_TOOLS.has(tool))fail('BUSINESS_SEMANTIC_FILE_TOOL_INVALID');
    const requestId=randomUUID(),base=this.#auditBase(ctx,{requestId,tool,targetRelativePaths,preconditionDigest});
    this.audit.append({...base,stage:'ISSUED',resultCode:'ISSUED',effectOutcome:'PENDING'});
    try{
      const result=await execute();
      try{this.audit.append({...base,stage:'COMPLETED',resultCode:'OK',effectOutcome:'COMMITTED'});}
      catch{const e=Error('BUSINESS_LOCAL_AUDIT_UNCERTAIN');e.effect='COMMITTED';e.audit='UNCERTAIN';e.retryable=false;throw e;}
      return {...result,runtimeNodeId:ctx.route.nodeId,mappingRevision:ctx.route.mappingRevision};
    }catch(error){
      if(String(error?.message)==='BUSINESS_LOCAL_AUDIT_UNCERTAIN')throw error;
      const outcome=error?.effect==='COMMITTED'?'COMMITTED':error?.effect==='UNCERTAIN'?'UNCERTAIN':'NONE';
      try{this.audit.append({...base,stage:'FAILED',resultCode:errorCode(error),effectOutcome:outcome});}catch{error.audit='UNCERTAIN';}
      throw error;
    }
  }
  #assertMutationProfile(ctx){if(ctx.auth.projectProfile==='READ_ONLY')fail('BUSINESS_PROFILE_DENIED');}

  async listDirectory(args={}){const ctx=await this.#context({...args,tool:'fs_list_directory'});return ctx.files.listDirectory(args);}
  async getPathInfo(args={}){const ctx=await this.#context({...args,tool:'fs_get_path_info'});return ctx.files.statPath(args);}
  async readFile(args={}){const ctx=await this.#context({...args,tool:'fs_read_file'});return ctx.files.readFile(args);}
  async getFileHash(args={}){const ctx=await this.#context({...args,tool:'fs_get_file_hash'});return ctx.files.hashFile(args);}

  async createDirectory(args={}){
    const ctx=await this.#context({...args,tool:'fs_create_directory'}),path=relative(args.relativePath);
    return this.#mutate(ctx,{tool:'fs_create_directory',targetRelativePaths:[path]},()=>ctx.files.makeDirectory(args));
  }
  async createFile(args={}){
    const ctx=await this.#context({...args,tool:'fs_create_file'}),path=relative(args.relativePath);
    return this.#mutate(ctx,{tool:'fs_create_file',targetRelativePaths:[path]},()=>ctx.files.createFile(args));
  }
  async replaceFile(args={}){
    const ctx=await this.#context({...args,tool:'fs_replace_file'}),path=relative(args.relativePath);
    return this.#mutate(ctx,{tool:'fs_replace_file',targetRelativePaths:[path],preconditionDigest:args.expectedSha256},()=>ctx.files.replaceFile(args));
  }
  async patchFile(args={}){
    const ctx=await this.#context({...args,tool:'fs_patch_file'}),path=relative(args.relativePath);
    return this.#mutate(ctx,{tool:'fs_patch_file',targetRelativePaths:[path],preconditionDigest:args.expectedSha256},()=>ctx.files.applyPatch(args));
  }
  async movePath(args={}){
    const ctx=await this.#context({...args,tool:'fs_move_path'});
    const sourceRelativePath=relative(args.sourceRelativePath),destinationRelativePath=relative(args.destinationRelativePath);
    if(sourceRelativePath===destinationRelativePath)fail('BUSINESS_MOVE_SAME_PATH');
    if(!(args.expectedSourceSha256===undefined||args.expectedSourceSha256===null||SHA.test(args.expectedSourceSha256)))fail('BUSINESS_WRITE_INVALID');
    const source=await resolvedPath(ctx.route.localProjectRoot,sourceRelativePath),destination=await resolvedPath(ctx.route.localProjectRoot,destinationRelativePath,{leafMayMissing:true});
    if(!destination.missing)fail('BUSINESS_DESTINATION_EXISTS');
    return this.#mutate(ctx,{tool:'fs_move_path',targetRelativePaths:[sourceRelativePath,destinationRelativePath],preconditionDigest:args.expectedSourceSha256??null},async()=>{
      this.#assertMutationProfile(ctx);
      const result=await nativeMoveExclusive({binary:this.nativeConfig.nativeMoveBinary,expectedBinarySha256:this.nativeConfig.nativeMoveSha256,
        source:source.absolute,destination:destination.absolute,expectedSourceSha256:args.expectedSourceSha256??null});
      return {projectId:ctx.projectId,sourceRelativePath,destinationRelativePath,...result};
    });
  }
  async deletePath(args={}){
    const ctx=await this.#context({...args,tool:'fs_delete_path'});
    const path=relative(args.relativePath),expectedKind=args.expectedKind;
    if(!['regular_file','empty_directory'].includes(expectedKind))fail('BUSINESS_DELETE_KIND_INVALID');
    if(expectedKind==='regular_file'&&!SHA.test(args.expectedSha256??''))fail('BUSINESS_DELETE_PRECONDITION_REQUIRED');
    if(expectedKind==='empty_directory'&&args.expectedSha256!==undefined)fail('BUSINESS_DELETE_PRECONDITION_INVALID');
    const target=await resolvedPath(ctx.route.localProjectRoot,path);
    return this.#mutate(ctx,{tool:'fs_delete_path',targetRelativePaths:[path],preconditionDigest:args.expectedSha256??null},async()=>{
      this.#assertMutationProfile(ctx);
      const result=await nativeDeleteBounded({binary:this.nativeConfig.nativeDeleteBinary,expectedBinarySha256:this.nativeConfig.nativeDeleteSha256,
        target:target.absolute,expectedKind,expectedSha256:args.expectedSha256??null});
      return {projectId:ctx.projectId,relativePath:path,...result};
    });
  }
}
