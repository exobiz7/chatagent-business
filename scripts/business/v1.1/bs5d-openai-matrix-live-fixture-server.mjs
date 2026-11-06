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
import {BusinessRuntimeRegistry} from './control/business-runtime-registry.mjs';
import {loadRuntimeNodeIdentity} from './control/runtime-node-identity.mjs';
import {createBusinessContinuityRpcSession} from './continuity/business-continuity-rpc-session.mjs';
import {SupabaseBusinessContinuityStore} from './continuity/supabase-business-continuity-store.mjs';
import {LocalWorkspaceRegistry} from './runtime/local-workspace-registry.mjs';
import {loadBusinessPublishableRuntimeConfig} from './runtime/publishable-runtime-config.mjs';
import {BusinessSemanticFileService} from './runtime/business-semantic-file-service.mjs';
import {BusinessSemanticGitService} from './runtime/business-semantic-git-service.mjs';
import {BusinessLocalEffectAudit} from './runtime/business-local-effect-audit.mjs';
import {BusinessDurableProcessBroker} from './runtime/business-durable-process-broker.mjs';
import {BusinessProcessRegistry} from './runtime/business-process-registry.mjs';
import {BusinessHostProcessService} from './runtime/business-host-process-service.mjs';
import {BusinessIsolatedProcessRegistry} from './runtime/business-isolated-process-registry.mjs';
import {BusinessIsolatedProcessService} from './runtime/business-isolated-process-service.mjs';
import {BusinessProcessService} from './runtime/business-process-service.mjs';
import {settleBs3g1IsolatedCanary} from './runtime/bs3g1-isolated-canary-settle.mjs';
import {DurableHostProcesses} from '../../l1/durable-host-processes.mjs';
import {BusinessExecManager} from '../business-exec.mjs';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SHA=/^[a-f0-9]{64}$/;
const PROJECT=/^[a-z0-9][a-z0-9._-]{0,63}$/;
const fail=code=>{throw Error(code);};
const port=Number(process.env.BS0_FIXTURE_PORT||31860),publicOrigin=String(process.env.BS0_PUBLIC_ORIGIN||'').replace(/\/$/,'');
const publicConfig=loadBusinessPublishableRuntimeConfig(process.env.BS3A_PUBLIC_CONFIG_PATH||'');
const supabaseUrl=publicConfig.url,publishableKey=publicConfig.publishableKey;
const nodeIdentity=loadRuntimeNodeIdentity(process.env.BS3A_NODE_IDENTITY_PATH||'');
const mappingStateDir=process.env.BS3A_MAPPING_STATE_DIR||'',workspaceRootId=process.env.BS3A_WORKSPACE_ROOT_ID||'',workspaceRootPath=process.env.BS3A_WORKSPACE_ROOT_PATH||'';
const stateDir=process.env.BS5D_STATE_DIR||'',canaryEnabled=process.env.BS5D_ENABLE_CANARY==='1';
const projectId=process.env.BS5D_CANARY_PROJECT||'',branchName=process.env.BS5D_BRANCH_NAME||'',gitFile=process.env.BS5D_GIT_FILE||'';
const gitContent=process.env.BS5D_GIT_CONTENT||'',tempFile=process.env.BS5D_TEMP_FILE||'',tempMoved=process.env.BS5D_TEMP_MOVED||'';
const tempBeforeSha=process.env.BS5D_TEMP_BEFORE_SHA||'',tempAfterContent=process.env.BS5D_TEMP_AFTER_CONTENT||'',tempAfterSha=process.env.BS5D_TEMP_AFTER_SHA||'';
const hostDeleteFile=process.env.BS5D_HOST_DELETE_FILE||'',commitMessage=process.env.BS5D_COMMIT_MESSAGE||'',prTitle=process.env.BS5D_PR_TITLE||'',prBody=process.env.BS5D_PR_BODY||'';
const benignIdempotency=process.env.BS5D_HOST_BENIGN_IDEMPOTENCY||'',destructiveIdempotency=process.env.BS5D_HOST_DESTRUCTIVE_IDEMPOTENCY||'';
const benignMarker='BS5D_HOST_BENIGN_OK\n',isolatedCommand="printf 'BS5D_ISOLATED_OK\\n'";
const gitBinary=process.env.BS5D_GIT_BIN||'/usr/bin/git',githubBinary=process.env.BS5D_GH_BIN||'/opt/homebrew/bin/gh';
const nativeConfig={nativeCreateBinary:process.env.BS5D_NATIVE_CREATE_BIN||'',nativeCreateSha256:process.env.BS5D_NATIVE_CREATE_SHA256||'',nativeReplaceBinary:process.env.BS5D_NATIVE_REPLACE_BIN||'',nativeReplaceSha256:process.env.BS5D_NATIVE_REPLACE_SHA256||'',nativeMkdirBinary:process.env.BS5D_NATIVE_MKDIR_BIN||'',nativeMkdirSha256:process.env.BS5D_NATIVE_MKDIR_SHA256||'',nativeMoveBinary:process.env.BS5D_NATIVE_MOVE_BIN||'',nativeMoveSha256:process.env.BS5D_NATIVE_MOVE_SHA256||'',nativeDeleteBinary:process.env.BS5D_NATIVE_DELETE_BIN||'',nativeDeleteSha256:process.env.BS5D_NATIVE_DELETE_SHA256||''};
const dockerBinary=process.env.BS5D_DOCKER_BIN||'',dockerSha256=process.env.BS5D_DOCKER_SHA256||'',imageRef=process.env.BS5D_EXEC_IMAGE_REF||'',imageId=process.env.BS5D_EXEC_IMAGE_ID||'';
if(!Number.isInteger(port)||port<1024||port>65535||!/^https:\/\/[^/]+$/.test(publicOrigin)||!stateDir.startsWith('/')||!workspaceRootPath.startsWith('/'))fail('BS5D_CONFIG_INVALID');
if(canaryEnabled&&(!PROJECT.test(projectId)||!branchName||!gitFile||!gitContent||!tempFile||!tempMoved||!SHA.test(tempBeforeSha)||!tempAfterContent||!SHA.test(tempAfterSha)||!hostDeleteFile||!commitMessage||!prTitle||!UUID.test(benignIdempotency)||!UUID.test(destructiveIdempotency)))fail('BS5D_CANARY_CONFIG_INVALID');
for(const [k,v] of Object.entries(nativeConfig))if(typeof v!=='string'||!v)fail(`BS5D_NATIVE_CONFIG_REQUIRED_${k}`);
const workspaceRegistry=new LocalWorkspaceRegistry({stateDir:mappingStateDir,nodeId:nodeIdentity.nodeId,initialize:false,workspaceRoots:[{workspaceRootId,path:workspaceRootPath,label:workspaceRootId}]});
const auditDir=join(stateDir,'audit'),hostDir=join(stateDir,'host'),isolatedDir=join(stateDir,'isolated');
const audit=new BusinessLocalEffectAudit({stateDir:auditDir,initialize:!existsSync(join(auditDir,'local-effect-audit.key'))});
const hostBroker=new BusinessDurableProcessBroker(hostDir,{initialize:!existsSync(join(hostDir,'state.json'))});
const hostBindings=new BusinessProcessRegistry({stateDir:hostDir,initialize:!existsSync(join(hostDir,'business-process-bindings.key'))});
const hostProcesses=new DurableHostProcesses(hostBroker);
const isolatedBindings=new BusinessIsolatedProcessRegistry({stateDir:isolatedDir,initialize:!existsSync(join(isolatedDir,'business-isolated-process-bindings.key'))});
const arrivals=[];
const issuer=`${supabaseUrl}/auth/v1`,jwks=createRemoteJWKSet(new URL(`${issuer}/.well-known/jwks.json`)),resource=`${publicOrigin}/mcp`,metadataUrl=`${publicOrigin}/.well-known/oauth-protected-resource`;
const json=(res,status,data,headers={})=>{res.writeHead(status,{'content-type':'application/json','cache-control':'no-store',...headers});res.end(JSON.stringify(data));};
const bearer=req=>/^Bearer\s+(.+)$/i.exec(req.headers.authorization||'')?.[1]||null;
async function verify(req){const token=bearer(req);if(!token)fail('AUTH_REQUIRED');const {payload}=await jwtVerify(token,jwks,{issuer});if(typeof payload.sub!=='string'||!payload.sub)fail('AUTH_SUB_REQUIRED');return payload;}
const result=value=>({content:[{type:'text',text:JSON.stringify(value)}],structuredContent:value});
const descriptor=t=>({name:t.name,title:t.title,description:t.description,inputSchema:toOpenAiWireInputSchema(t),...(t.outputSchema?{outputSchema:z.toJSONSchema(t.outputSchema)}:{}),annotations:t.annotations,securitySchemes:t.securitySchemes,_meta:t._meta});
const exact=(ok,code='BS5D_SCOPE_DENIED')=>{if(!ok)fail(code);};
const routed=args=>exact(canaryEnabled&&args?.projectId===projectId&&(args.runtimeNodeId===undefined||args.runtimeNodeId===nodeIdentity.nodeId));

