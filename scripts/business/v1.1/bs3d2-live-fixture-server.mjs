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
import {loadBusinessPublishableRuntimeConfig} from './runtime/publishable-runtime-config.mjs';
import {BusinessSemanticFileService} from './runtime/business-semantic-file-service.mjs';
import {BusinessSemanticGitService} from './runtime/business-semantic-git-service.mjs';
import {BusinessLocalEffectAudit} from './runtime/business-local-effect-audit.mjs';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PROJECT=/^[a-z0-9][a-z0-9._-]{0,63}$/;
const SHA=/^[a-f0-9]{64}$/;
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
const auditStateDir=process.env.BS3D2_AUDIT_STATE_DIR||'';
const canaryEnabled=process.env.BS3D2_ENABLE_GIT_CANARY==='1';
const canaryProject=process.env.BS3D2_CANARY_PROJECT||'';
const cloneDirectory=process.env.BS3D2_CLONE_DIRECTORY||'';
const repositoryUrl=process.env.BS3D2_REPOSITORY_URL||'';
const branchName=process.env.BS3D2_BRANCH_NAME||'';
const canaryFile=process.env.BS3D2_CANARY_FILE||'';
const canaryContent=process.env.BS3D2_CANARY_CONTENT||'';
const commitMessage=process.env.BS3D2_COMMIT_MESSAGE||'';
const prTitle=process.env.BS3D2_PR_TITLE||'';
const prBody=process.env.BS3D2_PR_BODY||'';
const mapOperationId=process.env.BS3D2_MAP_OPERATION_ID||'';
const unmapOperationId=process.env.BS3D2_UNMAP_OPERATION_ID||'';
const gitBinary=process.env.BS3D2_GIT_BIN||'/usr/bin/git';
const githubBinary=process.env.BS3D2_GH_BIN||'/opt/homebrew/bin/gh';
const nativeConfig={
  nativeCreateBinary:process.env.BS3D2_NATIVE_CREATE_BIN||'',nativeCreateSha256:process.env.BS3D2_NATIVE_CREATE_SHA256||'',
  nativeReplaceBinary:process.env.BS3D2_NATIVE_REPLACE_BIN||'',nativeReplaceSha256:process.env.BS3D2_NATIVE_REPLACE_SHA256||'',
  nativeMkdirBinary:process.env.BS3D2_NATIVE_MKDIR_BIN||'',nativeMkdirSha256:process.env.BS3D2_NATIVE_MKDIR_SHA256||'',
  nativeMoveBinary:process.env.BS3D2_NATIVE_MOVE_BIN||'',nativeMoveSha256:process.env.BS3D2_NATIVE_MOVE_SHA256||'',
  nativeDeleteBinary:process.env.BS3D2_NATIVE_DELETE_BIN||'',nativeDeleteSha256:process.env.BS3D2_NATIVE_DELETE_SHA256||''
};
const gitTools=['git_get_status','git_get_diff','git_get_history','git_list_branches','git_create_branch','git_switch_branch','git_stage_files','git_create_commit','git_clone_repository','git_fetch_remote','git_pull_ff_only','git_push_branch','github_create_pull_request'];
const gitHandlers={git_get_status:'getStatus',git_get_diff:'getDiff',git_get_history:'getHistory',git_list_branches:'listBranches',git_create_branch:'createBranch',git_switch_branch:'switchBranch',git_stage_files:'stageFiles',git_create_commit:'createCommit',git_clone_repository:'cloneRepository',git_fetch_remote:'fetchRemote',git_pull_ff_only:'pullFfOnly',git_push_branch:'pushBranch',github_create_pull_request:'createPullRequest'};

if(!/^sb_publishable_[A-Za-z0-9_-]{16,}$/.test(publishableKey))throw Error('BS3D2_PUBLISHABLE_KEY_REQUIRED');
if(!Number.isInteger(port)||port<1024||port>65535||!/^https:\/\/[^/]+$/.test(publicOrigin)||!/^https:\/\/[^/]+\.supabase\.co$/.test(supabaseUrl))throw Error('BS3D2_PUBLIC_CONFIG_INVALID');
if(!nodeIdentityPath.startsWith('/')||!mappingStateDir.startsWith('/')||!workspaceRootPath.startsWith('/')||!auditStateDir.startsWith('/')||!PROJECT.test(workspaceRootId))throw Error('BS3D2_LOCAL_CONFIG_INVALID');
if(canaryEnabled&&(!PROJECT.test(canaryProject)||!cloneDirectory||cloneDirectory.includes('/')||!repositoryUrl.startsWith('https://github.com/')||!branchName||!canaryFile||canaryFile.includes('/')||!canaryContent||!commitMessage||!prTitle||!UUID.test(mapOperationId)||!UUID.test(unmapOperationId)||mapOperationId===unmapOperationId))throw Error('BS3D2_CANARY_CONFIG_INVALID');
for(const [key,value] of Object.entries(nativeConfig))if(typeof value!=='string'||!value)throw Error(`BS3D2_NATIVE_CONFIG_REQUIRED_${key}`);

