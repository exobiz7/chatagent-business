import {createHash} from 'node:crypto';
import {lstatSync,realpathSync,statSync} from 'node:fs';
import {isAbsolute,join,resolve,sep} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {resolveBusinessRuntimeRoute} from './business-runtime-router.mjs';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SLUG=/^[a-z0-9][a-z0-9._-]{0,63}$/;
const TERMINAL=new Set(['EXITED','FAILED','TERMINATED','RECOVERY_REQUIRED']);
const DONOR_MAX_READ=16384;
const PUBLIC_MAX_READ=524288;
const PUBLIC_MAX_WAIT=30000;
const fail=code=>{throw Error(code);};
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const within=(child,parent)=>child===parent||child.startsWith(parent+sep);

function cleanMemberKey(value){
  if(typeof value!=='string'||value.length<8||value.length>512||/[\0\r\n]/.test(value))
    fail('BUSINESS_AUTHENTICATED_MEMBER_INVALID');
  return value;
}
function cleanProject(value){if(typeof value!=='string'||!SLUG.test(value))fail('BUSINESS_PROJECT_ID_INVALID');return value;}
function cleanStartInput({executable,argv,cwd,timeoutMs,idempotencyKey}){
  if(typeof executable!=='string'||!isAbsolute(executable)||executable.length>4096||
     !Array.isArray(argv)||argv.length>48||argv.some(x=>typeof x!=='string'||x.length>8192||x.includes('\0'))||
     typeof cwd!=='string'||cwd.length<1||cwd.length>4096||typeof idempotencyKey!=='string'||!UUID.test(idempotencyKey)||
     !Number.isInteger(timeoutMs)||timeoutMs<100||timeoutMs>3600000)fail('BUSINESS_PROCESS_START_INPUT_INVALID');
}
function relativeCwd(value){
  if(isAbsolute(value))fail('BUSINESS_PROCESS_CWD_MUST_BE_PROJECT_RELATIVE');
  if(value==='.')return '';
  const parts=value.split('/');
  if(parts.some(x=>x===''||x==='.'||x==='..'))fail('BUSINESS_PROCESS_CWD_INVALID');
  return parts.join('/');
}
function resolveMappedCwd(root,relative){
  if(typeof root!=='string'||!isAbsolute(root))fail('BUSINESS_PROCESS_ROUTE_INVALID');
  const rootStat=lstatSync(root);
  if(!rootStat.isDirectory()||rootStat.isSymbolicLink())fail('BUSINESS_PROCESS_ROUTE_INVALID');
  const canonicalRoot=resolve(realpathSync(root));
  let current=canonicalRoot;
  for(const part of relative?relative.split('/'):[]){
    current=join(current,part);
    let st;try{st=lstatSync(current);}catch{fail('BUSINESS_PROCESS_CWD_UNAVAILABLE');}
    if(st.isSymbolicLink())fail('BUSINESS_PROCESS_CWD_SYMLINK_DENIED');
  }
  let final;try{final=statSync(current);}catch{fail('BUSINESS_PROCESS_CWD_UNAVAILABLE');}
  if(!final.isDirectory())fail('BUSINESS_PROCESS_CWD_NOT_DIRECTORY');
  const canonical=resolve(realpathSync(current));
  if(!within(canonical,canonicalRoot))fail('BUSINESS_PROCESS_CWD_ESCAPE');
  return canonical;
}
function validateProjectAuthorization(value,projectId){
  if(!value||typeof value!=='object'||Array.isArray(value)||value.projectId!==projectId||value.authorized!==true)
    fail('BUSINESS_PROJECT_AUTHORIZATION_DENIED');
}
function routePayload(value){
  if(Array.isArray(value))return {routes:value,controlReachable:true,nowMs:Date.now()};
  if(!value||typeof value!=='object'||Array.isArray(value)||!Array.isArray(value.routes))
    fail('BUSINESS_RUNTIME_ROUTE_INPUT_INVALID');
  return {routes:value.routes,controlReachable:value.controlReachable!==false,
    nowMs:Number.isFinite(value.nowMs)?value.nowMs:Date.now()};
}
function assertBindingRoute(binding,route){
  if(route.nodeId!==binding.runtimeNodeId||route.mappingRevision!==binding.mappingRevision||route.nodeType!==binding.nodeType)
    fail('BUSINESS_PROCESS_ROUTE_STALE');
}

export class BusinessHostProcessService{
  constructor({processes,processBroker,registry,authorizeProject,loadRoutes}={}){
    if(!processes||typeof processes.start!=='function'||typeof processes.status!=='function'||
       typeof processes.read!=='function'||typeof processes.stop!=='function'||
       !processBroker||typeof processBroker.runAuthorizedHostStart!=='function'||
       !registry||typeof registry.reserveStart!=='function'||typeof registry.bind!=='function'||
       typeof registry.lookupForActor!=='function'||typeof authorizeProject!=='function'||typeof loadRoutes!=='function')
      fail('BUSINESS_HOST_PROCESS_SERVICE_CONFIG_INVALID');
    this.processes=processes;this.processBroker=processBroker;this.registry=registry;
    this.authorizeProject=authorizeProject;this.loadRoutes=loadRoutes;
  }

