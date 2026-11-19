import {randomUUID} from 'node:crypto';
import {resolveBusinessRuntimeRoute} from './business-runtime-router.mjs';

const PROJECT=/^[a-z0-9][a-z0-9._-]{0,63}$/;
const PROCESS=/^xexec_[a-f0-9]{32}$/;
const fail=code=>{throw Error(code);};
const terminal=new Set(['completed','terminated','timed_out']);

function member(value){
  if(typeof value!=='string'||value.length<8||value.length>512||/[\0\r\n]/.test(value))fail('BUSINESS_AUTHENTICATED_MEMBER_INVALID');
  return value;
}
function project(value){if(typeof value!=='string'||!PROJECT.test(value))fail('BUSINESS_PROJECT_ID_INVALID');return value;}
function routePayload(value){
  if(Array.isArray(value))return {routes:value,controlReachable:true,nowMs:Date.now()};
  if(!value||typeof value!=='object'||Array.isArray(value)||!Array.isArray(value.routes))fail('BUSINESS_RUNTIME_ROUTE_INPUT_INVALID');
  return {routes:value.routes,controlReachable:value.controlReachable!==false,nowMs:Number.isFinite(value.nowMs)?value.nowMs:Date.now()};
}
function projectAuthorization(value,projectId){
  if(!value||typeof value!=='object'||Array.isArray(value)||value.projectId!==projectId||value.authorized!==true||
     value.projectProfile!=='STANDARD'||typeof value.organizationId!=='string'||!value.organizationId)
    fail(value?.projectProfile&&value.projectProfile!=='STANDARD'?'BUSINESS_PROFILE_DENIED':'BUSINESS_PROJECT_AUTHORIZATION_DENIED');
  return value;
}
function assertBindingRoute(binding,route){
  if(route.nodeId!==binding.runtimeNodeId||route.mappingRevision!==binding.mappingRevision||route.nodeType!==binding.nodeType)
    fail('BUSINESS_PROCESS_ROUTE_STALE');
}
function resultState(state){
  if(state==='completed')return 'EXITED';
  if(state==='terminated')return 'TERMINATED';
  if(state==='timed_out')return 'FAILED';
  if(state==='running')return 'RUNNING';
  return String(state??'FAILED').toUpperCase();
}
function publicStatus(processId,value){
  return {processId,state:resultState(value.state),exitCode:value.exitCode??null,startedAt:value.startedAt??null,finishedAt:value.finishedAt??null};
}
function auditResultCode(error){const c=String(error?.message??'BUSINESS_ISOLATED_PROCESS_FAILED');return /^[A-Z][A-Z0-9_]{2,79}$/.test(c)?c:'BUSINESS_ISOLATED_PROCESS_FAILED';}

class RoutedExecRegistry{
  constructor(){this.routes=new Map();this.orgId='unknown';}
  set({organizationId,projectId,hostRoot}){this.orgId=organizationId;this.routes.set(projectId,{projectId,displayName:projectId,hostRoot,profile:'STANDARD',enabled:true});}
  organization(){return {organizationId:this.orgId};}
  resolve(projectId){const p=this.routes.get(projectId);if(!p)fail('BUSINESS_PROJECT_UNKNOWN');return {...p};}
}

