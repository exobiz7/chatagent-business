import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname,resolve} from 'node:path';
import {z} from 'zod';
import {candidateTools} from './bs0-tool-catalog.mjs';

const here=dirname(fileURLToPath(import.meta.url));
const root=resolve(here,'../../..');
const design=readFileSync(resolve(root,'docs/approved/CHATAGENT_BUSINESS_V1_1_ACCEPTED_DESIGN_20261005.md'),'utf8');
const manifest=JSON.parse(readFileSync(resolve(root,'docs/verification/v1.1/B_S0_TOOL_CONTRACT_CANDIDATE.json'),'utf8'));
const golden=JSON.parse(readFileSync(resolve(root,'docs/verification/v1.1/B_S0_TOOL_SELECTION_GOLDEN_SET.json'),'utf8'));

const names=candidateTools.map(t=>t.name);
assert.equal(new Set(names).size,names.length,'DUPLICATE_CATALOG_TOOL');
const naming=/^[a-z][a-z0-9]*_[a-z][a-z0-9]*_[a-z][a-z0-9_]*$/;
for(const t of candidateTools){
  assert.match(t.name,naming,`BAD_NAME:${t.name}`);
  assert.ok(typeof t.title==='string'&&t.title.length>=3&&t.title.length<=80,`BAD_TITLE:${t.name}`);
  assert.ok(typeof t.description==='string'&&t.description.length>=40,`DESCRIPTION_TOO_WEAK:${t.name}`);
  assert.equal(t.inputSchema?._def?.type,'object',`INPUT_NOT_STRICT_OBJECT:${t.name}`);
  for(const k of ['readOnlyHint','destructiveHint','openWorldHint']) assert.equal(typeof t.annotations[k],'boolean',`MISSING_ANNOTATION:${t.name}:${k}`);
  assert.ok(Array.isArray(t.securitySchemes)&&t.securitySchemes.length===1,`SECURITY_SCHEME_MISSING:${t.name}`);
  assert.equal(t.securitySchemes[0].type,'oauth2',`SECURITY_SCHEME_TYPE:${t.name}`);
  assert.deepEqual(t._meta.securitySchemes,t.securitySchemes,`SECURITY_META_MIRROR:${t.name}`);
  // Zod v4 JSON Schema conversion is our schema serialization preflight.
  const schema=z.toJSONSchema(t.inputSchema);
  assert.equal(schema.type,'object',`JSON_SCHEMA_NOT_OBJECT:${t.name}`);
  assert.equal(schema.additionalProperties,false,`JSON_SCHEMA_NOT_STRICT:${t.name}`);
}

assert.equal(candidateTools.find(t=>t.name==='member_get_profile')._meta['openai/profile'],true);

const requiredOAuthScopes=['openid','email','profile'];
for(const t of candidateTools){
  assert.deepEqual(t.securitySchemes,[{type:'oauth2',scopes:requiredOAuthScopes}],`OAUTH_SCOPE_MISMATCH:${t.name}`);
}
const profileTool=candidateTools.find(t=>t.name==='member_get_profile');
assert.ok(profileTool.outputSchema,'PROFILE_OUTPUT_SCHEMA_NOT_IN_CATALOG');
const profileOut=z.toJSONSchema(profileTool.outputSchema);
assert.ok((profileOut.required??[]).includes('id'),'PROFILE_OUTPUT_ID_REQUIRED');
assert.deepEqual(candidateTools.filter(t=>t.powerTool).map(t=>t.name),['process_start_host']);
assert.deepEqual(candidateTools.find(t=>t.name==='process_start_host').annotations,{readOnlyHint:false,destructiveHint:true,openWorldHint:true});
assert.match(candidateTools.find(t=>t.name==='process_start_host').description,/Power-tool \/ escape hatch/);
assert.match(candidateTools.find(t=>t.name==='git_clone_repository').description,/does not create or map/i);
assert.match(candidateTools.find(t=>t.name==='fs_create_file').description,/never overwrites/i);
assert.match(candidateTools.find(t=>t.name==='fs_replace_file').description,/expectedSha256/i);

const manifestNames=manifest.tools.map(t=>t.name);
assert.deepEqual(names,manifestNames,'CATALOG_MANIFEST_ORDER_OR_NAME_MISMATCH');
for(const t of candidateTools){
  const m=manifest.tools.find(x=>x.name===t.name);
  assert.deepEqual(t.annotations,m.annotations,`CATALOG_MANIFEST_ANNOTATION_MISMATCH:${t.name}`);
  assert.equal(t.reuse,m.reuse,`CATALOG_MANIFEST_REUSE_MISMATCH:${t.name}`);
}

const inv=design.split('### 14.5 Initial semantic capability inventory — not a fixed-count contract',2)[1].split('### 14.6 Runtime-node selection rule',1)[0];
for(const name of names) assert.match(inv,new RegExp(`^${name}$`,'m'),`DESIGN_MISSING_TOOL:${name}`);
const designNames=[...inv.matchAll(/^([a-z][a-z0-9_]+)$/gm)].map(m=>m[1]);
assert.deepEqual(designNames,names,'DESIGN_CATALOG_ORDER_OR_NAME_MISMATCH');

for(const tc of golden.cases){
  for(const n of [...(tc.expected??[]),...(tc.mustNotUse??[])]) assert.ok(names.includes(n),`GOLDEN_UNKNOWN_TOOL:${tc.id}:${n}`);
}

// Routing schema checks: process follow-up tools intentionally resolve node from the owned process record.
const processFollowups=new Set(['process_get_status','process_read_output','process_terminate_job']);
for(const t of candidateTools.filter(x=>x.localEffect)){
  const schema=z.toJSONSchema(t.inputSchema);
  const props=schema.properties??{};
  if(processFollowups.has(t.name)){
    assert.ok(props.processId,`PROCESS_ID_REQUIRED:${t.name}`);
    continue;
  }
  if(t.name==='git_clone_repository'){
    assert.ok((schema.required??[]).includes('runtimeNodeId'),`CLONE_NODE_REQUIRED:${t.name}`);
    assert.ok((schema.required??[]).includes('workspaceRootId'),`CLONE_ROOT_REQUIRED:${t.name}`);
    assert.ok(!(schema.properties??{}).projectId,`CLONE_MUST_NOT_MAP_PROJECT:${t.name}`);
    continue;
  }
  if(['runtime_map_project','runtime_unmap_project'].includes(t.name)){
    assert.ok((schema.required??[]).includes('runtimeNodeId'),`RUNTIME_MAPPING_NODE_REQUIRED:${t.name}`);
    assert.ok((schema.required??[]).includes('projectId'),`RUNTIME_MAPPING_PROJECT_REQUIRED:${t.name}`);
    continue;
  }
  assert.ok(props.projectId,`LOCAL_PROJECT_ID_MISSING:${t.name}`);
  assert.ok(props.runtimeNodeId,`LOCAL_RUNTIME_NODE_FIELD_MISSING:${t.name}`);
}

console.log(`PASS exact candidate catalog tools=${names.length} with no count constraint`);
console.log('PASS titles/descriptions/naming/annotations/OAuth metadata/schema serialization');
console.log('PASS catalog = manifest = Accepted Design tool inventory');
console.log(`PASS golden-set references all resolve cases=${golden.cases.length}`);
console.log('PASS local-effect routing schema rules including process-record and clone exceptions');
console.log('B_S0_TOOL_CATALOG=PASS');
