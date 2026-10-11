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
import {BusinessExecManager} from '../business-exec.mjs';
import {candidateTools,toOpenAiWireInputSchema} from './bs0-tool-catalog.mjs';
import {fetchBusinessMemberProfile} from './control/business-member-profile-rpc.mjs';
import {fetchBusinessRuntimeList} from './control/business-runtime-list-rpc.mjs';
import {BusinessRuntimeRegistry} from './control/business-runtime-registry.mjs';
import {loadRuntimeNodeIdentity} from './control/runtime-node-identity.mjs';
import {createBusinessContinuityRpcSession} from './continuity/business-continuity-rpc-session.mjs';
import {SupabaseBusinessContinuityStore} from './continuity/supabase-business-continuity-store.mjs';
import {LocalWorkspaceRegistry} from './runtime/local-workspace-registry.mjs';
import {loadBusinessPublishableRuntimeConfig} from './runtime/publishable-runtime-config.mjs';
import {BusinessLocalEffectAudit} from './runtime/business-local-effect-audit.mjs';
import {BusinessIsolatedProcessRegistry} from './runtime/business-isolated-process-registry.mjs';
import {BusinessIsolatedProcessService} from './runtime/business-isolated-process-service.mjs';

const port=Number(process.env.BS0_FIXTURE_PORT||31860);
const publicOrigin=(process.env.BS0_PUBLIC_ORIGIN||'').replace(/\/$/,'');
const publicConfig=loadBusinessPublishableRuntimeConfig(process.env.BS3A_PUBLIC_CONFIG_PATH||'');
const supabaseUrl=publicConfig.url,publishableKey=publicConfig.publishableKey;
const nodeIdentityPath=process.env.BS3A_NODE_IDENTITY_PATH||'';
const mappingStateDir=process.env.BS3A_MAPPING_STATE_DIR||'';
const workspaceRootId=process.env.BS3A_WORKSPACE_ROOT_ID||'';
const workspaceRootPath=process.env.BS3A_WORKSPACE_ROOT_PATH||'';
const stateDir=process.env.BS3G1_STATE_DIR||'';
const canaryEnabled=process.env.BS3G1_ENABLE_CANARY==='1';
const canaryProject=process.env.BS3G1_CANARY_PROJECT||'';
const isolatedCommand="printf 'BS3G1_ISOLATED_OK\\n'";
const dockerBinary=process.env.BS3G1_DOCKER_BIN||'';
const dockerSha256=process.env.BS3G1_DOCKER_SHA256||'';
const imageRef=process.env.BS3G1_EXEC_IMAGE_REF||'';
const imageId=process.env.BS3G1_EXEC_IMAGE_ID||'';
const nodeIdentity=loadRuntimeNodeIdentity(nodeIdentityPath);
const workspaceRegistry=new LocalWorkspaceRegistry({stateDir:mappingStateDir,nodeId:nodeIdentity.nodeId,initialize:false,workspaceRoots:[{workspaceRootId,path:workspaceRootPath,label:workspaceRootId}]});
const auditDir=join(stateDir,'audit'),bindingDir=join(stateDir,'bindings');
const audit=new BusinessLocalEffectAudit({stateDir:auditDir,initialize:!existsSync(join(auditDir,'local-effect-audit.key'))});
const bindings=new BusinessIsolatedProcessRegistry({stateDir:bindingDir,initialize:!existsSync(join(bindingDir,'business-isolated-process-bindings.key'))});
const issuer=`${supabaseUrl}/auth/v1`,jwks=createRemoteJWKSet(new URL(`${issuer}/.well-known/jwks.json`));
const resource=`${publicOrigin}/mcp`,metadataUrl=`${publicOrigin}/.well-known/oauth-protected-resource`;
const arrivals=[];
const json=(res,status,data,headers={})=>{res.writeHead(status,{'content-type':'application/json','cache-control':'no-store',...headers});res.end(JSON.stringify(data));};
const bearer=req=>/^Bearer\s+(.+)$/i.exec(req.headers.authorization||'')?.[1]||null;
async function verify(req){const token=bearer(req);if(!token)throw Error('AUTH_REQUIRED');const {payload}=await jwtVerify(token,jwks,{issuer});if(typeof payload.sub!=='string'||!payload.sub)throw Error('AUTH_SUB_REQUIRED');return payload;}
const result=value=>({content:[{type:'text',text:JSON.stringify(value)}],structuredContent:value});
const descriptor=t=>({name:t.name,title:t.title,description:t.description,inputSchema:toOpenAiWireInputSchema(t),...(t.outputSchema?{outputSchema:z.toJSONSchema(t.outputSchema)}:{}),annotations:t.annotations,securitySchemes:t.securitySchemes,_meta:t._meta});
function mergeRuntimeList(raw,{projectId=null}={}){const mappings=workspaceRegistry.listMappings(),roots=workspaceRegistry.listWorkspaceRoots();let nodes=raw.nodes.map(node=>node.nodeId===nodeIdentity.nodeId?{...node,mappedProjects:mappings.map(x=>({projectId:x.projectId,mappingRevision:x.mappingRevision,workspaceRootId:x.workspaceRootId})),workspaceRoots:roots}:node);if(projectId)nodes=nodes.filter(node=>(node.mappedProjects??[]).some(x=>x.projectId===projectId));return {count:nodes.length,nodes};}
function buildMcp(identity,accessToken){
 const authSession=createBusinessContinuityRpcSession({supabaseUrl,publishableKey,accessToken});
 const continuity=new SupabaseBusinessContinuityStore({authSession});
 const runtimeRegistry=new BusinessRuntimeRegistry({authSession});
 const authorizeProject=async({projectId})=>{const [context,status]=await Promise.all([continuity.projectContext({projectId,limit:1}),authSession.rpc('bc_schema_status',{})]);if(status.error||!status.data?.organizationSlug)throw Error('BUSINESS_PROJECT_AUTHORIZATION_DENIED');return {projectId,authorized:true,projectProfile:context.projectProfile,organizationId:status.data.organizationSlug};};
 const loadRoutes=async({projectId})=>{const mapping=workspaceRegistry.resolveProject(projectId),node=await runtimeRegistry.status(nodeIdentity.nodeId);return {routes:[{node,mapping,session:node.leaseExpiresAt?{sessionState:'ACTIVE',leaseExpiresAt:node.leaseExpiresAt}:null}],controlReachable:true};};
 const isolated=new BusinessIsolatedProcessService({authorizeProject,loadRoutes,registry:bindings,audit,execManagerFactory:r=>new BusinessExecManager(r,{dockerBinary,dockerSha256,imageRef,imageId,ownerId:createHash('sha256').update(stateDir+'\0bs3g1').digest('hex').slice(0,24),instanceId:randomUUID()})});
 const mcp=new McpServer({name:'chatagent-business-v1.1-bs3g1-isolated-live-fixture',version:'0.0.0-bs3g1'});
 for(const t of candidateTools){const config={title:t.title,description:t.description,inputSchema:t.inputSchema,annotations:t.annotations,_meta:t._meta};if(t.outputSchema)config.outputSchema=t.outputSchema;mcp.registerTool(t.name,config,async(args)=>{arrivals.push(t.name);
  if(t.name==='member_get_profile')return result(await fetchBusinessMemberProfile({supabaseUrl,publishableKey,accessToken}));
  if(t.name==='runtime_list_nodes')return result(mergeRuntimeList(await fetchBusinessRuntimeList({supabaseUrl,publishableKey,accessToken,limit:args?.limit??50}),{projectId:args?.projectId??null}));
  if(t.name==='continuity_get_context')return result(await continuity.getContext(args));
  if(t.name==='process_start_isolated'&&canaryEnabled){if(args?.projectId!==canaryProject||(args.runtimeNodeId!==undefined&&args.runtimeNodeId!==nodeIdentity.nodeId)||args?.command!==isolatedCommand||(args.cwd!==undefined&&args.cwd!=='.')||args?.timeoutMs!==15000||args?.yieldTimeMs!==5000||(args.maxOutputBytes!==undefined&&args.maxOutputBytes>65536))throw Error('BS3G1_ISOLATED_SCOPE_DENIED');await isolated.initialize();try{const out=await isolated.startIsolated({authenticatedMemberKey:identity.sub,...args});if(out.state!=='EXITED'||out.exitCode!==0||!out.content.includes('BS3G1_ISOLATED_OK'))throw Error('BS3G1_ISOLATED_RESULT_INVALID');return result(out);}finally{await isolated.close();}}
  return {content:[{type:'text',text:JSON.stringify({probe:true,noEffect:true,tool:t.name})}]};
 });}
 mcp.server.setRequestHandler(ListToolsRequestSchema,()=>({tools:candidateTools.map(descriptor)}));return mcp;
}
const server=http.createServer(async(req,res)=>{
 if(req.method==='GET'&&(req.url==='/.well-known/oauth-protected-resource'||req.url==='/.well-known/oauth-protected-resource/mcp'))return json(res,200,{resource,authorization_servers:[issuer],scopes_supported:['openid','email','profile'],bearer_methods_supported:['header']});
 if(req.method==='GET'&&req.url==='/healthz')return json(res,200,{status:'live',fixture:true,safetyCanaryEnabled:canaryEnabled,processEffectTools:canaryEnabled?['process_start_isolated']:[],nodeName:nodeIdentity.nodeName,workspaceRoots:workspaceRegistry.listWorkspaceRoots(),mappingCount:workspaceRegistry.listMappings().length,auditRecordCount:audit.readRecent(200).length,isolatedBindingCount:bindings.snapshot().length,arrivalSequence:[...arrivals]});
 if(req.url!=='/mcp'||req.method!=='POST')return json(res,404,{error:'NOT_FOUND'});
 let identity;try{identity=await verify(req);}catch{return json(res,401,{error:'UNAUTHORIZED'},{'www-authenticate':`Bearer resource_metadata="${metadataUrl}"`});}
 let body;try{body=(await boundedJSONBody(req,{maxBytes:350000,oversizeCode:'BODY_LIMIT'})).body;}catch(e){return json(res,e.message==='BODY_LIMIT'?413:400,{error:e.message});}
 const mcp=buildMcp(identity,bearer(req)),transport=new StreamableHTTPServerTransport({sessionIdGenerator:undefined,enableJsonResponse:true});
 try{await mcp.connect(transport);await transport.handleRequest(req,res,body);}catch(e){if(!res.headersSent)json(res,500,{error:String(e?.message||'BS3G1_FIXTURE_INTERNAL')});}finally{try{await mcp.close();}catch{}}
});
server.listen(port,'127.0.0.1',()=>console.log(JSON.stringify({event:'bs3g1_isolated_fixture_started',port,safetyCanaryEnabled:canaryEnabled,mappingCount:workspaceRegistry.listMappings().length})));