export class BusinessIsolatedProcessService{
  constructor({authorizeProject,loadRoutes,registry,audit,execManagerFactory}={}){
    if(typeof authorizeProject!=='function'||typeof loadRoutes!=='function'||!registry||typeof registry.bind!=='function'||
       typeof registry.lookupForActor!=='function'||!audit||typeof audit.append!=='function'||typeof execManagerFactory!=='function')
      fail('BUSINESS_ISOLATED_PROCESS_SERVICE_CONFIG_INVALID');
    this.authorizeProject=authorizeProject;this.loadRoutes=loadRoutes;this.registry=registry;this.audit=audit;
    this.execRegistry=new RoutedExecRegistry();this.exec=execManagerFactory(this.execRegistry);
    if(!this.exec||typeof this.exec.initialize!=='function'||typeof this.exec.start!=='function'||typeof this.exec.status!=='function'||
       typeof this.exec.read!=='function'||typeof this.exec.terminate!=='function'||typeof this.exec.close!=='function')
      fail('BUSINESS_ISOLATED_PROCESS_SERVICE_CONFIG_INVALID');
  }
  async initialize(){return await this.exec.initialize();}
  async close(){return await this.exec.close();}
  async #route(authenticatedMemberKey,projectId,runtimeNodeId){
    const auth=projectAuthorization(await this.authorizeProject({authenticatedMemberKey,projectId}),projectId);
    const source=routePayload(await this.loadRoutes({authenticatedMemberKey,projectId}));
    const route=resolveBusinessRuntimeRoute({projectId,runtimeNodeId,toolName:'process_start_isolated',...source});
    this.execRegistry.set({organizationId:auth.organizationId,projectId,hostRoot:route.localProjectRoot});
    return {auth,route};
  }
  async #binding(authenticatedMemberKey,processId){
    const binding=this.registry.lookupForActor({processId,authenticatedMemberKey});
    const {auth,route}=await this.#route(authenticatedMemberKey,binding.projectId,binding.runtimeNodeId);assertBindingRoute(binding,route);
    return {binding,auth,route};
  }
  #auditBase({authenticatedMemberKey,auth,route,projectId,requestId,tool,effectClass,target}){
    return {requestId,authenticatedMemberKey,organizationId:auth.organizationId,projectId,runtimeNodeId:route.nodeId,
      mappingRevision:route.mappingRevision,nodeType:route.nodeType,projectProfile:'STANDARD',workspaceRootId:null,
      tool,effectClass,targetRelativePaths:[target],preconditionDigest:null};
  }
  async startIsolated({authenticatedMemberKey,projectId,runtimeNodeId=null,command,cwd='.',timeoutMs=300000,yieldTimeMs=10000,maxOutputBytes=262144}={}){
    authenticatedMemberKey=member(authenticatedMemberKey);projectId=project(projectId);
    const {auth,route}=await this.#route(authenticatedMemberKey,projectId,runtimeNodeId),requestId=randomUUID();
    const base=this.#auditBase({authenticatedMemberKey,auth,route,projectId,requestId,tool:'process_start_isolated',effectClass:'EXEC_ISOLATED_START',target:`project/${projectId}`});
    this.audit.append({...base,stage:'ISSUED',resultCode:'ISSUED',effectOutcome:'PENDING'});
    let started=null;
    try{
      started=await this.exec.start({projectId,command,cwd,timeoutMs,yieldTimeMs,maxOutputBytes});
      if(!PROCESS.test(started?.sessionId??''))fail('BUSINESS_ISOLATED_PROCESS_ID_INVALID');
      try{this.registry.bind({processId:started.sessionId,authenticatedMemberKey,projectId,runtimeNodeId:route.nodeId,mappingRevision:route.mappingRevision,nodeType:route.nodeType});}
      catch(error){try{await this.exec.terminate({projectId,sessionId:started.sessionId});}catch{}throw error;}
      this.audit.append({...base,stage:'COMPLETED',resultCode:'OK',effectOutcome:'COMMITTED'});
      return {...publicStatus(started.sessionId,started),cursor:started.nextSeq??0,content:Buffer.from(started.outputBase64??'','base64').toString('utf8'),hasMore:started.hasMore===true};
    }catch(error){
      const outcome=started?'COMMITTED':'NONE';try{this.audit.append({...base,stage:'FAILED',resultCode:auditResultCode(error),effectOutcome:outcome});}catch{error.audit='UNCERTAIN';}
      throw error;
    }
  }
  async getStatus({authenticatedMemberKey,processId}={}){
    authenticatedMemberKey=member(authenticatedMemberKey);if(!PROCESS.test(processId??''))fail('BUSINESS_PROCESS_NOT_OWNED');
    const {binding}=await this.#binding(authenticatedMemberKey,processId);return publicStatus(processId,this.exec.status({projectId:binding.projectId,sessionId:processId}));
  }
  async readOutput({authenticatedMemberKey,processId,cursor=0,maxBytes=262144,waitMs=0}={}){
    authenticatedMemberKey=member(authenticatedMemberKey);if(!PROCESS.test(processId??''))fail('BUSINESS_PROCESS_NOT_OWNED');
    const {binding}=await this.#binding(authenticatedMemberKey,processId);
    const value=await this.exec.read({projectId:binding.projectId,sessionId:processId,afterSeq:cursor,waitMs,maxOutputBytes:maxBytes});
    return {...publicStatus(processId,value),cursor:value.nextSeq,content:Buffer.from(value.outputBase64??'','base64').toString('utf8'),hasMore:value.hasMore===true,truncated:value.truncated===true};
  }
  async terminateJob({authenticatedMemberKey,processId}={}){
    authenticatedMemberKey=member(authenticatedMemberKey);if(!PROCESS.test(processId??''))fail('BUSINESS_PROCESS_NOT_OWNED');
    const {binding,auth,route}=await this.#binding(authenticatedMemberKey,processId),requestId=randomUUID();
    const base=this.#auditBase({authenticatedMemberKey,auth,route,projectId:binding.projectId,requestId,tool:'process_terminate_job',effectClass:'EXEC_ISOLATED_TERMINATE',target:`process/${processId}`});
    this.audit.append({...base,stage:'ISSUED',resultCode:'ISSUED',effectOutcome:'PENDING'});
    try{
      const value=await this.exec.terminate({projectId:binding.projectId,sessionId:processId});
      this.audit.append({...base,stage:'COMPLETED',resultCode:'OK',effectOutcome:'COMMITTED'});return publicStatus(processId,value);
    }catch(error){try{this.audit.append({...base,stage:'FAILED',resultCode:auditResultCode(error),effectOutcome:'NONE'});}catch{error.audit='UNCERTAIN';}throw error;}
  }
}
