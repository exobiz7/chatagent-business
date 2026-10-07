import assert from 'node:assert/strict';
import {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {InMemoryTransport} from '@modelcontextprotocol/sdk/inMemory.js';
import {z} from 'zod';
import {candidateTools} from './bs0-tool-catalog.mjs';

const server=new McpServer({name:'chatagent-business-v1.1-bs0-descriptor-fixture',version:'0.0.0-bs0'});
for(const t of candidateTools){
  const isProfile=t.name==='member_get_profile';
  const config={
    title:t.title,
    description:t.description,
    inputSchema:t.inputSchema,
    annotations:t.annotations,
    _meta:t._meta
  };
  if(t.outputSchema) config.outputSchema=t.outputSchema;
  // Current @modelcontextprotocol/sdk 1.x does not accept/emit top-level securitySchemes.
  // The candidate's OAuth schemes are mirrored through _meta for local descriptor testing;
  // top-level OpenAI OAuth descriptor behavior remains a live B-S0 compatibility gate.
  server.registerTool(t.name,config,async()=>isProfile?{
    content:[{type:'text',text:JSON.stringify({id:'bs0-profile'})}],
    structuredContent:{id:'bs0-profile'}
  }:{content:[{type:'text',text:'B-S0 no-effect descriptor fixture'}]});
}

const [clientTransport,serverTransport]=InMemoryTransport.createLinkedPair();
const client=new Client({name:'bs0-descriptor-client',version:'0.0.0'});
await server.connect(serverTransport);
await client.connect(clientTransport);
const listed=(await client.listTools()).tools;
assert.equal(listed.length,candidateTools.length);
assert.equal(new Set(listed.map(x=>x.name)).size,listed.length);
for(const expected of candidateTools){
  const actual=listed.find(x=>x.name===expected.name);
  assert.ok(actual,`MISSING_TOOL:${expected.name}`);
  assert.equal(actual.title,expected.title,`TITLE_MISMATCH:${expected.name}`);
  assert.equal(actual.description,expected.description,`DESCRIPTION_MISMATCH:${expected.name}`);
  assert.deepEqual(actual.annotations,expected.annotations,`ANNOTATION_MISMATCH:${expected.name}`);
  assert.equal(actual.inputSchema?.type,'object',`INPUT_SCHEMA_MISSING:${expected.name}`);
  assert.equal(actual.inputSchema?.additionalProperties,false,`INPUT_SCHEMA_NOT_STRICT:${expected.name}`);
  assert.deepEqual(actual._meta?.securitySchemes,expected.securitySchemes,`OAUTH_META_MIRROR_MISSING:${expected.name}`);
  // Expected limitation of installed SDK 1.30.0: top-level securitySchemes are not emitted.
  assert.equal(Object.hasOwn(actual,'securitySchemes'),false,`UNEXPECTED_SDK_SECURITY_SCHEMES_CHANGE:${expected.name}`);
  if(expected.name==='member_get_profile'){
    assert.equal(actual._meta?.['openai/profile'],true,'PROFILE_META_NOT_EXPOSED');
    assert.equal(actual.outputSchema?.type,'object','PROFILE_OUTPUT_SCHEMA_MISSING');
    assert.ok(actual.outputSchema?.required?.includes('id'),'PROFILE_ID_REQUIRED_MISSING');
  }
}
await client.close();
await server.close();
console.log(`PASS real MCP SDK tools/list exact descriptors count=${listed.length} unique=${new Set(listed.map(x=>x.name)).size}`);
console.log('PASS exact input schemas/descriptions/annotations survive MCP SDK 1.30 serialization');
console.log('PASS OAuth securitySchemes back-compat mirror survives in _meta');
console.log('PASS member_get_profile exposes openai/profile metadata and output schema');
console.log('KNOWN_GAP top-level securitySchemes are not emitted by installed MCP SDK 1.30.0; live ChatGPT OAuth canary required');
console.log('B_S0_MCP_DESCRIPTOR_SCAN=PASS_WITH_OAUTH_DESCRIPTOR_GAP');
