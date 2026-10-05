#!/bin/sh
set -eu
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT INT TERM
cd "$TMP"
npm init -y >/dev/null 2>&1
npm install --ignore-scripts --no-audit --no-fund \
  @modelcontextprotocol/server@2.3.0 \
  @modelcontextprotocol/client@2.3.0 \
  @modelcontextprotocol/core@2.3.0 \
  @modelcontextprotocol/ext-apps@2.0.3 \
  zod@4.4.3 >/dev/null 2>&1
node --input-type=module <<'JS'
import assert from 'node:assert/strict';
import {McpServer,InMemoryTransport} from '@modelcontextprotocol/server';
import {Client} from '@modelcontextprotocol/client';
import {registerAppTool} from '@modelcontextprotocol/ext-apps/server';
import {z} from 'zod';
const schemes=[{type:'oauth2',scopes:['business.profile.read']}];
const server=new McpServer({name:'bs0-v2-auth-fixture',version:'0'});
registerAppTool(server,'member_get_profile',{
  title:'Get connected Business member profile',
  description:'Return the authenticated Business member profile without modifying state.',
  inputSchema:{},
  outputSchema:{id:z.string()},
  securitySchemes:schemes,
  annotations:{readOnlyHint:true,destructiveHint:false,openWorldHint:false},
  _meta:{securitySchemes:schemes,'openai/profile':true}
},async()=>({structuredContent:{id:'opaque-user'},content:[{type:'text',text:'profile'}]}));
const [clientTransport,serverTransport]=InMemoryTransport.createLinkedPair();
const client=new Client({name:'bs0-v2-client',version:'0'});
await server.connect(serverTransport);await client.connect(clientTransport);
const t=(await client.listTools()).tools[0];
assert.deepEqual(t._meta?.securitySchemes,schemes,'META_SECURITY_SCHEME_MISSING');
assert.equal(t._meta?.['openai/profile'],true,'PROFILE_META_MISSING');
assert.equal(Object.hasOwn(t,'securitySchemes'),false,'TOP_LEVEL_SECURITY_SCHEMES_NOW_PRESENT_REBASE_PROBE');
console.log('PASS MCP server 2.3.0 + ext-apps 2.0.3 preserves _meta.securitySchemes');
console.log('KNOWN_GAP top-level securitySchemes still absent from tools/list');
console.log('B_S0_MCP_V2_SECURITY_SCHEME_PROBE=PASS_EXPECTED_GAP');
await client.close();await server.close();
JS
