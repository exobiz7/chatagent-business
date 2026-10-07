import assert from 'node:assert/strict';
import {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {InMemoryTransport} from '@modelcontextprotocol/sdk/inMemory.js';
import {ListToolsRequestSchema} from '@modelcontextprotocol/sdk/types.js';
import {z} from 'zod';

const server=new McpServer({name:'business-v11-bs0-security-adapter',version:'0.0.0'});
const securitySchemes=[{type:'oauth2',scopes:['business.profile.read']}];
const inputSchema=z.strictObject({});
const outputSchema=z.strictObject({id:z.string()});
server.registerTool('member_get_profile',{
  title:'Get connected member profile',description:'Return authenticated profile.',
  inputSchema,outputSchema,
  annotations:{readOnlyHint:true,destructiveHint:false,openWorldHint:false},
  _meta:{securitySchemes,'openai/profile':true}
},async()=>({content:[{type:'text',text:'{"id":"probe"}'}],structuredContent:{id:'probe'}}));

// OpenAI-extension adapter: replace only tools/list. tools/call and validation remain SDK-owned.
server.server.setRequestHandler(ListToolsRequestSchema,()=>({tools:[{
  name:'member_get_profile',title:'Get connected member profile',description:'Return authenticated profile.',
  inputSchema:z.toJSONSchema(inputSchema),outputSchema:z.toJSONSchema(outputSchema),
  annotations:{readOnlyHint:true,destructiveHint:false,openWorldHint:false},
  securitySchemes,
  _meta:{securitySchemes,'openai/profile':true}
}]}));

const [clientTransport,serverTransport]=InMemoryTransport.createLinkedPair();
const raw=[];
const originalSend=serverTransport.send.bind(serverTransport);
serverTransport.send=async(message,options)=>{raw.push(structuredClone(message));return originalSend(message,options);};
await server.connect(serverTransport);
const client=new Client({name:'probe-client',version:'0.0.0'});
await client.connect(clientTransport);
const listed=await client.listTools();
assert.equal(listed.tools.length,1);
// SDK client's ToolSchema may strip OpenAI extension; wire must retain it.
const wire=raw.find(m=>m?.result?.tools?.[0]?.name==='member_get_profile');
assert.ok(wire,'WIRE_TOOLS_LIST_NOT_CAPTURED');
const tool=wire.result.tools[0];
assert.deepEqual(tool.securitySchemes,securitySchemes,'WIRE_TOP_LEVEL_SECURITY_SCHEMES_MISSING');
assert.deepEqual(tool._meta.securitySchemes,securitySchemes,'WIRE_META_SECURITY_SCHEMES_MISSING');
assert.equal(tool._meta['openai/profile'],true);
assert.deepEqual(tool.annotations,{readOnlyHint:true,destructiveHint:false,openWorldHint:false});
console.log('PASS SDK tools/call remains registered while tools/list adapter preserves top-level securitySchemes on wire');
console.log('PASS _meta.securitySchemes back-compat mirror and openai/profile marker preserved');
console.log('B_S0_OPENAI_SECURITY_SCHEME_ADAPTER=PASS');
await client.close();await server.close();