const nodeIdentity=loadRuntimeNodeIdentity(nodeIdentityPath);
const mappingFile=join(mappingStateDir,'workspace-mappings.json');
const workspaceRegistry=new LocalWorkspaceRegistry({stateDir:mappingStateDir,nodeId:nodeIdentity.nodeId,initialize:!existsSync(mappingFile),workspaceRoots:[{workspaceRootId,path:workspaceRootPath,label:workspaceRootLabel}]});
const auditExists=existsSync(join(auditStateDir,'local-effect-audit.jsonl'))||existsSync(join(auditStateDir,'local-effect-audit.key'));
const localAudit=new BusinessLocalEffectAudit({stateDir:auditStateDir,initialize:!auditExists});
const issuer=`${supabaseUrl}/auth/v1`,jwks=createRemoteJWKSet(new URL(`${issuer}/.well-known/jwks.json`));
const resource=`${publicOrigin}/mcp`,metadataUrl=`${publicOrigin}/.well-known/oauth-protected-resource`;
const oauthScopes=['openid','email','profile'];
const dbBackedReads=['member_get_profile','runtime_list_nodes','continuity_get_context','continuity_prepare_handoff','continuity_search_history'];
const dbBackedMutations=canaryEnabled?['runtime_map_project','runtime_unmap_project']:[];
const gitEffectTools=canaryEnabled?[...gitTools]:[];
const fileEffectTools=canaryEnabled?['fs_create_file']:[];
const processEffectTools=[];
const json=(res,status,data,headers={})=>{res.writeHead(status,{'content-type':'application/json','cache-control':'no-store',...headers});res.end(JSON.stringify(data));};
const challenge=()=>`Bearer resource_metadata="${metadataUrl}", error="invalid_token", error_description="OAuth login required"`;
const bearer=req=>{const h=req.headers.authorization||'';return /^Bearer\s+(.+)$/i.exec(h)?.[1]||null;};
async function verify(req){const token=bearer(req);if(!token)throw Error('AUTH_REQUIRED');const options={issuer};if(expectedAudience)options.audience=expectedAudience;const {payload}=await jwtVerify(token,jwks,options);if(typeof payload.sub!=='string'||!payload.sub)throw Error('AUTH_SUB_REQUIRED');return payload;}
const descriptor=t=>({name:t.name,title:t.title,description:t.description,inputSchema:toOpenAiWireInputSchema(t),...(t.outputSchema?{outputSchema:z.toJSONSchema(t.outputSchema)}:{}),annotations:t.annotations,securitySchemes:t.securitySchemes,_meta:t._meta});
const result=value=>({content:[{type:'text',text:JSON.stringify(value)}],structuredContent:value});
const exact=(condition,code='BS3D2_CANARY_SCOPE_DENIED')=>{if(!condition)throw Error(code);};
function assertMap(args){exact(canaryEnabled&&args?.projectId===canaryProject&&args?.runtimeNodeId===nodeIdentity.nodeId&&args?.workspaceRootId===workspaceRootId&&args?.workspaceRelativePath===cloneDirectory&&args?.expectedGitRemoteUrl===repositoryUrl&&args?.operationId===mapOperationId,'BS3D2_MAPPING_SCOPE_DENIED');}
function assertUnmap(args){exact(canaryEnabled&&args?.projectId===canaryProject&&args?.runtimeNodeId===nodeIdentity.nodeId&&Number.isSafeInteger(args?.expectedMappingRevision)&&args.expectedMappingRevision>0&&args?.operationId===unmapOperationId,'BS3D2_MAPPING_SCOPE_DENIED');}
function assertFile(args){exact(canaryEnabled&&args?.projectId===canaryProject&&(args?.runtimeNodeId===undefined||args.runtimeNodeId===nodeIdentity.nodeId)&&args?.relativePath===canaryFile&&args?.content===canaryContent,'BS3D2_FILE_SCOPE_DENIED');}
function assertGit(tool,args){
  exact(canaryEnabled,'BS3D2_GIT_SCOPE_DENIED');
  if(tool==='git_clone_repository')return exact(args?.runtimeNodeId===nodeIdentity.nodeId&&args?.workspaceRootId===workspaceRootId&&args?.repositoryUrl===repositoryUrl&&args?.directoryName===cloneDirectory,'BS3D2_GIT_SCOPE_DENIED');
  exact(args?.projectId===canaryProject&&(args?.runtimeNodeId===undefined||args.runtimeNodeId===nodeIdentity.nodeId),'BS3D2_GIT_SCOPE_DENIED');
  if(tool==='git_get_status')return exact(args?.maxEntries===undefined||args.maxEntries<=50,'BS3D2_GIT_SCOPE_DENIED');
  if(tool==='git_get_diff')return exact(['unstaged','staged','all',undefined].includes(args?.scope)&&(args?.maxBytes===undefined||args.maxBytes<=65536),'BS3D2_GIT_SCOPE_DENIED');
  if(tool==='git_get_history')return exact((args?.relativePath===undefined||args.relativePath===canaryFile)&&(args?.limit===undefined||args.limit<=10),'BS3D2_GIT_SCOPE_DENIED');
  if(tool==='git_list_branches')return exact((args?.limit===undefined||args.limit<=50),'BS3D2_GIT_SCOPE_DENIED');
  if(tool==='git_create_branch')return exact(args?.branchName===branchName&&(args?.startPoint===undefined||args.startPoint==='HEAD'),'BS3D2_GIT_SCOPE_DENIED');
  if(tool==='git_switch_branch')return exact(args?.branchName===branchName,'BS3D2_GIT_SCOPE_DENIED');
  if(tool==='git_stage_files')return exact(Array.isArray(args?.paths)&&args.paths.length===1&&args.paths[0]===canaryFile,'BS3D2_GIT_SCOPE_DENIED');
  if(tool==='git_create_commit')return exact(args?.message===commitMessage&&SHA.test(args?.expectedStagedDiffSha256??''),'BS3D2_GIT_SCOPE_DENIED');
  if(tool==='git_fetch_remote')return exact(args?.remoteName===undefined||args.remoteName==='origin','BS3D2_GIT_SCOPE_DENIED');
  if(tool==='git_pull_ff_only')return;
  if(tool==='git_push_branch')return exact(args?.branchName===branchName&&(args?.remoteName===undefined||args.remoteName==='origin'),'BS3D2_GIT_SCOPE_DENIED');
  if(tool==='github_create_pull_request')return exact(args?.title===prTitle&&args?.body===prBody&&args?.baseBranch==='main'&&args?.headBranch===branchName&&args?.draft===true,'BS3D2_GIT_SCOPE_DENIED');
  throw Error('BS3D2_GIT_SCOPE_DENIED');
}
function mergeRuntimeList(raw,{projectId=null}={}){const mappings=workspaceRegistry.listMappings(),roots=workspaceRegistry.listWorkspaceRoots();let nodes=raw.nodes.map(node=>node.nodeId===nodeIdentity.nodeId?{...node,mappedProjects:mappings.map(x=>({projectId:x.projectId,mappingRevision:x.mappingRevision,workspaceRootId:x.workspaceRootId})),workspaceRoots:roots}:node);if(projectId)nodes=nodes.filter(node=>(node.mappedProjects??[]).some(x=>x.projectId===projectId));return {count:nodes.length,nodes};}
function buildMcp(identity,accessToken){
  const authSession=createBusinessContinuityRpcSession({supabaseUrl,publishableKey,accessToken});
  const continuity=new SupabaseBusinessContinuityStore({authSession});
  const runtimeRegistry=new BusinessRuntimeRegistry({authSession});
  const authorizeProject=async({projectId})=>{const [context,status]=await Promise.all([continuity.projectContext({projectId,limit:1}),authSession.rpc('bc_schema_status',{})]);if(status.error||typeof status.data?.organizationSlug!=='string'||!status.data.organizationSlug)throw Error('BUSINESS_PROJECT_AUTHORIZATION_DENIED');return {projectId,authorized:true,projectProfile:context.projectProfile,organizationId:status.data.organizationSlug};};
  const organization=async()=>{const status=await authSession.rpc('bc_schema_status',{});if(status.error||typeof status.data?.organizationSlug!=='string'||!status.data.organizationSlug)throw Error('BUSINESS_PROJECT_AUTHORIZATION_DENIED');return status.data.organizationSlug;};
  const mappingService=new BusinessRuntimeMappingService({workspaceRegistry,runtimeRegistry,authorizeProject:async projectId=>{const auth=await authorizeProject({projectId});return {projectId:auth.projectId,authorized:true};}});
  const loadRoutes=async({projectId})=>{const mapping=workspaceRegistry.resolveProject(projectId),node=await runtimeRegistry.status(nodeIdentity.nodeId);return {routes:[{node,mapping,session:node.leaseExpiresAt?{sessionState:'ACTIVE',leaseExpiresAt:node.leaseExpiresAt}:null}],controlReachable:true};};
  const gitService=new BusinessSemanticGitService({authorizeProject,loadRoutes,audit:localAudit,gitBinary,githubBinary,githubHosts:['github.com'],authorizeWorkspaceClone:async({runtimeNodeId,workspaceRootId:rootId})=>{exact(runtimeNodeId===nodeIdentity.nodeId&&rootId===workspaceRootId,'BS3D2_GIT_CLONE_SCOPE_DENIED');const [node,organizationId]=await Promise.all([runtimeRegistry.status(runtimeNodeId),organization()]);return {authorized:true,runtimeNodeId,workspaceRootId:rootId,organizationId,workspaceRootPath,node};}});
  const fileService=new BusinessSemanticFileService({authorizeProject,loadRoutes,audit:localAudit,nativeConfig});
  const mcp=new McpServer({name:'chatagent-business-v1.1-bs3d2-live-fixture',version:'0.0.0-bs3d2'});
  for(const t of candidateTools){
    const config={title:t.title,description:t.description,inputSchema:t.inputSchema,annotations:t.annotations,_meta:t._meta};if(t.outputSchema)config.outputSchema=t.outputSchema;
    mcp.registerTool(t.name,config,async(args)=>{
      if(t.name==='member_get_profile')return result(await fetchBusinessMemberProfile({supabaseUrl,publishableKey,accessToken}));
      if(t.name==='runtime_list_nodes')return result(mergeRuntimeList(await fetchBusinessRuntimeList({supabaseUrl,publishableKey,accessToken,limit:args?.limit??50}),{projectId:args?.projectId??null}));
      if(t.name==='runtime_map_project'&&canaryEnabled){assertMap(args);return result(await mappingService.mapProject(args));}
      if(t.name==='runtime_unmap_project'&&canaryEnabled){assertUnmap(args);return result(await mappingService.unmapProject(args));}
      if(t.name==='continuity_get_context')return result(await continuity.getContext(args));
      if(t.name==='continuity_prepare_handoff')return result(await continuity.prepareHandoff(args));
      if(t.name==='continuity_search_history')return result(await continuity.historySearch(args));
      if(t.name==='fs_create_file'&&canaryEnabled){assertFile(args);return result(await fileService.createFile({authenticatedMemberKey:identity.sub,...args}));}
      if(gitTools.includes(t.name)&&canaryEnabled){assertGit(t.name,args);return result(await gitService[gitHandlers[t.name]]({authenticatedMemberKey:identity.sub,...args}));}
      return {content:[{type:'text',text:JSON.stringify({probe:true,noEffect:true,tool:t.name,argumentKeys:Object.keys(args||{}).sort()})}]};
    });
  }
  mcp.server.setRequestHandler(ListToolsRequestSchema,()=>({tools:candidateTools.map(descriptor)}));return mcp;
}
const server=http.createServer(async(req,res)=>{
  if(req.method==='GET'&&(req.url==='/.well-known/oauth-protected-resource'||req.url==='/.well-known/oauth-protected-resource/mcp'))return json(res,200,{resource,authorization_servers:[issuer],scopes_supported:oauthScopes,bearer_methods_supported:['header']});
  if(req.method==='GET'&&req.url==='/healthz')return json(res,200,{status:'live',fixture:true,gitCanaryEnabled:canaryEnabled,dbBackedReads,dbBackedMutations,gitEffectTools,fileEffectTools,processEffectTools,nodeName:nodeIdentity.nodeName,workspaceRoots:workspaceRegistry.listWorkspaceRoots(),mappingCount:workspaceRegistry.listMappings().length,auditRecordCount:localAudit.readRecent(200).length});
  if(req.url!=='/mcp'||req.method!=='POST')return json(res,404,{error:'NOT_FOUND'});
  let identity;try{identity=await verify(req);}catch{return json(res,401,{error:'UNAUTHORIZED'},{'www-authenticate':challenge()});}
  let body;try{body=(await boundedJSONBody(req,{maxBytes:350000,oversizeCode:'BODY_LIMIT'})).body;}catch(e){return json(res,e.message==='BODY_LIMIT'?413:400,{error:e.message});}
  const mcp=buildMcp(identity,bearer(req)),transport=new StreamableHTTPServerTransport({sessionIdGenerator:undefined,enableJsonResponse:true});
  try{await mcp.connect(transport);await transport.handleRequest(req,res,body);}catch{if(!res.headersSent)json(res,500,{error:'BS3D2_FIXTURE_INTERNAL'});}finally{try{await mcp.close();}catch{}}
});
server.listen(port,'127.0.0.1',()=>console.log(JSON.stringify({event:'bs3d2_live_fixture_started',port,issuer,resource,gitCanaryEnabled:canaryEnabled,dbBackedReads,dbBackedMutations,gitEffectTools,fileEffectTools,processEffectTools,mappingCount:workspaceRegistry.listMappings().length,auditRecordCount:localAudit.readRecent(200).length})));
