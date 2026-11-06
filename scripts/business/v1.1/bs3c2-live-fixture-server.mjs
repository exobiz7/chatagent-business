import http from 'node:http';
import {existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
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
import {BusinessSemanticFileService} from './runtime/business-semantic-file-service.mjs';
import {BusinessLocalEffectAudit} from './runtime/business-local-effect-audit.mjs';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PROJECT=/^[a-z0-9][a-z0-9._-]{0,63}$/;
const sha=value=>createHash('sha256').update(value).digest('hex');
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
const auditStateDir=process.env.BS3C2_AUDIT_STATE_DIR||'';
const canaryEnabled=process.env.BS3C2_ENABLE_FS_CANARY==='1';
const canaryProject=process.env.BS3C2_CANARY_PROJECT||'';
const canaryWorkspaceRelative=process.env.BS3C2_CANARY_WORKSPACE_RELATIVE||'';
const mapOperationId=process.env.BS3C2_MAP_OPERATION_ID||'';
const unmapOperationId=process.env.BS3C2_UNMAP_OPERATION_ID||'';
const nativeConfig={
  nativeCreateBinary:process.env.BS3C2_NATIVE_CREATE_BIN||'',nativeCreateSha256:process.env.BS3C2_NATIVE_CREATE_SHA256||'',
  nativeReplaceBinary:process.env.BS3C2_NATIVE_REPLACE_BIN||'',nativeReplaceSha256:process.env.BS3C2_NATIVE_REPLACE_SHA256||'',
  nativeMkdirBinary:process.env.BS3C2_NATIVE_MKDIR_BIN||'',nativeMkdirSha256:process.env.BS3C2_NATIVE_MKDIR_SHA256||'',
  nativeMoveBinary:process.env.BS3C2_NATIVE_MOVE_BIN||'',nativeMoveSha256:process.env.BS3C2_NATIVE_MOVE_SHA256||'',
  nativeDeleteBinary:process.env.BS3C2_NATIVE_DELETE_BIN||'',nativeDeleteSha256:process.env.BS3C2_NATIVE_DELETE_SHA256||''
};
const canaryDir='semantic-canary',sourcePath=`${canaryDir}/source.txt`,movedPath=`${canaryDir}/moved.txt`;
const createContent='BS3C2_CREATE_V1\n',replaceContent='BS3C2_REPLACE_V2\n',patchedContent='BS3C2_PATCHED_V2\n';
const createSha=sha(createContent),replaceSha=sha(replaceContent),patchedSha=sha(patchedContent);
const fsTools=['fs_list_directory','fs_get_path_info','fs_read_file','fs_get_file_hash','fs_create_directory','fs_create_file','fs_replace_file','fs_patch_file','fs_move_path','fs_delete_path'];

if(!/^sb_publishable_[A-Za-z0-9_-]{16,}$/.test(publishableKey))throw Error('BS3C2_PUBLISHABLE_KEY_REQUIRED');
if(!Number.isInteger(port)||port<1024||port>65535||!/^https:\/\/[^/]+$/.test(publicOrigin)||!/^https:\/\/[^/]+\.supabase\.co$/.test(supabaseUrl))
  throw Error('BS3C2_PUBLIC_CONFIG_INVALID');
if(!nodeIdentityPath.startsWith('/')||!mappingStateDir.startsWith('/')||!workspaceRootPath.startsWith('/')||!auditStateDir.startsWith('/')||
   !PROJECT.test(workspaceRootId))throw Error('BS3C2_LOCAL_CONFIG_INVALID');
if(canaryEnabled&&(!PROJECT.test(canaryProject)||!canaryWorkspaceRelative||canaryWorkspaceRelative.includes('/')||
   !UUID.test(mapOperationId)||!UUID.test(unmapOperationId)||mapOperationId===unmapOperationId))throw Error('BS3C2_CANARY_CONFIG_INVALID');
for(const [key,value] of Object.entries(nativeConfig))if(typeof value!=='string'||!value)throw Error(`BS3C2_NATIVE_CONFIG_REQUIRED_${key}`);

const nodeIdentity=loadRuntimeNodeIdentity(nodeIdentityPath);
const mappingFile=join(mappingStateDir,'workspace-mappings.json');
const workspaceRegistry=new LocalWorkspaceRegistry({stateDir:mappingStateDir,nodeId:nodeIdentity.nodeId,
  initialize:!existsSync(mappingFile),workspaceRoots:[{workspaceRootId,path:workspaceRootPath,label:workspaceRootLabel}]});
const auditExists=existsSync(join(auditStateDir,'local-effect-audit.jsonl'))||existsSync(join(auditStateDir,'local-effect-audit.key'));
const localAudit=new BusinessLocalEffectAudit({stateDir:auditStateDir,initialize:!auditExists});
const issuer=`${supabaseUrl}/auth/v1`,jwks=createRemoteJWKSet(new URL(`${issuer}/.well-known/jwks.json`));
const resource=`${publicOrigin}/mcp`,metadataUrl=`${publicOrigin}/.well-known/oauth-protected-resource`;
const oauthScopes=['openid','email','profile'];
const dbBackedReads=['member_get_profile','runtime_list_nodes','continuity_get_context','continuity_prepare_handoff','continuity_search_history'];
const dbBackedMutations=canaryEnabled?['runtime_map_project','runtime_unmap_project']:[];
const fileEffectTools=canaryEnabled?[...fsTools]:[];
const processEffectTools=[];
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
function assertRuntimeNode(args){if(args?.runtimeNodeId!==undefined&&args.runtimeNodeId!==nodeIdentity.nodeId)throw Error('BS3C2_FS_CANARY_SCOPE_DENIED');}
function assertMapCanary(args){
  if(!canaryEnabled||args?.projectId!==canaryProject||args?.runtimeNodeId!==nodeIdentity.nodeId||args?.workspaceRootId!==workspaceRootId||
     args?.workspaceRelativePath!==canaryWorkspaceRelative||args?.operationId!==mapOperationId||args?.expectedGitRemoteUrl!==undefined)
    throw Error('BS3C2_MAPPING_CANARY_SCOPE_DENIED');
}
function assertUnmapCanary(args){
  if(!canaryEnabled||args?.projectId!==canaryProject||args?.runtimeNodeId!==nodeIdentity.nodeId||args?.operationId!==unmapOperationId||
     !Number.isSafeInteger(args?.expectedMappingRevision)||args.expectedMappingRevision<1)throw Error('BS3C2_MAPPING_CANARY_SCOPE_DENIED');
}
function assertFsCanary(tool,args){
  if(!canaryEnabled||args?.projectId!==canaryProject)throw Error('BS3C2_FS_CANARY_SCOPE_DENIED');
  assertRuntimeNode(args);
  const exact=(condition)=>{if(!condition)throw Error('BS3C2_FS_CANARY_SCOPE_DENIED');};
  if(tool==='fs_list_directory')return exact(args.relativePath===undefined||args.relativePath===''||args.relativePath===canaryDir);
  if(tool==='fs_get_path_info')return exact([sourcePath,movedPath].includes(args.relativePath));
  if(tool==='fs_read_file')return exact(args.relativePath===movedPath&&(args.offset===undefined||args.offset===0)&&(args.maxBytes===undefined||args.maxBytes<=65536));
  if(tool==='fs_get_file_hash')return exact([sourcePath,movedPath].includes(args.relativePath));
  if(tool==='fs_create_directory')return exact(args.relativePath===canaryDir);
  if(tool==='fs_create_file')return exact(args.relativePath===sourcePath&&args.content===createContent);
  if(tool==='fs_replace_file')return exact(args.relativePath===sourcePath&&args.content===replaceContent&&args.expectedSha256===createSha);
  if(tool==='fs_patch_file')return exact(args.relativePath===sourcePath&&args.expectedSha256===replaceSha&&args.oldText==='REPLACE'&&args.newText==='PATCHED'&&
    (args.expectedOccurrences===undefined||args.expectedOccurrences===1));
  if(tool==='fs_move_path')return exact(args.sourceRelativePath===sourcePath&&args.destinationRelativePath===movedPath&&args.expectedSourceSha256===patchedSha);
  if(tool==='fs_delete_path')return exact(
    (args.relativePath===movedPath&&args.expectedKind==='regular_file'&&args.expectedSha256===patchedSha)||
    (args.relativePath===canaryDir&&args.expectedKind==='empty_directory'&&args.expectedSha256===undefined));
  throw Error('BS3C2_FS_CANARY_SCOPE_DENIED');
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
  const authorizeProject=async({projectId})=>{
    const [context,status]=await Promise.all([continuity.projectContext({projectId,limit:1}),authSession.rpc('bc_schema_status',{})]);
    if(status.error||typeof status.data?.organizationSlug!=='string'||!status.data.organizationSlug)throw Error('BUSINESS_PROJECT_AUTHORIZATION_DENIED');
    return {projectId,authorized:true,projectProfile:context.projectProfile,organizationId:status.data.organizationSlug};
  };
  const mappingService=new BusinessRuntimeMappingService({workspaceRegistry,runtimeRegistry,
    authorizeProject:async projectId=>{const auth=await authorizeProject({projectId});return {projectId:auth.projectId,authorized:true};}});
  const fileService=new BusinessSemanticFileService({authorizeProject,localAudit,audit:localAudit,nativeConfig,
    async loadRoutes({projectId}){
      const mapping=workspaceRegistry.resolveProject(projectId),node=await runtimeRegistry.status(nodeIdentity.nodeId);
      return {routes:[{node,mapping,session:node.leaseExpiresAt?{sessionState:'ACTIVE',leaseExpiresAt:node.leaseExpiresAt}:null}],controlReachable:true};
    }});
  const handlers={
    fs_list_directory:'listDirectory',fs_get_path_info:'getPathInfo',fs_read_file:'readFile',fs_get_file_hash:'getFileHash',
    fs_create_directory:'createDirectory',fs_create_file:'createFile',fs_replace_file:'replaceFile',fs_patch_file:'patchFile',
    fs_move_path:'movePath',fs_delete_path:'deletePath'
  };
  const mcp=new McpServer({name:'chatagent-business-v1.1-bs3c2-live-fixture',version:'0.0.0-bs3c2'});
  for(const t of candidateTools){
    const config={title:t.title,description:t.description,inputSchema:t.inputSchema,annotations:t.annotations,_meta:t._meta};
    if(t.outputSchema)config.outputSchema=t.outputSchema;
    mcp.registerTool(t.name,config,async(args)=>{
      if(t.name==='member_get_profile')return result(await fetchBusinessMemberProfile({supabaseUrl,publishableKey,accessToken}));
      if(t.name==='runtime_list_nodes')return result(mergeRuntimeList(await fetchBusinessRuntimeList({supabaseUrl,publishableKey,accessToken,limit:args?.limit??50}),{projectId:args?.projectId??null}));
      if(t.name==='runtime_map_project'&&canaryEnabled){assertMapCanary(args);return result(await mappingService.mapProject(args));}
      if(t.name==='runtime_unmap_project'&&canaryEnabled){assertUnmapCanary(args);return result(await mappingService.unmapProject(args));}
      if(t.name==='continuity_get_context')return result(await continuity.getContext(args));
      if(t.name==='continuity_prepare_handoff')return result(await continuity.prepareHandoff(args));
      if(t.name==='continuity_search_history')return result(await continuity.historySearch(args));
      if(fsTools.includes(t.name)&&canaryEnabled){assertFsCanary(t.name,args);return result(await fileService[handlers[t.name]]({authenticatedMemberKey:identity.sub,...args}));}
      return {content:[{type:'text',text:JSON.stringify({probe:true,noEffect:true,tool:t.name,argumentKeys:Object.keys(args||{}).sort()})}]};
    });
  }
  mcp.server.setRequestHandler(ListToolsRequestSchema,()=>({tools:candidateTools.map(descriptor)}));return mcp;
}
const server=http.createServer(async(req,res)=>{
  if(req.method==='GET'&&(req.url==='/.well-known/oauth-protected-resource'||req.url==='/.well-known/oauth-protected-resource/mcp'))
    return json(res,200,{resource,authorization_servers:[issuer],scopes_supported:oauthScopes,bearer_methods_supported:['header']});
  if(req.method==='GET'&&req.url==='/healthz')return json(res,200,{status:'live',fixture:true,fileCanaryEnabled:canaryEnabled,
    dbBackedReads,dbBackedMutations,fileEffectTools,processEffectTools,nodeName:nodeIdentity.nodeName,
    workspaceRoots:workspaceRegistry.listWorkspaceRoots(),mappingCount:workspaceRegistry.listMappings().length,auditRecordCount:localAudit.readRecent(200).length});
  if(req.url!=='/mcp'||req.method!=='POST')return json(res,404,{error:'NOT_FOUND'});
  let identity;try{identity=await verify(req);}catch{return json(res,401,{error:'UNAUTHORIZED'},{'www-authenticate':challenge()});}
  let body;try{body=(await boundedJSONBody(req,{maxBytes:350000,oversizeCode:'BODY_LIMIT'})).body;}catch(e){return json(res,e.message==='BODY_LIMIT'?413:400,{error:e.message});}
  const mcp=buildMcp(identity,bearer(req)),transport=new StreamableHTTPServerTransport({sessionIdGenerator:undefined,enableJsonResponse:true});
  try{await mcp.connect(transport);await transport.handleRequest(req,res,body);}catch{if(!res.headersSent)json(res,500,{error:'BS3C2_FIXTURE_INTERNAL'});}finally{try{await mcp.close();}catch{}}
});
server.listen(port,'127.0.0.1',()=>console.log(JSON.stringify({event:'bs3c2_live_fixture_started',port,issuer,resource,fileCanaryEnabled:canaryEnabled,
  dbBackedReads,dbBackedMutations,fileEffectTools,processEffectTools,mappingCount:workspaceRegistry.listMappings().length,auditRecordCount:localAudit.readRecent(200).length})));
