import http from 'node:http';
import {existsSync} from 'node:fs';
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

const port=Number(process.env.BS0_FIXTURE_PORT||31860);
const publicOrigin=(process.env.BS0_PUBLIC_ORIGIN||'').replace(/\/$/,'');
const supabaseUrl=(process.env.BS0_SUPABASE_URL||'').replace(/\/$/,'');
const expectedAudience=process.env.BS0_EXPECTED_AUDIENCE||null;
const publishableKey=process.env.BS0_SUPABASE_PUBLISHABLE_KEY||'';
const nodeIdentityPath=process.env.BS3A_NODE_IDENTITY_PATH||'';
const mappingStateDir=process.env.BS3A_MAPPING_STATE_DIR||'';
const workspaceRootId=process.env.BS3A_WORKSPACE_ROOT_ID||'';
const workspaceRootPath=process.env.BS3A_WORKSPACE_ROOT_PATH||'';
const workspaceRootLabel=process.env.BS3A_WORKSPACE_ROOT_LABEL||workspaceRootId;
if(!/^sb_publishable_[A-Za-z0-9_-]{16,}$/.test(publishableKey))throw Error('BS3A_PUBLISHABLE_KEY_REQUIRED');
if(!Number.isInteger(port)||port<1024||port>65535)throw Error('BS3A_PORT_INVALID');
if(!/^https:\/\/[^/]+$/.test(publicOrigin))throw Error('BS3A_PUBLIC_ORIGIN_REQUIRED');
if(!/^https:\/\/[^/]+\.supabase\.co$/.test(supabaseUrl))throw Error('BS3A_SUPABASE_URL_REQUIRED');
if(!nodeIdentityPath.startsWith('/')||!mappingStateDir.startsWith('/')||!workspaceRootPath.startsWith('/')||
   !/^[a-z0-9][a-z0-9._-]{0,63}$/.test(workspaceRootId))throw Error('BS3A_LOCAL_CONFIG_INVALID');
const nodeIdentity=loadRuntimeNodeIdentity(nodeIdentityPath);
const mappingFile=join(mappingStateDir,'workspace-mappings.json');
const workspaceRegistry=new LocalWorkspaceRegistry({
  stateDir:mappingStateDir,nodeId:nodeIdentity.nodeId,initialize:!existsSync(mappingFile),
  workspaceRoots:[{workspaceRootId,path:workspaceRootPath,label:workspaceRootLabel}]
});
const issuer=`${supabaseUrl}/auth/v1`;
const jwks=createRemoteJWKSet(new URL(`${issuer}/.well-known/jwks.json`));
const resource=`${publicOrigin}/mcp`;
const metadataUrl=`${publicOrigin}/.well-known/oauth-protected-resource`;
const oauthScopes=['openid','email','profile'];
const dbBackedReads=['member_get_profile','runtime_list_nodes','continuity_get_context','continuity_prepare_handoff','continuity_search_history'];
const dbBackedMutations=['runtime_map_project','runtime_unmap_project'];

const json=(res,status,data,headers={})=>{res.writeHead(status,{'content-type':'application/json','cache-control':'no-store',...headers});res.end(JSON.stringify(data));};
const challenge=()=>`Bearer resource_metadata="${metadataUrl}", error="invalid_token", error_description="OAuth login required"`;
const bearer=req=>{const h=req.headers.authorization||'';const m=/^Bearer\s+(.+)$/i.exec(h);return m?.[1]||null;};
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

function mergeRuntimeList(raw,{projectId=null}={}){
  const mappings=workspaceRegistry.listMappings();
  const roots=workspaceRegistry.listWorkspaceRoots();
  let nodes=raw.nodes.map(node=>node.nodeId===nodeIdentity.nodeId?{
    ...node,
    mappedProjects:mappings.map(x=>({projectId:x.projectId,mappingRevision:x.mappingRevision,workspaceRootId:x.workspaceRootId})),
    workspaceRoots:roots
  }:node);
  if(projectId)nodes=nodes.filter(node=>(node.mappedProjects??[]).some(x=>x.projectId===projectId));
  return {count:nodes.length,nodes};
}

