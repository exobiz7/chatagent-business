import http from 'node:http';
import {createHash} from 'node:crypto';
import {createRemoteJWKSet,jwtVerify} from 'jose';
import {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js';
import {StreamableHTTPServerTransport} from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import {ListToolsRequestSchema} from '@modelcontextprotocol/sdk/types.js';
import {z} from 'zod';
import {boundedJSONBody} from '../../l1/bounded-json-body.mjs';
import {candidateTools} from './bs0-tool-catalog.mjs';

const port=Number(process.env.BS0_FIXTURE_PORT||31860);
const publicOrigin=(process.env.BS0_PUBLIC_ORIGIN||'').replace(/\/$/,'');
const supabaseUrl=(process.env.BS0_SUPABASE_URL||'').replace(/\/$/,'');
const expectedAudience=process.env.BS0_EXPECTED_AUDIENCE||null;
const organizationId=process.env.BS0_ORGANIZATION_ID||'bs0';
if(!Number.isInteger(port)||port<1024||port>65535)throw Error('BS0_PORT_INVALID');
if(!/^https:\/\/[^/]+$/.test(publicOrigin))throw Error('BS0_PUBLIC_ORIGIN_REQUIRED');
if(!/^https:\/\/[^/]+\.supabase\.co$/.test(supabaseUrl))throw Error('BS0_SUPABASE_URL_REQUIRED');
const issuer=`${supabaseUrl}/auth/v1`;
const jwks=createRemoteJWKSet(new URL(`${issuer}/.well-known/jwks.json`));
const resource=`${publicOrigin}/mcp`;
const metadataUrl=`${publicOrigin}/.well-known/oauth-protected-resource`;
const oauthScopes=['openid','email','profile'];

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
const profileFrom=payload=>{
  const id='prf_'+createHash('sha256').update(`${organizationId}\0${payload.sub}`).digest('hex').slice(0,32);
  return {id,...(typeof payload.email==='string'?{email:payload.email}:{}),...(typeof payload.user_metadata?.name==='string'?{name:payload.user_metadata.name}:{}),nickname:'ChatAgent Business B-S0'};
};
const descriptor=t=>({
  name:t.name,title:t.title,description:t.description,inputSchema:z.toJSONSchema(t.inputSchema),
  ...(t.outputSchema?{outputSchema:z.toJSONSchema(t.outputSchema)}:{}),annotations:t.annotations,
  securitySchemes:t.securitySchemes,_meta:t._meta
});
function buildMcp(identity){
  const mcp=new McpServer({name:'chatagent-business-v1.1-bs0-live-fixture',version:'0.0.0-bs0'});
  for(const t of candidateTools){
    const config={title:t.title,description:t.description,inputSchema:t.inputSchema,annotations:t.annotations,_meta:t._meta};
    if(t.outputSchema)config.outputSchema=t.outputSchema;
    mcp.registerTool(t.name,config,async(args)=>{
      if(t.name==='member_get_profile'){
        const profile=profileFrom(identity);
        return {content:[{type:'text',text:JSON.stringify(profile)}],structuredContent:profile};
      }
      return {content:[{type:'text',text:JSON.stringify({probe:true,noEffect:true,tool:t.name,argumentKeys:Object.keys(args||{}).sort()})}]};
    });
  }
  // OpenAI extension adapter: preserve canonical top-level securitySchemes on the wire.
  mcp.server.setRequestHandler(ListToolsRequestSchema,()=>({tools:candidateTools.map(descriptor)}));
  return mcp;
}

const server=http.createServer(async(req,res)=>{
  if(req.method==='GET'&&(req.url==='/.well-known/oauth-protected-resource'||req.url==='/.well-known/oauth-protected-resource/mcp')){
    return json(res,200,{resource,authorization_servers:[issuer],scopes_supported:oauthScopes,bearer_methods_supported:['header']});
  }
  if(req.method==='GET'&&req.url==='/healthz')return json(res,200,{status:'live',fixture:true,noEffect:true});
  if(req.url!=='/mcp'||req.method!=='POST')return json(res,404,{error:'NOT_FOUND'});
  let identity;
  try{identity=await verify(req);}catch{return json(res,401,{error:'UNAUTHORIZED'},{'www-authenticate':challenge()});}
  let body;try{body=(await boundedJSONBody(req,{maxBytes:350000,oversizeCode:'BODY_LIMIT'})).body;}catch(e){return json(res,e.message==='BODY_LIMIT'?413:400,{error:e.message});}
  const mcp=buildMcp(identity);
  const transport=new StreamableHTTPServerTransport({sessionIdGenerator:undefined,enableJsonResponse:true});
  try{await mcp.connect(transport);await transport.handleRequest(req,res,body);}catch(e){if(!res.headersSent)json(res,500,{error:'BS0_FIXTURE_INTERNAL'});}finally{try{await mcp.close();}catch{}}
});
server.listen(port,'127.0.0.1',()=>console.log(JSON.stringify({event:'bs0_live_fixture_started',port,issuer,resource,noEffect:true})));
