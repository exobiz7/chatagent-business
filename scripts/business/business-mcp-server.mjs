import http from "node:http";
import {readFileSync} from "node:fs";
import {timingSafeEqual} from "node:crypto";
import {McpServer} from "@modelcontextprotocol/sdk/server/mcp.js";
import {StreamableHTTPServerTransport} from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import {z} from "zod";
import {boundedJSONBody} from "../l1/bounded-json-body.mjs";
import {BusinessRegistry,businessStatus} from "./business-core.mjs";

const state=process.env.CHATAGENT_BUSINESS_STATE_DIR;
const authFile=process.env.CHATAGENT_BUSINESS_AUTH_FILE;
if(!state||!authFile)throw Error("BUSINESS_MCP_CONFIG_REQUIRED");
const registry=new BusinessRegistry(state);
const expected=readFileSync(authFile,"utf8").trim();
if(!/^[A-Za-z0-9_-]{43,256}$/.test(expected))throw Error("BUSINESS_AUTH_INVALID");
const port=Number(process.env.CHATAGENT_BUSINESS_PORT||31850);
if(!Number.isInteger(port)||port<1024||port>65535)throw Error("BUSINESS_PORT_INVALID");

const equal=(a,b)=>{
 const x=Buffer.from(typeof a==="string"?a:""),y=Buffer.from(b);
 return x.length===y.length&&timingSafeEqual(x,y);
};
const forbiddenAuthorityHeader=req=>[
 "x-chatagent-business-profile","x-chatagent-profile","x-chatagent-authority","x-chatagent-mode"
].some(h=>req.headers[h]!==undefined);
const jsonError=(res,status,message,id=null)=>{
 res.writeHead(status,{"content-type":"application/json","cache-control":"no-store"});
 res.end(JSON.stringify({jsonrpc:"2.0",id,error:{code:-32000,message}}));
};
const text=data=>({content:[{type:"text",text:JSON.stringify(data)}],structuredContent:data});

const server=http.createServer(async(req,res)=>{
 if(req.url==="/health"&&req.method==="GET"){
  res.writeHead(200,{"content-type":"application/json","cache-control":"no-store"});
  res.end(JSON.stringify({ready:true,phase:"B1"}));return;
 }
 if(req.url!=="/mcp"||req.method!=="POST")return jsonError(res,404,"NOT_FOUND");
 if(forbiddenAuthorityHeader(req))return jsonError(res,400,"AUTHORITY_INPUT_FORBIDDEN");
 if(!equal(req.headers["x-chatagent-business-credential"],expected))return jsonError(res,401,"UNAUTHORIZED");
 let body;try{body=(await boundedJSONBody(req,{maxBytes:16384,oversizeCode:"BODY_LIMIT"})).body;}
 catch(e){return jsonError(res,e.message==="BODY_LIMIT"?413:400,e.message);}
 const mcp=new McpServer({name:"chatagent-business",version:"0.1.0-dev.0"});
 mcp.registerTool("business_status",{
  description:"Read bounded ChatAgent Business organization, project-profile and runtime readiness status. Never returns host project roots or secrets.",
  inputSchema:z.strictObject({}),
  annotations:{readOnlyHint:true,destructiveHint:false,openWorldHint:false}
 },async()=>text(businessStatus(registry)));
 const transport=new StreamableHTTPServerTransport({sessionIdGenerator:undefined,enableJsonResponse:true});
 try{await mcp.connect(transport);await transport.handleRequest(req,res,body);}
 catch{if(!res.headersSent)jsonError(res,500,"BUSINESS_MCP_INTERNAL",body?.id??null);}
 finally{try{await mcp.close();}catch{}}
});
server.listen(port,"127.0.0.1",()=>console.log(JSON.stringify({event:"business_mcp_started",port,phase:"B1"})));
const stop=()=>server.close();
process.once("SIGTERM",stop);process.once("SIGINT",stop);