function buildMcp(accessToken){
  const authSession=createBusinessContinuityRpcSession({supabaseUrl,publishableKey,accessToken});
  const continuity=new SupabaseBusinessContinuityStore({authSession});
  const runtimeRegistry=new BusinessRuntimeRegistry({authSession});
  const mappingService=new BusinessRuntimeMappingService({
    workspaceRegistry,runtimeRegistry,
    async authorizeProject(projectId){await continuity.projectContext({projectId,limit:1});return {projectId,authorized:true};}
  });
  const mcp=new McpServer({name:'chatagent-business-v1.1-bs3a-live-fixture',version:'0.0.0-bs3a'});
  for(const t of candidateTools){
    const config={title:t.title,description:t.description,inputSchema:t.inputSchema,annotations:t.annotations,_meta:t._meta};
    if(t.outputSchema)config.outputSchema=t.outputSchema;
    mcp.registerTool(t.name,config,async(args)=>{
      if(t.name==='member_get_profile')return result(await fetchBusinessMemberProfile({supabaseUrl,publishableKey,accessToken}));
      if(t.name==='runtime_list_nodes'){
        const raw=await fetchBusinessRuntimeList({supabaseUrl,publishableKey,accessToken,limit:args?.limit??50});
        return result(mergeRuntimeList(raw,{projectId:args?.projectId??null}));
      }
      if(t.name==='runtime_map_project')return result(await mappingService.mapProject(args));
      if(t.name==='runtime_unmap_project')return result(await mappingService.unmapProject(args));
      if(t.name==='continuity_get_context')return result(await continuity.getContext(args));
      if(t.name==='continuity_prepare_handoff')return result(await continuity.prepareHandoff(args));
      if(t.name==='continuity_search_history')return result(await continuity.historySearch(args));
      return {content:[{type:'text',text:JSON.stringify({probe:true,noEffect:true,tool:t.name,argumentKeys:Object.keys(args||{}).sort()})}]};
    });
  }
  mcp.server.setRequestHandler(ListToolsRequestSchema,()=>({tools:candidateTools.map(descriptor)}));
  return mcp;
}

const server=http.createServer(async(req,res)=>{
  if(req.method==='GET'&&(req.url==='/.well-known/oauth-protected-resource'||req.url==='/.well-known/oauth-protected-resource/mcp'))
    return json(res,200,{resource,authorization_servers:[issuer],scopes_supported:oauthScopes,bearer_methods_supported:['header']});
  if(req.method==='GET'&&req.url==='/healthz')return json(res,200,{status:'live',fixture:true,dbBackedReads,dbBackedMutations,
    nodeName:nodeIdentity.nodeName,workspaceRoots:workspaceRegistry.listWorkspaceRoots(),mappingCount:workspaceRegistry.listMappings().length});
  if(req.url!=='/mcp'||req.method!=='POST')return json(res,404,{error:'NOT_FOUND'});
  try{await verify(req);}catch{return json(res,401,{error:'UNAUTHORIZED'},{'www-authenticate':challenge()});}
  let body;try{body=(await boundedJSONBody(req,{maxBytes:350000,oversizeCode:'BODY_LIMIT'})).body;}catch(e){return json(res,e.message==='BODY_LIMIT'?413:400,{error:e.message});}
  const mcp=buildMcp(bearer(req));
  const transport=new StreamableHTTPServerTransport({sessionIdGenerator:undefined,enableJsonResponse:true});
  try{await mcp.connect(transport);await transport.handleRequest(req,res,body);}catch{if(!res.headersSent)json(res,500,{error:'BS3A_FIXTURE_INTERNAL'});}finally{try{await mcp.close();}catch{}}
});
server.listen(port,'127.0.0.1',()=>console.log(JSON.stringify({event:'bs3a_live_fixture_started',port,issuer,resource,
  nodeName:nodeIdentity.nodeName,dbBackedReads,dbBackedMutations,mappingCount:workspaceRegistry.listMappings().length})));
