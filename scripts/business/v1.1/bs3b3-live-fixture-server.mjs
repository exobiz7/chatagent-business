import http from 'node:http';
import {existsSync} from 'node:fs';
import {join} from 'node:path';
import {createRemoteJWKSet,jwtVerify} from 'jose';
import {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js';
import {StreamableHTTPServerTransport} from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import {ListToolsRequestSchema} from '@modelcontextprotocol/sdk/types.js';
import {z} from 'zod';
import {boundedJSONBody} from '../../l1/bounded-json-body.mjs';
import {DurableHostProcesses} from '../../l1/durable-host-processes.mjs';
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
import {BusinessDurableProcessBroker} from './runtime/business-durable-process-broker.mjs';
import {BusinessProcessRegistry} from './runtime/business-process-registry.mjs';
import {BusinessHostProcessService} from './runtime/business-host-process-service.mjs';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const port=Number(process.env.BS0_FIXTURE_PORT||31860);
const publicOrigin=(process.env.BS0_PUBLIC_ORIGIN||'').replace(/\/$/,'');
const expectedAudience=process.env.BS0_EXPECTED_AUDIENCE||null;
const publicConfig=loadBusinessPublishableRuntimeConfig(process.env.BS3A_PUBLIC_CONFIG_PATH||'');
const supabaseUrl=publicConfig.url,publishableKey=publicConfig.publishableKey;
const nodeIdentityPath=process.env.BS3A_NODE_IDENTITY_PATH||'';
const mappingStateDir=process.env.BS3A_MAPPING_STATE_DIR||'';
const workspaceRootId=process.env.BS3A_WORKSPACE_ROOT_ID||'';
const workspaceRootPath=process.env.BS3A_WORKSPACE_ROOT_PATH||'';
const workspaceRootLabel=process.env.BS3A_WORKSPACE_ROOT_LABEL||workspaceRootId;
const processStateDir=process.env.BS3B3_PROCESS_STATE_DIR||'';
const canaryEnabled=process.env.BS3B3_ENABLE_PROCESS_CANARY==='1';
const canaryProject=process.env.BS3B3_CANARY_PROJECT||'';
const canaryExecutable=process.env.BS3B3_CANARY_EXECUTABLE||'';
const shortKey=process.env.BS3B3_CANARY_SHORT_KEY||'';
const longKey=process.env.BS3B3_CANARY_LONG_KEY||'';
const shortArgv=['-e',"process.stdout.write('BS3B3_OAUTH_SHORT_OK\\n')"];
const longArgv=['-e',"process.stdout.write('BS3B3_OAUTH_LONG_READY\\n');setInterval(()=>{},1000)"];
if(!/^sb_publishable_[A-Za-z0-9_-]{16,}$/.test(publishableKey))throw Error('BS3B3_PUBLISHABLE_KEY_REQUIRED');
if(!Number.isInteger(port)||port<1024||port>65535||!/^https:\/\/[^/]+$/.test(publicOrigin)||
   !/^https:\/\/[^/]+\.supabase\.co$/.test(supabaseUrl))throw Error('BS3B3_PUBLIC_CONFIG_INVALID');
if(!nodeIdentityPath.startsWith('/')||!mappingStateDir.startsWith('/')||!workspaceRootPath.startsWith('/')||
   !processStateDir.startsWith('/')||!/^[a-z0-9][a-z0-9._-]{0,63}$/.test(workspaceRootId))
  throw Error('BS3B3_LOCAL_CONFIG_INVALID');
if(canaryEnabled&&(!/^[a-z0-9][a-z0-9._-]{0,63}$/.test(canaryProject)||!canaryExecutable.startsWith('/')||
   !UUID.test(shortKey)||!UUID.test(longKey)||shortKey===longKey))throw Error('BS3B3_CANARY_CONFIG_INVALID');

const nodeIdentity=loadRuntimeNodeIdentity(nodeIdentityPath);
const mappingFile=join(mappingStateDir,'workspace-mappings.json');
const workspaceRegistry=new LocalWorkspaceRegistry({stateDir:mappingStateDir,nodeId:nodeIdentity.nodeId,
  initialize:!existsSync(mappingFile),workspaceRoots:[{workspaceRootId,path:workspaceRootPath,label:workspaceRootLabel}]});
const brokerStateExists=existsSync(join(processStateDir,'state.json'))||existsSync(join(processStateDir,'seal.key'));
const processBroker=new BusinessDurableProcessBroker(processStateDir,{initialize:!brokerStateExists});
const processes=new DurableHostProcesses(processBroker);
const bindingExists=existsSync(join(processStateDir,'business-process-bindings.json'))||
  existsSync(join(processStateDir,'business-process-bindings.key'));
const processRegistry=new BusinessProcessRegistry({stateDir:processStateDir,initialize:!bindingExists});

const issuer=`${supabaseUrl}/auth/v1`;
const jwks=createRemoteJWKSet(new URL(`${issuer}/.well-known/jwks.json`));
const resource=`${publicOrigin}/mcp`,metadataUrl=`${publicOrigin}/.well-known/oauth-protected-resource`;
const oauthScopes=['openid','email','profile'];
const dbBackedReads=['member_get_profile','runtime_list_nodes','continuity_get_context','continuity_prepare_handoff','continuity_search_history'];
const dbBackedMutations=['runtime_map_project','runtime_unmap_project'];
const processEffectTools=canaryEnabled?['process_start_host','process_get_status','process_read_output','process_terminate_job']:[];
const json=(res,status,data,headers={})=>{res.writeHead(status,{'content-type':'application/json','cache-control':'no-store',...headers});res.end(JSON.stringify(data));};
const challenge=()=>`Bearer resource_metadata="${metadataUrl}", error="invalid_token", error_description="OAuth login required"`;
const bearer=req=>{const h=req.headers.authorization||'';return /^Bearer\s+(.+)$/i.exec(h)?.[1]||null;};
async function verify(req){
  const token=bearer(req);if(!token)throw Error('AUTH_REQUIRED');
  const options={issuer};if(expectedAudience)options.audience=expectedAudience;
  const {payload}=await jwtVerify(token,jwks,options);
  if(typeof payload.sub!=='string'||!payload.sub)throw Error('AUTH_SUB_REQUIRED');
  return payload;
}
const descriptor=t=>({name:t.name,title:t.title,description:t.description,inputSchema:toOpenAiWireInputSchema(t),
  ...(t.outputSchema?{outputSchema:z.toJSONSchema(t.outputSchema)}:{}),annotations:t.annotations,securitySchemes:t.securitySchemes,_meta:t._meta});
const result=value=>({content:[{type:'text',text:JSON.stringify(value)}],structuredContent:value});
const sameArgv=(a,b)=>Array.isArray(a)&&a.length===b.length&&a.every((x,i)=>x===b[i]);
function assertCanaryStart(args){
  const short=sameArgv(args?.argv,shortArgv)&&args?.idempotencyKey===shortKey&&args?.timeoutMs===15000;
  const long=sameArgv(args?.argv,longArgv)&&args?.idempotencyKey===longKey&&args?.timeoutMs===120000;
  if(!canaryEnabled||args?.projectId!==canaryProject||args?.executable!==canaryExecutable||args?.cwd!=='.'||
     (args?.runtimeNodeId!==undefined&&args.runtimeNodeId!==nodeIdentity.nodeId)||(!short&&!long))
    throw Error('BS3B3_PROCESS_CANARY_SCOPE_DENIED');
}
function mergeRuntimeList(raw,{projectId=null}={}){
  const mappings=workspaceRegistry.listMappings(),roots=workspaceRegistry.listWorkspaceRoots();
  let nodes=raw.nodes.map(node=>node.nodeId===nodeIdentity.nodeId?{...node,
    mappedProjects:mappings.map(x=>({projectId:x.projectId,mappingRevision:x.mappingRevision,workspaceRootId:x.workspaceRootId})),workspaceRoots:roots}:node);
  if(projectId)nodes=nodes.filter(node=>(node.mappedProjects??[]).some(x=>x.projectId===projectId));
  return {count:nodes.length,nodes};
}
function buildMcp(identity,accessToken){
  const authSession=createBusinessContinuityRpcSession({supabaseUrl,publishableKey,accessToken});
  const continuity=new SupabaseBusinessContinuityStore({authSession});
  const runtimeRegistry=new BusinessRuntimeRegistry({authSession});
  const authorizeProject=async({projectId})=>{await continuity.projectContext({projectId,limit:1});return {projectId,authorized:true};};
  const mappingService=new BusinessRuntimeMappingService({workspaceRegistry,runtimeRegistry,authorizeProject:async projectId=>authorizeProject({projectId})});
  const processService=new BusinessHostProcessService({processes,processBroker,registry:processRegistry,authorizeProject,
    async loadRoutes({projectId}){
      const mapping=workspaceRegistry.resolveProject(projectId),node=await runtimeRegistry.status(nodeIdentity.nodeId);
      return {routes:[{node,mapping,session:node.leaseExpiresAt?{sessionState:'ACTIVE',leaseExpiresAt:node.leaseExpiresAt}:null}],controlReachable:true};
    }});
  const mcp=new McpServer({name:'chatagent-business-v1.1-bs3b3-live-fixture',version:'0.0.0-bs3b3'});
  for(const t of candidateTools){
    const config={title:t.title,description:t.description,inputSchema:t.inputSchema,annotations:t.annotations,_meta:t._meta};
    if(t.outputSchema)config.outputSchema=t.outputSchema;
    mcp.registerTool(t.name,config,async(args)=>{
      if(t.name==='member_get_profile')return result(await fetchBusinessMemberProfile({supabaseUrl,publishableKey,accessToken}));
      if(t.name==='runtime_list_nodes')return result(mergeRuntimeList(await fetchBusinessRuntimeList({supabaseUrl,publishableKey,accessToken,limit:args?.limit??50}),{projectId:args?.projectId??null}));
      if(t.name==='runtime_map_project')return result(await mappingService.mapProject(args));
      if(t.name==='runtime_unmap_project')return result(await mappingService.unmapProject(args));
      if(t.name==='continuity_get_context')return result(await continuity.getContext(args));
      if(t.name==='continuity_prepare_handoff')return result(await continuity.prepareHandoff(args));
      if(t.name==='continuity_search_history')return result(await continuity.historySearch(args));
      if(t.name==='process_start_host'&&canaryEnabled){assertCanaryStart(args);return result(await processService.startHost({authenticatedMemberKey:identity.sub,...args}));}
      if(t.name==='process_get_status'&&canaryEnabled)return result(await processService.getStatus({authenticatedMemberKey:identity.sub,...args}));
      if(t.name==='process_read_output'&&canaryEnabled)return result(await processService.readOutput({authenticatedMemberKey:identity.sub,...args}));
      if(t.name==='process_terminate_job'&&canaryEnabled)return result(await processService.terminateJob({authenticatedMemberKey:identity.sub,...args}));
      return {content:[{type:'text',text:JSON.stringify({probe:true,noEffect:true,tool:t.name,argumentKeys:Object.keys(args||{}).sort()})}]};
    });
  }
  mcp.server.setRequestHandler(ListToolsRequestSchema,()=>({tools:candidateTools.map(descriptor)}));return mcp;
}
const server=http.createServer(async(req,res)=>{
  if(req.method==='GET'&&(req.url==='/.well-known/oauth-protected-resource'||req.url==='/.well-known/oauth-protected-resource/mcp'))
    return json(res,200,{resource,authorization_servers:[issuer],scopes_supported:oauthScopes,bearer_methods_supported:['header']});
  if(req.method==='GET'&&req.url==='/healthz')return json(res,200,{status:'live',fixture:true,processCanaryEnabled:canaryEnabled,
    dbBackedReads,dbBackedMutations,processEffectTools,nodeName:nodeIdentity.nodeName,workspaceRoots:workspaceRegistry.listWorkspaceRoots(),
    mappingCount:workspaceRegistry.listMappings().length,processBindingCount:processRegistry.snapshot().length});
  if(req.url!=='/mcp'||req.method!=='POST')return json(res,404,{error:'NOT_FOUND'});
  let identity;try{identity=await verify(req);}catch{return json(res,401,{error:'UNAUTHORIZED'},{'www-authenticate':challenge()});}
  let body;try{body=(await boundedJSONBody(req,{maxBytes:350000,oversizeCode:'BODY_LIMIT'})).body;}catch(e){return json(res,e.message==='BODY_LIMIT'?413:400,{error:e.message});}
  const mcp=buildMcp(identity,bearer(req)),transport=new StreamableHTTPServerTransport({sessionIdGenerator:undefined,enableJsonResponse:true});
  try{await mcp.connect(transport);await transport.handleRequest(req,res,body);}catch{if(!res.headersSent)json(res,500,{error:'BS3B3_FIXTURE_INTERNAL'});}finally{try{await mcp.close();}catch{}}
});
server.listen(port,'127.0.0.1',()=>console.log(JSON.stringify({event:'bs3b3_live_fixture_started',port,issuer,resource,
  processCanaryEnabled:canaryEnabled,dbBackedReads,dbBackedMutations,processEffectTools,mappingCount:workspaceRegistry.listMappings().length,
  processBindingCount:processRegistry.snapshot().length})));