  async #authorizeProject(authenticatedMemberKey,projectId){
    validateProjectAuthorization(await this.authorizeProject({authenticatedMemberKey,projectId}),projectId);
  }
  async #resolveRoute(authenticatedMemberKey,projectId,runtimeNodeId){
    await this.#authorizeProject(authenticatedMemberKey,projectId);
    const source=routePayload(await this.loadRoutes({authenticatedMemberKey,projectId}));
    return resolveBusinessRuntimeRoute({projectId,runtimeNodeId,toolName:'process_start_host',...source});
  }
  async #binding(authenticatedMemberKey,processId){
    const binding=this.registry.lookupForActor({processId,authenticatedMemberKey});
    const route=await this.#resolveRoute(authenticatedMemberKey,binding.projectId,binding.runtimeNodeId);
    assertBindingRoute(binding,route);
    return {binding,route};
  }

  async startHost({authenticatedMemberKey,projectId,runtimeNodeId=null,executable,argv=[],cwd='.',timeoutMs=300000,idempotencyKey}={}){
    authenticatedMemberKey=cleanMemberKey(authenticatedMemberKey);projectId=cleanProject(projectId);
    cleanStartInput({executable,argv,cwd,timeoutMs,idempotencyKey});
    const publicCwd=relativeCwd(cwd);
    const route=await this.#resolveRoute(authenticatedMemberKey,projectId,runtimeNodeId);
    const internalCwd=resolveMappedCwd(route.localProjectRoot,publicCwd);
    const inputSha256=hash({projectId,runtimeNodeId:route.nodeId,mappingRevision:route.mappingRevision,
      executable,argv,cwd:publicCwd,timeoutMs});
    const reservation=this.registry.reserveStart({idempotencyKey,inputSha256,authenticatedMemberKey,
      projectId,runtimeNodeId:route.nodeId,mappingRevision:route.mappingRevision,nodeType:route.nodeType});
    assertBindingRoute(reservation,route);
    if(reservation.state==='BOUND')return this.processes.status({processId:reservation.processId});
    const started=await this.processBroker.runAuthorizedHostStart(()=>this.processes.start({
      executable,argv,cwd:internalCwd,timeoutMs,idempotencyKey
    }));
    this.registry.bind({idempotencyKey,inputSha256,processId:started.processId});
    return started;
  }

  async getStatus({authenticatedMemberKey,processId}={}){
    authenticatedMemberKey=cleanMemberKey(authenticatedMemberKey);
    await this.#binding(authenticatedMemberKey,processId);
    return this.processes.status({processId});
  }

  #readNow(processId,cursor,maxBytes){
    let at=cursor,remaining=maxBytes,last=null;const chunks=[];
    while(remaining>0){
      const before=at,take=Math.min(DONOR_MAX_READ,remaining);
      const part=this.processes.read({processId,cursor:at,maxBytes:take});
      const consumed=part.cursor-before;
      if(consumed<0||consumed>take)fail('BUSINESS_PROCESS_READ_INVARIANT');
      chunks.push(part.content);at=part.cursor;remaining-=consumed;last=part;
      if(consumed===0||!part.hasMore)break;
    }
    if(!last)fail('BUSINESS_PROCESS_READ_INVARIANT');
    return {...last,cursor:at,content:chunks.join(''),hasMore:last.hasMore};
  }

  async readOutput({authenticatedMemberKey,processId,cursor=0,maxBytes=DONOR_MAX_READ,waitMs=0}={}){
    authenticatedMemberKey=cleanMemberKey(authenticatedMemberKey);
    const {route}=await this.#binding(authenticatedMemberKey,processId);
    if(!Number.isSafeInteger(cursor)||cursor<0||!Number.isInteger(maxBytes)||maxBytes<1||maxBytes>PUBLIC_MAX_READ||
       !Number.isInteger(waitMs)||waitMs<0||waitMs>PUBLIC_MAX_WAIT)fail('BUSINESS_PROCESS_READ_BOUNDS_INVALID');
    let effectiveWait=waitMs;
    if(route.authorizationSource==='CACHED_LEASE'&&route.leaseExpiresAt){
      const remaining=Date.parse(route.leaseExpiresAt)-Date.now();
      effectiveWait=Math.max(0,Math.min(effectiveWait,Number.isFinite(remaining)?remaining:0));
    }
    const deadline=Date.now()+effectiveWait;
    while(true){
      const result=this.#readNow(processId,cursor,maxBytes);
      if(result.cursor>cursor||TERMINAL.has(result.state)||Date.now()>=deadline)return result;
      await delay(Math.min(50,Math.max(1,deadline-Date.now())));
    }
  }

  async terminateJob({authenticatedMemberKey,processId}={}){
    authenticatedMemberKey=cleanMemberKey(authenticatedMemberKey);
    await this.#binding(authenticatedMemberKey,processId);
    return this.processes.stop({processId});
  }
}
