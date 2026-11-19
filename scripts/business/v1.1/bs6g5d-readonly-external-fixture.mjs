#!/usr/bin/env node
// B-S6G-5D — one-tool, no-effect, loopback-only pre-publication Gateway.
// This process must not be routed to a public tunnel without separate owner approval.
import http from 'node:http';
import {createRemoteJWKSet,jwtVerify} from 'jose';
import {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js';
import {StreamableHTTPServerTransport} from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import {ListToolsRequestSchema} from '@modelcontextprotocol/sdk/types.js';
import {boundedJSONBody} from '../../l1/bounded-json-body.mjs';
import {candidateTools,toOpenAiWireInputSchema} from './bs0-tool-catalog.mjs';
import {loadBusinessSupabaseConfig} from './control/supabase-runtime-config.mjs';
import {fetchBusinessMemberProfile} from './control/business-member-profile-rpc.mjs';
import {z} from 'zod';

const fail=code=>{throw Error(code);};
const configPath=process.env.BS6G5D_CONFIG_PATH;
const projectRef=process.env.BS6G5D_PROJECT_REF;
const origin=process.env.BS6G5D_PUBLIC_ORIGIN;
const port=Number(process.env.BS6G5D_PORT);
if(typeof projectRef!=='string'||!/^[a-z0-9]{20}$/.test(projectRef)||
   typeof origin!=='string'||!/^https:\/\/[a-zA-Z0-9.-]+(?::[0-9]+)?$/.test(origin)||
   !Number.isSafeInteger(port)||port<1024||port>65535)
   fail('BS6G5D_FIXTURE_ENV_INVALID');
const cfg=loadBusinessSupabaseConfig(configPath);
if(cfg.projectRef!==projectRef||cfg.url!=='https://'+projectRef+'.supabase.co'||
   cfg.expectedSchemaVersion!==1||cfg.keychainService!=='chatagent-business.bs6g5.production.auth')
   fail('BS6G5D_CONFIG_TARGET_MISMATCH');
const issuer=cfg.url+'/auth/v1';
const jwks=createRemoteJWKSet(new URL(issuer+'/.well-known/jwks.json'));
const resource=origin+'/mcp',metadataUrl=origin+'/.well-known/oauth-protected-resource';
const allowed=candidateTools.filter(t=>t.name==='member_get_profile');
if(allowed.length!==1||allowed[0].annotations?.readOnlyHint!==true)
  fail('BS6G5D_READONLY_CATALOG_MISMATCH');
const descriptor=t=>({
  name:t.name,title:t.title,description:t.description,
  inputSchema:toOpenAiWireInputSchema(t),
  ...(t.outputSchema?{outputSchema:z.toJSONSchema(t.outputSchema)}:{}),
  annotations:t.annotations,securitySchemes:t.securitySchemes,_meta:t._meta
});
const respond=(res,code,obj,headers={})=>{
  res.writeHead(code,{'content-type':'application/json','cache-control':'no-store',...headers});
  res.end(JSON.stringify(obj));
};
const bearer=req=>/^Bearer\s+([^\s]+)$/i.exec(req.headers.authorization??'')?.[1]??null;
async function authorized(req){
  const token=bearer(req);
  if(!token)fail('BS6G5D_BEARER_REQUIRED');
  const {payload}=await jwtVerify(token,jwks,{issuer,audience:'authenticated'});
  if(typeof payload.sub!=='string'||!payload.sub||payload.role!=='authenticated'||
     payload.is_anonymous===true)fail('BS6G5D_JWT_ROLE_INVALID');
  return token;
}
function buildMcp(token){
  const mcp=new McpServer({name:'chatagent-business-v11-bs6g5d-readonly',version:'0.0.0-readonly'});
  const t=allowed[0];
  mcp.registerTool(t.name,{
    title:t.title,description:t.description,inputSchema:t.inputSchema,
    annotations:t.annotations,_meta:t._meta,outputSchema:t.outputSchema
  },async()=>{
    const data=await fetchBusinessMemberProfile({
      supabaseUrl:cfg.url,publishableKey:cfg.publishableKey,accessToken:token
    });
    return {content:[{type:'text',text:JSON.stringify(data)}],structuredContent:data};
  });
  mcp.server.setRequestHandler(ListToolsRequestSchema,()=>({tools:allowed.map(descriptor)}));
  return mcp;
}
const server=http.createServer(async(req,res)=>{
  if(req.method==='GET'&&
     (req.url==='/.well-known/oauth-protected-resource'||
      req.url==='/.well-known/oauth-protected-resource/mcp'))
    return respond(res,200,{resource,authorization_servers:[issuer],
      scopes_supported:['openid','email','profile'],bearer_methods_supported:['header']});
  if(req.method==='GET'&&req.url==='/healthz')
    return respond(res,200,{ready:true,fixture:true,noEffect:true,
      toolCount:1,toolNames:['member_get_profile'],published:false});
  if(req.method!=='POST'||req.url!=='/mcp')
    return respond(res,404,{error:'NOT_FOUND'});
  let token;
  try{token=await authorized(req);}
  catch{return respond(res,401,{error:'UNAUTHORIZED'},{
    'www-authenticate':'Bearer resource_metadata="'+metadataUrl+'", error="invalid_token"'
  });}
  let body;
  try{
    body=(await boundedJSONBody(req,{maxBytes:20000,oversizeCode:'BODY_LIMIT'})).body;
  }catch(e){return respond(res,e.message==='BODY_LIMIT'?413:400,{error:'INVALID_REQUEST'});}
  const mcp=buildMcp(token);
  const transport=new StreamableHTTPServerTransport({
    sessionIdGenerator:undefined,enableJsonResponse:true
  });
  try{await mcp.connect(transport);await transport.handleRequest(req,res,body);}
  catch{if(!res.headersSent)respond(res,500,{error:'READONLY_GATEWAY_UNAVAILABLE'});}
  finally{try{await mcp.close();}catch{}}
});
server.listen(port,'127.0.0.1',()=>console.log(JSON.stringify({
  status:'LOCAL_FIXTURE_READY',toolCount:1,noEffect:true,published:false
})));
