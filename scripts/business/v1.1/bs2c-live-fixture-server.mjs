import http from 'node:http';
import {createRemoteJWKSet,jwtVerify} from 'jose';
import {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js';
import {StreamableHTTPServerTransport} from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import {ListToolsRequestSchema} from '@modelcontextprotocol/sdk/types.js';
import {z} from 'zod';
import {boundedJSONBody} from '../../l1/bounded-json-body.mjs';
import {candidateTools,toOpenAiWireInputSchema} from './bs0-tool-catalog.mjs';
import {fetchBusinessMemberProfile} from './control/business-member-profile-rpc.mjs';
import {fetchBusinessRuntimeList} from './control/business-runtime-list-rpc.mjs';
import {createBusinessContinuityRpcSession} from './continuity/business-continuity-rpc-session.mjs';
import {SupabaseBusinessContinuityStore} from './continuity/supabase-business-continuity-store.mjs';

const port=Number(process.env.BS0_FIXTURE_PORT||31860);
const publicOrigin=(process.env.BS0_PUBLIC_ORIGIN||'').replace(/\/$/,'');
const supabaseUrl=(process.env.BS0_SUPABASE_URL||'').replace(/\/$/,'');
const expectedAudience=process.env.BS0_EXPECTED_AUDIENCE||null;
const publishableKey=process.env.BS0_SUPABASE_PUBLISHABLE_KEY||'';
if(!/^sb_publishable_[A-Za-z0-9_-]{16,}$/.test(publishableKey))throw Error('BS2C_PUBLISHABLE_KEY_REQUIRED');
if(!Number.isInteger(port)||port<1024||port>65535)throw Error('BS2C_PORT_INVALID');
if(!/^https:\/\/[^/]+$/.test(publicOrigin))throw Error('BS2C_PUBLIC_ORIGIN_REQUIRED');
if(!/^https:\/\/[^/]+\.supabase\.co$/.test(supabaseUrl))throw Error('BS2C_SUPABASE_URL_REQUIRED');
const issuer=`${supabaseUrl}/auth/v1`;
const jwks=createRemoteJWKSet(new URL(`${issuer}/.well-known/jwks.json`));
const resource=`${publicOrigin}/mcp`;
const metadataUrl=`${publicOrigin}/.well-known/oauth-protected-resource`;
const oauthScopes=['openid','email','profile'];
const dbBackedTools=['member_get_profile','runtime_list_nodes','continuity_get_context','continuity_prepare_handoff','continuity_search_history'];

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
function buildMcp(accessToken){
  const authSession=createBusinessContinuityRpcSession({supabaseUrl,publishableKey,accessToken});
  const continuity=new SupabaseBusinessContinuityStore({authSession});
  const mcp=new McpServer({name:'chatagent-business-v1.1-bs2c-live-fixture',version:'0.0.0-bs2c'});
  for(const t of candidateTools){
    const config={title:t.title,description:t.description,inputSchema:t.inputSchema,annotations:t.annotations,_meta:t._meta};
    if(t.outputSchema)config.outputSchema=t.outputSchema;
    mcp.registerTool(t.name,config,async(args)=>{
      if(t.name==='member_get_profile')return result(await fetchBusinessMemberProfile({supabaseUrl,publishableKey,accessToken}));
      if(t.name==='runtime_list_nodes'){
        if(args?.projectId)throw Error('BS1C_PROJECT_FILTER_DEFERRED');
        return result(await fetchBusinessRuntimeList({supabaseUrl,publishableKey,accessToken,limit:args?.limit??50}));
      }
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
  if(req.method==='GET'&&req.url==='/healthz')return json(res,200,{status:'live',fixture:true,noEffectMutations:true,dbBackedTools});
  if(req.url!=='/mcp'||req.method!=='POST')return json(res,404,{error:'NOT_FOUND'});
  try{await verify(req);}catch{return json(res,401,{error:'UNAUTHORIZED'},{'www-authenticate':challenge()});}
  let body;try{body=(await boundedJSONBody(req,{maxBytes:350000,oversizeCode:'BODY_LIMIT'})).body;}catch(e){return json(res,e.message==='BODY_LIMIT'?413:400,{error:e.message});}
  const mcp=buildMcp(bearer(req));
  const transport=new StreamableHTTPServerTransport({sessionIdGenerator:undefined,enableJsonResponse:true});
  try{await mcp.connect(transport);await transport.handleRequest(req,res,body);}catch{if(!res.headersSent)json(res,500,{error:'BS2C_FIXTURE_INTERNAL'});}finally{try{await mcp.close();}catch{}}
});
server.listen(port,'127.0.0.1',()=>console.log(JSON.stringify({event:'bs2c_live_fixture_started',port,issuer,resource,noEffectMutations:true,dbBackedTools})));