function buildMcp(identity,accessToken){
 const authSession=createBusinessContinuityRpcSession({supabaseUrl,publishableKey,accessToken});
 const continuity=new SupabaseBusinessContinuityStore({authSession});
 const runtimeRegistry=new BusinessRuntimeRegistry({authSession});
 const authorizeProject=async({projectId:p})=>{const [context,status]=await Promise.all([continuity.projectContext({projectId:p,limit:1}),authSession.rpc('bc_schema_status',{})]);if(status.error||!status.data?.organizationSlug)fail('BUSINESS_PROJECT_AUTHORIZATION_DENIED');return {projectId:p,authorized:true,projectProfile:context.projectProfile,organizationId:status.data.organizationSlug};};
 const loadRoutes=async({projectId:p})=>{const mapping=workspaceRegistry.resolveProject(p),node=await runtimeRegistry.status(nodeIdentity.nodeId);return {routes:[{node,mapping,session:node.leaseExpiresAt?{sessionState:'ACTIVE',leaseExpiresAt:node.leaseExpiresAt}:null}],controlReachable:true};};
 const fileService=new BusinessSemanticFileService({authorizeProject,loadRoutes,audit,nativeConfig});
 const gitService=new BusinessSemanticGitService({authorizeProject,loadRoutes,authorizeWorkspaceClone:async()=>{throw Error('BS5D_CLONE_DISABLED');},audit,gitBinary,githubBinary,githubHosts:['github.com']});
 const hostService=new BusinessHostProcessService({processBroker:hostBroker,registry:hostBindings,processes:hostProcesses,authorizeProject,loadRoutes});
 const isolatedService=new BusinessIsolatedProcessService({authorizeProject,loadRoutes,registry:isolatedBindings,audit,execManagerFactory:r=>new BusinessExecManager(r,{dockerBinary,dockerSha256,imageRef,imageId,ownerId:createHash('sha256').update(stateDir+'\0bs5d').digest('hex').slice(0,24),instanceId:randomUUID()})});
 const processService=new BusinessProcessService({hostService,isolatedService});
 const mcp=new McpServer({name:'chatagent-business-v1.1-bs5d-openai-matrix',version:'0.0.0-bs5d'});
 for(const t of candidateTools){const config={title:t.title,description:t.description,inputSchema:t.inputSchema,annotations:t.annotations,_meta:t._meta};if(t.outputSchema)config.outputSchema=t.outputSchema;mcp.registerTool(t.name,config,async(args)=>{arrivals.push(t.name);
  if(t.name==='business_get_status')return result({status:'live',matrixCanaryEnabled:canaryEnabled,projectId,mappingCount:workspaceRegistry.listMappings().length});
  if(t.name==='continuity_get_context'){exact(args?.projectId===projectId);return result(await continuity.getContext(args));}
  if(t.name==='continuity_search_history'){exact(args?.projectId===projectId&&typeof args?.query==='string'&&args.query.length<=128&&(args.limit===undefined||args.limit<=10));return result(await continuity.historySearch(args));}
  if(t.name==='fs_read_file'&&canaryEnabled){routed(args);exact(args?.relativePath==='README.md'&&(args.offset===undefined||args.offset===0)&&(args.maxBytes===undefined||args.maxBytes<=4096));return result(await fileService.readFile({authenticatedMemberKey:identity.sub,...args}));}
  if(t.name==='fs_create_file'&&canaryEnabled){routed(args);exact(args?.relativePath===gitFile&&args?.content===gitContent);return result(await fileService.createFile({authenticatedMemberKey:identity.sub,...args}));}
  if(t.name==='fs_replace_file'&&canaryEnabled){routed(args);exact(args?.relativePath===tempFile&&args?.content===tempAfterContent&&args?.expectedSha256===tempBeforeSha);return result(await fileService.replaceFile({authenticatedMemberKey:identity.sub,...args}));}
  if(t.name==='fs_move_path'&&canaryEnabled){routed(args);exact(args?.sourceRelativePath===tempFile&&args?.destinationRelativePath===tempMoved&&args?.expectedSourceSha256===tempAfterSha);return result(await fileService.movePath({authenticatedMemberKey:identity.sub,...args}));}
  if(t.name==='fs_delete_path'&&canaryEnabled){routed(args);exact(args?.relativePath===tempMoved&&args?.expectedKind==='regular_file'&&args?.expectedSha256===tempAfterSha);return result(await fileService.deletePath({authenticatedMemberKey:identity.sub,...args}));}
  if(t.name==='git_get_status'&&canaryEnabled){routed(args);exact(args?.maxEntries===undefined||args.maxEntries<=50);return result(await gitService.getStatus({authenticatedMemberKey:identity.sub,...args}));}
  if(t.name==='git_get_diff'&&canaryEnabled){routed(args);exact(args?.scope==='staged'&&(args?.maxBytes===undefined||args.maxBytes<=65536));return result(await gitService.getDiff({authenticatedMemberKey:identity.sub,...args}));}
  if(t.name==='git_stage_files'&&canaryEnabled){routed(args);exact(Array.isArray(args?.paths)&&args.paths.length===1&&args.paths[0]===gitFile);return result(await gitService.stageFiles({authenticatedMemberKey:identity.sub,...args}));}
  if(t.name==='git_create_commit'&&canaryEnabled){routed(args);exact(args?.message===commitMessage&&SHA.test(args?.expectedStagedDiffSha256??''));return result(await gitService.createCommit({authenticatedMemberKey:identity.sub,...args}));}
  if(t.name==='git_create_branch'&&canaryEnabled){routed(args);exact(args?.branchName===branchName&&(args?.startPoint===undefined||args.startPoint==='HEAD'));return result(await gitService.createBranch({authenticatedMemberKey:identity.sub,...args}));}
  if(t.name==='git_fetch_remote'&&canaryEnabled){routed(args);exact(args?.remoteName===undefined||args.remoteName==='origin');return result(await gitService.fetchRemote({authenticatedMemberKey:identity.sub,...args}));}
  if(t.name==='git_pull_ff_only'&&canaryEnabled){routed(args);return result(await gitService.pullFfOnly({authenticatedMemberKey:identity.sub,...args}));}
  if(t.name==='git_push_branch'&&canaryEnabled){routed(args);exact(args?.branchName===branchName&&(args?.remoteName===undefined||args.remoteName==='origin'));return result(await gitService.pushBranch({authenticatedMemberKey:identity.sub,...args}));}
  if(t.name==='github_create_pull_request'&&canaryEnabled){routed(args);exact(args?.title===prTitle&&args?.body===prBody&&args?.baseBranch==='main'&&args?.headBranch===branchName&&args?.draft===true);return result(await gitService.createPullRequest({authenticatedMemberKey:identity.sub,...args}));}
  if(t.name==='process_start_host'&&canaryEnabled){routed(args);const benign=args?.executable==='/usr/bin/printf'&&Array.isArray(args.argv)&&args.argv.length===1&&args.argv[0]===benignMarker&&args.cwd==='.'&&args.idempotencyKey===benignIdempotency;const destructive=args?.executable==='/bin/rm'&&Array.isArray(args.argv)&&args.argv.length===2&&args.argv[0]==='--'&&args.argv[1]===hostDeleteFile&&args.cwd==='.'&&args.idempotencyKey===destructiveIdempotency;exact(benign||destructive);return result(await processService.startHost({authenticatedMemberKey:identity.sub,...args,timeoutMs:Math.min(args.timeoutMs??5000,5000)}));}
  if(t.name==='process_start_isolated'&&canaryEnabled){routed(args);exact(args?.command===isolatedCommand&&(args.cwd===undefined||args.cwd==='.')&&(args.timeoutMs===undefined||args.timeoutMs<=15000));await isolatedService.initialize();try{const started=await processService.startIsolated({authenticatedMemberKey:identity.sub,...args,timeoutMs:15000,yieldTimeMs:Math.min(args.yieldTimeMs??5000,5000),maxOutputBytes:Math.min(args.maxOutputBytes??65536,65536)});return result(await settleBs3g1IsolatedCanary({isolated:isolatedService,authenticatedMemberKey:identity.sub,started,marker:'BS5D_ISOLATED_OK'}));}finally{await isolatedService.close();}}
  if(t.name==='process_get_status'&&canaryEnabled)return result(await processService.getStatus({authenticatedMemberKey:identity.sub,...args}));
  if(t.name==='process_read_output'&&canaryEnabled)return result(await processService.readOutput({authenticatedMemberKey:identity.sub,...args,maxBytes:Math.min(args.maxBytes??65536,65536),waitMs:Math.min(args.waitMs??0,5000)}));
  if(t.name==='process_terminate_job'&&canaryEnabled)return result(await processService.terminateJob({authenticatedMemberKey:identity.sub,...args}));
  return {content:[{type:'text',text:JSON.stringify({probe:true,noEffect:true,tool:t.name})}]};
 });}
 mcp.server.setRequestHandler(ListToolsRequestSchema,()=>({tools:candidateTools.map(descriptor)}));return mcp;
}
const server=http.createServer(async(req,res)=>{
 if(req.method==='GET'&&(req.url==='/.well-known/oauth-protected-resource'||req.url==='/.well-known/oauth-protected-resource/mcp'))return json(res,200,{resource,authorization_servers:[issuer],scopes_supported:['openid','email','profile'],bearer_methods_supported:['header']});
 if(req.method==='GET'&&req.url==='/healthz')return json(res,200,{status:'live',fixture:true,matrixCanaryEnabled:canaryEnabled,nodeName:nodeIdentity.nodeName,mappingCount:workspaceRegistry.listMappings().length,auditRecordCount:audit.readRecent(200).length,hostBindingCount:hostBindings.snapshot().length,isolatedBindingCount:isolatedBindings.snapshot().length,arrivalSequence:arrivals.slice(-80)});
 if(req.url!=='/mcp'||req.method!=='POST')return json(res,404,{error:'NOT_FOUND'});
 let identity;try{identity=await verify(req);}catch{return json(res,401,{error:'UNAUTHORIZED'},{'www-authenticate':`Bearer resource_metadata="${metadataUrl}"`});}
 let body;try{body=(await boundedJSONBody(req,{maxBytes:350000,oversizeCode:'BODY_LIMIT'})).body;}catch(e){return json(res,e.message==='BODY_LIMIT'?413:400,{error:e.message});}
 const mcp=buildMcp(identity,bearer(req)),transport=new StreamableHTTPServerTransport({sessionIdGenerator:undefined,enableJsonResponse:true});
 try{await mcp.connect(transport);await transport.handleRequest(req,res,body);}catch(e){if(!res.headersSent)json(res,500,{error:String(e?.message||'BS5D_FIXTURE_INTERNAL')});}finally{try{await mcp.close();}catch{}}
});
async function shutdown(){try{hostProcesses.stopAll();}catch{}server.close(()=>process.exit(0));setTimeout(()=>process.exit(1),2000).unref();}
process.on('SIGTERM',()=>void shutdown());process.on('SIGINT',()=>void shutdown());
server.listen(port,'127.0.0.1',()=>console.log(JSON.stringify({event:'bs5d_openai_matrix_fixture_started',port,matrixCanaryEnabled:canaryEnabled,mappingCount:workspaceRegistry.listMappings().length})));
