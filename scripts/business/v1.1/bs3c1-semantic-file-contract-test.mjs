import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {candidateTools} from './bs0-tool-catalog.mjs';

const here=fileURLToPath(new URL('.',import.meta.url));
const read=name=>readFileSync(new URL(name,import.meta.url),'utf8');
const service=read('./runtime/business-semantic-file-service.mjs');
const audit=read('./runtime/business-local-effect-audit.mjs');
const wrappers=read('./runtime/business-native-path-effects.mjs');
const move=read('./native/native-move-excl.c');
const del=read('./native/native-delete-bounded.c');
const names=['fs_list_directory','fs_get_path_info','fs_read_file','fs_get_file_hash','fs_create_directory','fs_create_file','fs_replace_file','fs_patch_file','fs_move_path','fs_delete_path'];
const tools=new Map(candidateTools.filter(x=>names.includes(x.name)).map(x=>[x.name,x]));
assert.equal(tools.size,names.length);
for(const name of names){
  const t=tools.get(name);assert.equal(t.localEffect,true,`${name} must remain a local semantic effect`);
  assert.equal(t.powerTool,false,`${name} must not become a power tool`);
  assert.equal(t.annotations.openWorldHint,false,`${name} must remain closed-world`);
}
for(const name of ['fs_list_directory','fs_get_path_info','fs_read_file','fs_get_file_hash'])
  assert.equal(tools.get(name).annotations.readOnlyHint,true);
for(const name of ['fs_create_directory','fs_create_file','fs_move_path'])
  assert.equal(tools.get(name).annotations.destructiveHint,false);
for(const name of ['fs_replace_file','fs_patch_file','fs_delete_path'])
  assert.equal(tools.get(name).annotations.destructiveHint,true);
assert.match(tools.get('fs_create_file').description,/never overwrites/i);
assert.match(tools.get('fs_replace_file').description,/expectedSha256/i);
assert.match(tools.get('fs_delete_path').description,/does not recursively delete/i);
assert.equal(tools.get('fs_delete_path').inputSchema.shape.expectedKind.options.includes('empty_directory'),true);
assert.match(candidateTools.find(x=>x.name==='process_start_host').description,/Prefer focused filesystem\/Git tools/i);

assert.match(service,/resolveBusinessRuntimeRoute/);
assert.match(service,/BusinessFileOps/);
assert.match(service,/projectProfile/);
assert.match(service,/BUSINESS_PROFILE_DENIED/);
assert.match(service,/BusinessLocalEffectAudit|audit\.append/);
assert.doesNotMatch(service,/spawn\(|exec\(|process_start_host/,'semantic file service must not tunnel file work through host exec');
assert.match(move,/RENAME_EXCL/);
assert.match(move,/RENAME_NOFOLLOW_ANY/);
assert.match(move,/MOVE_DESTINATION_EXISTS/);
assert.match(move,/MOVE_PRECONDITION_MISMATCH/);
assert.match(del,/AT_REMOVEDIR/);
assert.match(del,/DELETE_PRECONDITION_REQUIRED/);
assert.match(del,/DELETE_DIRECTORY_NOT_EMPTY/);
assert.doesNotMatch(del,/FTS_PHYSICAL|nftw\(|system\(.*rm|exec.*rm/i,'bounded delete must not gain recursive traversal or shell deletion');
assert.match(wrappers,/BUSINESS_MOVE_UNCERTAIN/);
assert.match(wrappers,/BUSINESS_DELETE_UNCERTAIN/);
assert.match(audit,/createHmac\('sha256'/);
assert.match(audit,/actorDigest/);
assert.match(audit,/prevMac/);
assert.doesNotMatch(audit,/content|oldText|newText|argv/i,'local audit schema must not persist content or command payloads');

console.log('PASS canonical 10-tool filesystem surface and risk annotations remain truthful');
console.log('PASS semantic file service reuses mapped routing + v1 safe file primitives rather than host exec');
console.log('PASS move is descriptor-bound destination-exclusive and delete is SHA/empty-dir bounded non-recursive');
console.log('PASS local effect audit is owner-private HMAC chained and content-free by contract');
console.log('BUSINESS_S3C1_SEMANTIC_FILE_CONTRACT=PASS');
