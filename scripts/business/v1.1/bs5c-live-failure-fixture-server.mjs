import http from 'node:http';
import {existsSync} from 'node:fs';
import {createHash,randomUUID} from 'node:crypto';
import {join} from 'node:path';
import {createRemoteJWKSet,jwtVerify} from 'jose';
import {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js';
import {StreamableHTTPServerTransport} from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import {ListToolsRequestSchema} from '@modelcontextprotocol/sdk/types.js';
import {z} from 'zod';
import {boundedJSONBody} from '../../l1/bounded-json-body.mjs';
import {candidateTools,toOpenAiWireInputSchema} from './bs0-tool-catalog.mjs';
import {fetchBusinessMemberProfile} from './control/business-member-profile-rpc.mjs';
import {fetchBusinessRuntimeList} from './control/business-runtime-list-rpc.mjs';
import {BusinessRuntimeRegistry} from './control/business-runtime-registry.mjs';
import {loadRuntimeNodeIdentity} from './control/runtime-node-identity.mjs';
import {createBusinessContinuityRpcSession} from './continuity/business-continuity-rpc-session.mjs';
import {SupabaseBusinessContinuityStore} from './continuity/supabase-business-continuity-store.mjs';
import {LocalWorkspaceRegistry} from './runtime/local-workspace-registry.mjs';
import {BusinessRuntimeMappingService} from './runtime/business-runtime-mapping-service.mjs';
import {loadBusinessPublishableRuntimeConfig} from './runtime/publishable-runtime-config.mjs';
import {BusinessProjectAuthorizationCache} from './runtime/business-project-authorization-cache.mjs';
import {BusinessSemanticFileService} from './runtime/business-semantic-file-service.mjs';
import {BusinessSemanticGitService} from './runtime/business-semantic-git-service.mjs';
import {BusinessLocalEffectAudit} from './runtime/business-local-effect-audit.mjs';
import {BusinessDurableProcessBroker} from './runtime/business-durable-process-broker.mjs';
import {BusinessProcessRegistry} from './runtime/business-process-registry.mjs';
import {BusinessHostProcessService} from './runtime/business-host-process-service.mjs';
import {BusinessIsolatedProcessRegistry} from './runtime/business-isolated-process-registry.mjs';
import {BusinessIsolatedProcessService} from './runtime/business-isolated-process-service.mjs';
import {BusinessProcessService} from './runtime/business-process-service.mjs';
import {DurableHostProcesses} from '../../l1/durable-host-processes.mjs';
import {BusinessExecManager} from '../business-exec.mjs';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PROJECT=/^[a-z0-9][a-z0-9._-]{0,63}$/;
const port=Number(process.env.BS0_FIXTURE_PORT||31860),publicOrigin=(process.env.BS0_PUBLIC_ORIGIN||'').replace(/\/$/,'');
const publicConfig=loadBusinessPublishableRuntimeConfig(process.env.BS3A_PUBLIC_CONFIG_PATH||'');
const supabaseUrl=publicConfig.url,publishableKey=publicConfig.publishableKey;
const nodeIdentityPath=process.env.BS3A_NODE_IDENTITY_PATH||'',mappingStateDir=process.env.BS3A_MAPPING_STATE_DIR||'';
const workspaceRootId=process.env.BS3A_WORKSPACE_ROOT_ID||'',workspaceRootPath=process.env.BS3A_WORKSPACE_ROOT_PATH||'';
const stateDir=process.env.BS5C_STATE_DIR||'',outageFlag=process.env.BS5C_OUTAGE_FLAG||join(stateDir,'outage.flag');
const canaryEnabled=process.env.BS5C_ENABLE_CANARY==='1',canaryProject=process.env.BS5C_CANARY_PROJECT||'',canaryWorkspaceRelative=process.env.BS5C_CANARY_WORKSPACE_RELATIVE||'';
const mapOperationId=process.env.BS5C_MAP_OPERATION_ID||'',unmapOperationId=process.env.BS5C_UNMAP_OPERATION_ID||'';
const gitBinary=process.env.BS5C_GIT_BIN||'/usr/bin/git';
const offlineFile='bs5c-offline.txt',offlineContent='BS5C_LOCAL_FILE_OK\n',offlineBranch='bs5c-offline-work';
const hostExecutable='/usr/bin/printf',hostArg='BS5C_HOST_OFFLINE_OK\n',isolatedCommand="printf 'BS5C_ISOLATED_OK\\n'",offlineObjective='BS5C continuity mutation must fail closed';
const nativeConfig={nativeCreateBinary:process.env.BS5C_NATIVE_CREATE_BIN||'',nativeCreateSha256:process.env.BS5C_NATIVE_CREATE_SHA256||'',nativeReplaceBinary:process.env.BS5C_NATIVE_REPLACE_BIN||'',nativeReplaceSha256:process.env.BS5C_NATIVE_REPLACE_SHA256||'',nativeMkdirBinary:process.env.BS5C_NATIVE_MKDIR_BIN||'',nativeMkdirSha256:process.env.BS5C_NATIVE_MKDIR_SHA256||'',nativeMoveBinary:process.env.BS5C_NATIVE_MOVE_BIN||'',nativeMoveSha256:process.env.BS5C_NATIVE_MOVE_SHA256||'',nativeDeleteBinary:process.env.BS5C_NATIVE_DELETE_BIN||'',nativeDeleteSha256:process.env.BS5C_NATIVE_DELETE_SHA256||''};
const dockerBinary=process.env.BS5C_DOCKER_BIN||'',dockerSha256=process.env.BS5C_DOCKER_SHA256||'',imageRef=process.env.BS5C_EXEC_IMAGE_REF||'',imageId=process.env.BS5C_EXEC_IMAGE_ID||'';
if(!Number.isInteger(port)||port<1024||port>65535||!/^https:\/\/[^/]+$/.test(publicOrigin)||!stateDir.startsWith('/')||!workspaceRootPath.startsWith('/'))throw Error('BS5C_CONFIG_INVALID');
if(canaryEnabled&&(!PROJECT.test(canaryProject)||!canaryWorkspaceRelative||!UUID.test(mapOperationId)||!UUID.test(unmapOperationId)))throw Error('BS5C_CANARY_CONFIG_INVALID');
for(const [k,v] of Object.entries(nativeConfig))if(typeof v!=='string'||!v)throw Error(`BS5C_NATIVE_CONFIG_REQUIRED_${k}`);
const nodeIdentity=loadRuntimeNodeIdentity(nodeIdentityPath);
const mappingFile=join(mappingStateDir,'workspace-mappings.json');
const workspaceRegistry=new LocalWorkspaceRegistry({stateDir:mappingStateDir,nodeId:nodeIdentity.nodeId,initialize:!existsSync(mappingFile),workspaceRoots:[{workspaceRootId,path:workspaceRootPath,label:workspaceRootId}]});
const auditDir=join(stateDir,'audit'),hostDir=join(stateDir,'host'),isolatedDir=join(stateDir,'isolated');
const audit=new BusinessLocalEffectAudit({stateDir:auditDir,initialize:!existsSync(join(auditDir,'local-effect-audit.key'))});
const hostBroker=new BusinessDurableProcessBroker(hostDir,{initialize:!existsSync(join(hostDir,'state.json'))});
const hostBindings=new BusinessProcessRegistry({stateDir:hostDir,initialize:!existsSync(join(hostDir,'business-process-bindings.key'))});
const hostProcesses=new DurableHostProcesses(hostBroker);
const isolatedBindings=new BusinessIsolatedProcessRegistry({stateDir:isolatedDir,initialize:!existsSync(join(isolatedDir,'business-isolated-process-bindings.key'))});
const latestTokens=new Map(),routeLease=new Map(),arrivals=[];
const outage=()=>existsSync(outageFlag),key=(member,projectId)=>member+'\0'+projectId;
const sessionFor=token=>createBusinessContinuityRpcSession({supabaseUrl,publishableKey,accessToken:token});
const projectAuthCache=new BusinessProjectAuthorizationCache({ttlMs:300000,loadFresh:async({authenticatedMemberKey,projectId})=>{
 if(outage())throw Error('BUSINESS_BACKEND_UNAVAILABLE');const token=latestTokens.get(authenticatedMemberKey);if(!token)throw Error('BUSINESS_BACKEND_UNAVAILABLE');
 const session=sessionFor(token),continuity=new SupabaseBusinessContinuityStore({authSession:session});const [context,status]=await Promise.all([continuity.projectContext({projectId,limit:1}),session.rpc('bc_schema_status',{})]);
 if(status.error||typeof status.data?.organizationSlug!=='string'||!status.data.organizationSlug)throw Error('BUSINESS_BACKEND_UNAVAILABLE');
 return {projectId,authorized:true,projectProfile:context.projectProfile,organizationId:status.data.organizationSlug};
}});
const authorizeProject=args=>projectAuthCache.authorize(args);
async function loadRoutes({authenticatedMemberKey,projectId}){
 const mapping=workspaceRegistry.resolveProject(projectId),k=key(authenticatedMemberKey,projectId);
 if(!outage()){
  const token=latestTokens.get(authenticatedMemberKey);if(!token)throw Error('BUSINESS_BACKEND_UNAVAILABLE');const runtime=new BusinessRuntimeRegistry({authSession:sessionFor(token)}),node=await runtime.status(nodeIdentity.nodeId);
  const session=node.leaseExpiresAt?{sessionState:'ACTIVE',leaseExpiresAt:node.leaseExpiresAt}:null;routeLease.set(k,{node,session});return {routes:[{node,mapping,session}],controlReachable:true};
 }
 const cached=routeLease.get(k);if(!cached)throw Error('BUSINESS_AUTH_LEASE_EXPIRED');return {routes:[{node:cached.node,mapping,session:cached.session}],controlReachable:false,nowMs:Date.now()};
}
const hostService=new BusinessHostProcessService({processBroker:hostBroker,registry:hostBindings,processes:hostProcesses,authorizeProject,loadRoutes});
const isolatedService=new BusinessIsolatedProcessService({authorizeProject,loadRoutes,registry:isolatedBindings,audit,execManagerFactory:r=>new BusinessExecManager(r,{dockerBinary,dockerSha256,imageRef,imageId,ownerId:createHash('sha256').update(stateDir+'\0bs5c').digest('hex').slice(0,24),instanceId:randomUUID()})});
const processService=new BusinessProcessService({hostService,isolatedService});
let isolatedInitialized=false;
const issuer=`${supabaseUrl}/auth/v1`,jwks=createRemoteJWKSet(new URL(`${issuer}/.well-known/jwks.json`)),resource=`${publicOrigin}/mcp`,metadataUrl=`${publicOrigin}/.well-known/oauth-protected-resource`;
const json=(res,status,data,headers={})=>{res.writeHead(status,{'content-type':'application/json','cache-control':'no-store',...headers});res.end(JSON.stringify(data));};
const bearer=req=>/^Bearer\s+(.+)$/i.exec(req.headers.authorization||'')?.[1]||null;
async function verify(req){const token=bearer(req);if(!token)throw Error('AUTH_REQUIRED');const {payload}=await jwtVerify(token,jwks,{issuer});if(typeof payload.sub!=='string'||!payload.sub)throw Error('AUTH_SUB_REQUIRED');latestTokens.set(payload.sub,token);return payload;}
const result=value=>({content:[{type:'text',text:JSON.stringify(value)}],structuredContent:value});
const descriptor=t=>({name:t.name,title:t.title,description:t.description,inputSchema:toOpenAiWireInputSchema(t),...(t.outputSchema?{outputSchema:z.toJSONSchema(t.outputSchema)}:{}),annotations:t.annotations,securitySchemes:t.securitySchemes,_meta:t._meta});
const exact=(ok,code='BS5C_SCOPE_DENIED')=>{if(!ok)throw Error(code);};
function wrappedSession(token){const base=sessionFor(token);return {ensureSession:()=>base.ensureSession(),rpc:(name,args)=>outage()?Promise.resolve({data:null,error:{message:'BUSINESS_BACKEND_UNAVAILABLE'}}):base.rpc(name,args)};}
function assertProject(args){exact(canaryEnabled&&args?.projectId===canaryProject&&(args.runtimeNodeId===undefined||args.runtimeNodeId===nodeIdentity.nodeId));}
function buildMcp(identity,token){
 const authSession=wrappedSession(token),continuity=new SupabaseBusinessContinuityStore({authSession}),runtimeRegistry=new BusinessRuntimeRegistry({authSession:sessionFor(token)});
 const mappingService=new BusinessRuntimeMappingService({workspaceRegistry,runtimeRegistry,authorizeProject:async projectId=>{const a=await authorizeProject({authenticatedMemberKey:identity.sub,projectId});return {projectId:a.projectId,authorized:true};}});
 const fileService=new BusinessSemanticFileService({authorizeProject,loadRoutes,audit,nativeConfig});
 const gitService=new BusinessSemanticGitService({authorizeProject,loadRoutes,authorizeWorkspaceClone:async()=>{throw Error('BS5C_CLONE_DISABLED');},audit,gitBinary});
 const mcp=new McpServer({name:'chatagent-business-v1.1-bs5c-live-fixture',version:'0.0.0-bs5c'});
 for(const t of candidateTools){const config={title:t.title,description:t.description,inputSchema:t.inputSchema,annotations:t.annotations,_meta:t._meta};if(t.outputSchema)config.outputSchema=t.outputSchema;mcp.registerTool(t.name,config,async(args)=>{arrivals.push({tool:t.name,outage:outage()});
  if(t.name==='business_get_status')return result({status:'live',degradedContinuity:outage(),localWorkEligible:projectAuthCache.snapshot().length>0});
  if(t.name==='member_get_profile'&&!outage())return result(await fetchBusinessMemberProfile({supabaseUrl,publishableKey,accessToken:token}));
  if(t.name==='runtime_list_nodes'&&!outage())return result(await fetchBusinessRuntimeList({supabaseUrl,publishableKey,accessToken:token,limit:args?.limit??50}));
  if(t.name==='runtime_map_project'&&canaryEnabled&&!outage()){exact(args?.projectId===canaryProject&&args?.runtimeNodeId===nodeIdentity.nodeId&&args?.workspaceRootId===workspaceRootId&&args?.workspaceRelativePath===canaryWorkspaceRelative&&args?.operationId===mapOperationId&&args?.expectedGitRemoteUrl===undefined);return result(await mappingService.mapProject(args));}
  if(t.name==='runtime_unmap_project'&&canaryEnabled&&!outage()){exact(args?.projectId===canaryProject&&args?.runtimeNodeId===nodeIdentity.nodeId&&args?.operationId===unmapOperationId&&Number.isSafeInteger(args?.expectedMappingRevision));return result(await mappingService.unmapProject(args));}
  if(t.name==='git_get_status'&&canaryEnabled){assertProject(args);return result(await gitService.getStatus({authenticatedMemberKey:identity.sub,...args}));}
  if(t.name==='fs_create_file'&&canaryEnabled&&outage()){assertProject(args);exact(args?.relativePath===offlineFile&&args?.content===offlineContent);return result(await fileService.createFile({authenticatedMemberKey:identity.sub,...args}));}
  if(t.name==='git_create_branch'&&canaryEnabled&&outage()){assertProject(args);exact(args?.branchName===offlineBranch&&(args?.startPoint===undefined||args.startPoint==='HEAD'));return result(await gitService.createBranch({authenticatedMemberKey:identity.sub,...args}));}
  if(t.name==='process_start_host'&&canaryEnabled&&outage()){assertProject(args);exact(args?.executable===hostExecutable&&Array.isArray(args?.argv)&&args.argv.length===1&&args.argv[0]===hostArg&&args?.cwd==='.'&&UUID.test(args?.idempotencyKey??''));return result(await processService.startHost({authenticatedMemberKey:identity.sub,...args,timeoutMs:Math.min(args.timeoutMs??5000,5000)}));}
  if(t.name==='process_start_isolated'&&canaryEnabled&&outage()){assertProject(args);exact(args?.command===isolatedCommand&&(args.cwd===undefined||args.cwd==='.')&&(args.timeoutMs===undefined||args.timeoutMs<=15000));if(!isolatedInitialized){await isolatedService.initialize();isolatedInitialized=true;}return result(await processService.startIsolated({authenticatedMemberKey:identity.sub,...args,timeoutMs:15000,yieldTimeMs:Math.min(args.yieldTimeMs??5000,5000),maxOutputBytes:Math.min(args.maxOutputBytes??65536,65536)}));}
  if(t.name==='process_get_status'&&canaryEnabled)return result(await processService.getStatus({authenticatedMemberKey:identity.sub,...args}));
  if(t.name==='process_read_output'&&canaryEnabled)return result(await processService.readOutput({authenticatedMemberKey:identity.sub,...args,maxBytes:Math.min(args.maxBytes??65536,65536),waitMs:Math.min(args.waitMs??0,5000)}));
  if(t.name==='process_terminate_job'&&canaryEnabled)return result(await processService.terminateJob({authenticatedMemberKey:identity.sub,...args}));
  if(t.name==='continuity_get_context'&&canaryEnabled){exact(args?.projectId===canaryProject);return result(await continuity.getContext(args));}
  if(t.name==='continuity_start_task'&&canaryEnabled&&outage()){exact(args?.projectId===canaryProject&&args?.objective===offlineObjective&&UUID.test(args?.operationId??''));return result(await continuity.taskStart(args));}
  return {content:[{type:'text',text:JSON.stringify({probe:true,noEffect:true,tool:t.name,outage:outage()})}]};
 });}
 mcp.server.setRequestHandler(ListToolsRequestSchema,()=>({tools:candidateTools.map(descriptor)}));return mcp;
}
const server=http.createServer(async(req,res)=>{
 if(req.method==='GET'&&(req.url==='/.well-known/oauth-protected-resource'||req.url==='/.well-known/oauth-protected-resource/mcp'))return json(res,200,{resource,authorization_servers:[issuer],scopes_supported:['openid','email','profile'],bearer_methods_supported:['header']});
 if(req.method==='GET'&&req.url==='/healthz')return json(res,200,{status:'live',fixture:true,canaryEnabled,outageMode:outage(),nodeName:nodeIdentity.nodeName,mappingCount:workspaceRegistry.listMappings().length,projectLeaseCount:projectAuthCache.snapshot().length,routeLeaseCount:routeLease.size,auditRecordCount:audit.readRecent(200).length,isolatedBindingCount:isolatedBindings.snapshot().length,arrivalSequence:arrivals.slice(-30)});
 if(req.url!=='/mcp'||req.method!=='POST')return json(res,404,{error:'NOT_FOUND'});
 let identity;try{identity=await verify(req);}catch{return json(res,401,{error:'UNAUTHORIZED'},{'www-authenticate':`Bearer resource_metadata="${metadataUrl}"`});}
 let body;try{body=(await boundedJSONBody(req,{maxBytes:350000,oversizeCode:'BODY_LIMIT'})).body;}catch(e){return json(res,e.message==='BODY_LIMIT'?413:400,{error:e.message});}
 const mcp=buildMcp(identity,bearer(req)),transport=new StreamableHTTPServerTransport({sessionIdGenerator:undefined,enableJsonResponse:true});
 try{await mcp.connect(transport);await transport.handleRequest(req,res,body);}catch(e){if(!res.headersSent)json(res,500,{error:String(e?.message||'BS5C_FIXTURE_INTERNAL')});}finally{try{await mcp.close();}catch{}}
});
async function shutdown(){try{if(isolatedInitialized)await isolatedService.close();}catch{}try{hostProcesses.stopAll();}catch{}server.close(()=>process.exit(0));setTimeout(()=>process.exit(1),2000).unref();}
process.on('SIGTERM',()=>void shutdown());process.on('SIGINT',()=>void shutdown());
server.listen(port,'127.0.0.1',()=>console.log(JSON.stringify({event:'bs5c_live_fixture_started',port,canaryEnabled,outageMode:outage(),mappingCount:workspaceRegistry.listMappings().length})));
