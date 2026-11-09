import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {
  chmodSync,existsSync,mkdtempSync,mkdirSync,readFileSync,realpathSync,rmSync,symlinkSync,writeFileSync
} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {BusinessSemanticFileService} from './runtime/business-semantic-file-service.mjs';
import {BusinessLocalEffectAudit} from './runtime/business-local-effect-audit.mjs';

const repo=fileURLToPath(new URL('../../../',import.meta.url));
const l1=join(repo,'scripts/l1');
const business=join(repo,'scripts/business');
const v11=join(business,'v1.1');
const root=realpathSync(mkdtempSync(join(tmpdir(),'chatagent-business-s3c1-')));chmodSync(root,0o700);
const safeRoot=join(root,'safe'),roRoot=join(root,'ro'),sharedRoot=join(root,'shared'),outside=join(root,'outside');
const multiA=join(root,'multi-a'),multiB=join(root,'multi-b'),binDir=join(root,'bin'),auditDir=join(root,'audit'),tamperDir=join(root,'tamper');
for(const p of [safeRoot,roRoot,sharedRoot,outside,multiA,multiB])mkdirSync(p);
for(const p of [binDir,auditDir,tamperDir])mkdirSync(p,{mode:0o700});
const sha=value=>createHash('sha256').update(value).digest('hex');
const fileSha=path=>sha(readFileSync(path));
const log=x=>console.log('PASS '+x);
const reject=async(fn,code)=>{
  try{await fn();assert.fail('expected '+code);}catch(e){if(e?.code==='ERR_ASSERTION')throw e;assert.match(String(e?.message),new RegExp(code));return e;}
};
const compile=(source,target,args=[])=>{
  const r=spawnSync('/usr/bin/clang',['-Wall','-Wextra','-Werror','-O2',...args,source,'-o',target],{encoding:'utf8'});
  assert.equal(r.status,0,r.stderr);chmodSync(target,0o700);return fileSha(target);
};
const bins={
  create:join(binDir,'create'),replace:join(binDir,'replace'),mkdir:join(binDir,'mkdir'),move:join(binDir,'move'),delete:join(binDir,'delete')
};
const nativeConfig={
  nativeCreateBinary:bins.create,nativeCreateSha256:compile(join(l1,'native-create-excl.c'),bins.create),
  nativeReplaceBinary:bins.replace,nativeReplaceSha256:compile(join(l1,'native-replace-cas.c'),bins.replace,['-framework','Security']),
  nativeMkdirBinary:bins.mkdir,nativeMkdirSha256:compile(join(business,'native-mkdir-excl.c'),bins.mkdir),
  nativeMoveBinary:bins.move,nativeMoveSha256:compile(join(v11,'native/native-move-excl.c'),bins.move,['-framework','Security']),
  nativeDeleteBinary:bins.delete,nativeDeleteSha256:compile(join(v11,'native/native-delete-bounded.c'),bins.delete,['-framework','Security'])
};

const memberKey='oauth-subject-s3c1-member';
const personal='10000000-0000-4000-8000-000000000001';
const shared='10000000-0000-4000-8000-000000000002';
const wrong='10000000-0000-4000-8000-000000000003';
const multi2='10000000-0000-4000-8000-000000000004';
const profiles=new Map([
  ['safe','SAFE'],['ro','READ_ONLY'],['shared','SAFE'],['wrong','SAFE'],['expired','SAFE'],['multi','SAFE']
]);
const roots=new Map([
  ['safe',safeRoot],['ro',roRoot],['shared',sharedRoot],['wrong',safeRoot],['expired',safeRoot]
]);
const mapping=(projectId,nodeId,canonicalPath,revision=1)=>({runtimeNodeId:nodeId,projectId,mappingRevision:revision,
  canonicalPath,workspaceRootId:'fixture-root',workspaceRelativePath:projectId});
const node=(nodeId,{nodeType='PERSONAL_NODE',ownedByCaller=true,lifecycle='APPROVED',sharedHostPowerEnabled=false}={})=>({
  nodeId,nodeType,lifecycle,ownedByCaller,sharedHostPowerEnabled
});
const routeEntry=(projectId,nodeId,canonicalPath,nodeOptions={},revision=1,session=null)=>({
  node:node(nodeId,nodeOptions),mapping:mapping(projectId,nodeId,canonicalPath,revision),...(session?{session}:{})
});
const routesFor=projectId=>{
  if(projectId==='shared')return {routes:[routeEntry(projectId,shared,sharedRoot,{nodeType:'SHARED_NODE',ownedByCaller:false,sharedHostPowerEnabled:false})],controlReachable:true};
  if(projectId==='wrong')return {routes:[routeEntry(projectId,wrong,safeRoot,{ownedByCaller:false})],controlReachable:true};
  if(projectId==='expired')return {routes:[routeEntry(projectId,personal,safeRoot,{},1,{sessionState:'ACTIVE',leaseExpiresAt:new Date(Date.now()-1000).toISOString()})],controlReachable:false,nowMs:Date.now()};
  if(projectId==='multi')return {routes:[routeEntry(projectId,personal,multiA,{},3),routeEntry(projectId,multi2,multiB,{},4)],controlReachable:true};
  return {routes:[routeEntry(projectId,personal,roots.get(projectId),{},1)],controlReachable:true};
};
const authorizeProject=async({projectId})=>({projectId,authorized:true,projectProfile:profiles.get(projectId),organizationId:'acme'});
const loadRoutes=async({projectId})=>routesFor(projectId);
const audit=new BusinessLocalEffectAudit({stateDir:auditDir,initialize:true});
const service=new BusinessSemanticFileService({authorizeProject,loadRoutes,audit,nativeConfig});

writeFileSync(join(safeRoot,'existing.txt'),'BASE\n',{mode:0o600});
writeFileSync(join(roRoot,'readonly.txt'),'READ ONLY\n',{mode:0o600});
writeFileSync(join(outside,'secret.txt'),'OUTSIDE\n',{mode:0o600});

try{
  const listed=await service.listDirectory({authenticatedMemberKey:memberKey,projectId:'safe',runtimeNodeId:personal});
  assert.equal(listed.entries.some(x=>x.name==='existing.txt'),true);
  const info=await service.getPathInfo({authenticatedMemberKey:memberKey,projectId:'safe',runtimeNodeId:personal,relativePath:'existing.txt'});
  assert.equal(info.kind,'file');
  const read=await service.readFile({authenticatedMemberKey:memberKey,projectId:'safe',runtimeNodeId:personal,relativePath:'existing.txt'});
  assert.equal(read.content,'BASE\n');
  const base=await service.getFileHash({authenticatedMemberKey:memberKey,projectId:'safe',runtimeNodeId:personal,relativePath:'existing.txt'});
  assert.equal(base.sha256,sha('BASE\n'));
  assert.equal(JSON.stringify([listed,info,read,base]).includes(safeRoot),false);
  log('mapped read/list/info/hash preserve relative-path output and host-path privacy');

  await service.createDirectory({authenticatedMemberKey:memberKey,projectId:'safe',runtimeNodeId:personal,relativePath:'src'});
  const secret='CONTENT_MARKER_'+randomUUID();
  const created=await service.createFile({authenticatedMemberKey:memberKey,projectId:'safe',runtimeNodeId:personal,relativePath:'src/a.txt',content:secret});
  const replaced=await service.replaceFile({authenticatedMemberKey:memberKey,projectId:'safe',runtimeNodeId:personal,relativePath:'src/a.txt',content:'alpha gamma\n',expectedSha256:created.sha256});
  const patched=await service.patchFile({authenticatedMemberKey:memberKey,projectId:'safe',runtimeNodeId:personal,relativePath:'src/a.txt',expectedSha256:replaced.sha256,oldText:'gamma',newText:'delta'});
  assert.equal(patched.patch.appliedOccurrences,1);
  const finalHash=await service.getFileHash({authenticatedMemberKey:memberKey,projectId:'safe',runtimeNodeId:personal,relativePath:'src/a.txt'});
  assert.equal(finalHash.sha256,sha('alpha delta\n'));
  log('SAFE mapped mkdir/create/replace/patch/hash reuses proven v1 primitives behind B-S3 routing');

  const moved=await service.movePath({authenticatedMemberKey:memberKey,projectId:'safe',runtimeNodeId:personal,
    sourceRelativePath:'src/a.txt',destinationRelativePath:'src/b.txt',expectedSourceSha256:finalHash.sha256});
  assert.equal(moved.commitMode,'DIRFD_RENAME_EXCL');assert.equal(existsSync(join(safeRoot,'src/a.txt')),false);
  assert.equal(readFileSync(join(safeRoot,'src/b.txt'),'utf8'),'alpha delta\n');
  const movedHash=await service.getFileHash({authenticatedMemberKey:memberKey,projectId:'safe',runtimeNodeId:personal,relativePath:'src/b.txt'});
  const deleted=await service.deletePath({authenticatedMemberKey:memberKey,projectId:'safe',runtimeNodeId:personal,
    relativePath:'src/b.txt',expectedKind:'regular_file',expectedSha256:movedHash.sha256});
  assert.equal(deleted.commitMode,'DIRFD_QUARANTINE_UNLINK');assert.equal(existsSync(join(safeRoot,'src/b.txt')),false);
  await service.deletePath({authenticatedMemberKey:memberKey,projectId:'safe',runtimeNodeId:personal,relativePath:'src',expectedKind:'empty_directory'});
  assert.equal(existsSync(join(safeRoot,'src')),false);
  log('descriptor-bound move is no-overwrite and regular-file/empty-directory delete is bounded cleanup');

  await service.createDirectory({authenticatedMemberKey:memberKey,projectId:'safe',runtimeNodeId:personal,relativePath:'nonempty'});
  const child=await service.createFile({authenticatedMemberKey:memberKey,projectId:'safe',runtimeNodeId:personal,relativePath:'nonempty/child.txt',content:'child'});
  await reject(()=>service.deletePath({authenticatedMemberKey:memberKey,projectId:'safe',runtimeNodeId:personal,relativePath:'nonempty',expectedKind:'empty_directory'}),'BUSINESS_DIRECTORY_NOT_EMPTY');
  assert.equal(readFileSync(join(safeRoot,'nonempty/child.txt'),'utf8'),'child');
  await service.deletePath({authenticatedMemberKey:memberKey,projectId:'safe',runtimeNodeId:personal,relativePath:'nonempty/child.txt',expectedKind:'regular_file',expectedSha256:child.sha256});
  await service.deletePath({authenticatedMemberKey:memberKey,projectId:'safe',runtimeNodeId:personal,relativePath:'nonempty',expectedKind:'empty_directory'});
  log('non-empty directory delete restores the exact staged directory and refuses recursive deletion');

  const one=await service.createFile({authenticatedMemberKey:memberKey,projectId:'safe',runtimeNodeId:personal,relativePath:'one.txt',content:'ONE'});
  const two=await service.createFile({authenticatedMemberKey:memberKey,projectId:'safe',runtimeNodeId:personal,relativePath:'two.txt',content:'TWO'});
  await reject(()=>service.movePath({authenticatedMemberKey:memberKey,projectId:'safe',runtimeNodeId:personal,sourceRelativePath:'one.txt',destinationRelativePath:'two.txt',expectedSourceSha256:one.sha256}),'BUSINESS_DESTINATION_EXISTS');
  assert.equal(readFileSync(join(safeRoot,'one.txt'),'utf8'),'ONE');assert.equal(readFileSync(join(safeRoot,'two.txt'),'utf8'),'TWO');
  await reject(()=>service.movePath({authenticatedMemberKey:memberKey,projectId:'safe',runtimeNodeId:personal,sourceRelativePath:'one.txt',destinationRelativePath:'three.txt',expectedSourceSha256:'0'.repeat(64)}),'BUSINESS_WRITE_CONFLICT');
  assert.equal(readFileSync(join(safeRoot,'one.txt'),'utf8'),'ONE');
  await service.movePath({authenticatedMemberKey:memberKey,projectId:'safe',runtimeNodeId:personal,sourceRelativePath:'one.txt',destinationRelativePath:'three.txt'});
  const threeHash=await service.getFileHash({authenticatedMemberKey:memberKey,projectId:'safe',runtimeNodeId:personal,relativePath:'three.txt'});
  await service.deletePath({authenticatedMemberKey:memberKey,projectId:'safe',runtimeNodeId:personal,relativePath:'three.txt',expectedKind:'regular_file',expectedSha256:threeHash.sha256});
  await service.deletePath({authenticatedMemberKey:memberKey,projectId:'safe',runtimeNodeId:personal,relativePath:'two.txt',expectedKind:'regular_file',expectedSha256:two.sha256});
  log('move destination overwrite and stale source-SHA races fail closed with original data preserved');

  const stale=await service.createFile({authenticatedMemberKey:memberKey,projectId:'safe',runtimeNodeId:personal,relativePath:'stale-delete.txt',content:'BEFORE'});
  writeFileSync(join(safeRoot,'stale-delete.txt'),'AFTER',{mode:0o600});
  await reject(()=>service.deletePath({authenticatedMemberKey:memberKey,projectId:'safe',runtimeNodeId:personal,relativePath:'stale-delete.txt',expectedKind:'regular_file',expectedSha256:stale.sha256}),'BUSINESS_WRITE_CONFLICT');
  assert.equal(readFileSync(join(safeRoot,'stale-delete.txt'),'utf8'),'AFTER');
  const current=await service.getFileHash({authenticatedMemberKey:memberKey,projectId:'safe',runtimeNodeId:personal,relativePath:'stale-delete.txt'});
  await service.deletePath({authenticatedMemberKey:memberKey,projectId:'safe',runtimeNodeId:personal,relativePath:'stale-delete.txt',expectedKind:'regular_file',expectedSha256:current.sha256});
  log('regular-file delete requires current SHA and never deletes stale-precondition content');

  assert.equal((await service.readFile({authenticatedMemberKey:memberKey,projectId:'ro',runtimeNodeId:personal,relativePath:'readonly.txt'})).content,'READ ONLY\n');
  await reject(()=>service.createFile({authenticatedMemberKey:memberKey,projectId:'ro',runtimeNodeId:personal,relativePath:'denied.txt',content:'NO'}),'BUSINESS_PROFILE_DENIED');
  await reject(()=>service.movePath({authenticatedMemberKey:memberKey,projectId:'ro',runtimeNodeId:personal,sourceRelativePath:'readonly.txt',destinationRelativePath:'moved.txt'}),'BUSINESS_PROFILE_DENIED');
  assert.equal(existsSync(join(roRoot,'denied.txt')),false);assert.equal(readFileSync(join(roRoot,'readonly.txt'),'utf8'),'READ ONLY\n');
  log('READ_ONLY project can read but SAFE semantic mutations are denied before effect and audited');

  const sharedCreated=await service.createFile({authenticatedMemberKey:memberKey,projectId:'shared',runtimeNodeId:shared,relativePath:'shared.txt',content:'SHARED'});
  assert.equal(readFileSync(join(sharedRoot,'shared.txt'),'utf8'),'SHARED');
  await service.deletePath({authenticatedMemberKey:memberKey,projectId:'shared',runtimeNodeId:shared,relativePath:'shared.txt',expectedKind:'regular_file',expectedSha256:sharedCreated.sha256});
  log('SHARED_NODE semantic file effects do not require generic shared host-power opt-in');

  await reject(()=>service.readFile({authenticatedMemberKey:memberKey,projectId:'wrong',runtimeNodeId:wrong,relativePath:'existing.txt'}),'BUSINESS_PERSONAL_NODE_OWNER_MISMATCH');
  await reject(()=>service.readFile({authenticatedMemberKey:memberKey,projectId:'expired',runtimeNodeId:personal,relativePath:'existing.txt'}),'BUSINESS_AUTH_LEASE_EXPIRED');
  await reject(()=>service.listDirectory({authenticatedMemberKey:memberKey,projectId:'multi'}),'BUSINESS_RUNTIME_NODE_REQUIRED');
  const multiList=await service.listDirectory({authenticatedMemberKey:memberKey,projectId:'multi',runtimeNodeId:personal});
  assert.equal(multiList.total,0);
  log('PERSONAL_NODE ownership, expired cached lease, and 2+ node explicit routing remain fail-closed');

  const escape=join(safeRoot,'escape');symlinkSync(outside,escape);
  await reject(()=>service.readFile({authenticatedMemberKey:memberKey,projectId:'safe',runtimeNodeId:personal,relativePath:'escape/secret.txt'}),'BUSINESS_SYMLINK_DENIED');
  await reject(()=>service.createFile({authenticatedMemberKey:memberKey,projectId:'safe',runtimeNodeId:personal,relativePath:'../bad.txt',content:'NO'}),'BUSINESS_RELATIVE_PATH_INVALID');
  mkdirSync(join(safeRoot,'.git'));writeFileSync(join(safeRoot,'.git/config'),'x');
  await reject(()=>service.readFile({authenticatedMemberKey:memberKey,projectId:'safe',runtimeNodeId:personal,relativePath:'.git/config'}),'BUSINESS_GIT_PATH_DENIED');
  log('traversal, symlink escape and direct .git path access remain denied');

  const auditRecords=audit.readRecent(200),auditText=readFileSync(join(auditDir,'local-effect-audit.jsonl'),'utf8');
  assert.ok(auditRecords.some(x=>x.tool==='fs_create_file'&&x.stage==='COMPLETED'&&x.effectOutcome==='COMMITTED'));
  assert.ok(auditRecords.some(x=>x.tool==='fs_move_path'&&x.stage==='FAILED'&&x.resultCode==='BUSINESS_WRITE_CONFLICT'));
  assert.ok(auditRecords.some(x=>x.tool==='fs_delete_path'&&x.stage==='FAILED'&&x.resultCode==='BUSINESS_DIRECTORY_NOT_EMPTY'));
  assert.ok(auditRecords.some(x=>x.tool==='fs_create_file'&&x.projectProfile==='READ_ONLY'&&x.stage==='FAILED'&&x.resultCode==='BUSINESS_PROFILE_DENIED'));
  assert.ok(auditRecords.some(x=>x.nodeType==='SHARED_NODE'&&x.tool==='fs_create_file'&&x.stage==='COMPLETED'));
  assert.equal(auditRecords.some(x=>['fs_read_file','fs_get_file_hash','fs_list_directory','fs_get_path_info'].includes(x.tool)),false);
  for(const forbidden of [secret,memberKey,safeRoot,roRoot,sharedRoot,'alpha gamma','alpha delta'])assert.equal(auditText.includes(forbidden),false);
  assert.ok(auditRecords.every(x=>/^[a-f0-9]{64}$/.test(x.actorDigest)));
  log('local HMAC audit records effect metadata/denials without content, OAuth subject, or absolute host paths');

  const auditDown={append(){throw Error('AUDIT_DOWN');}};
  const preAuditService=new BusinessSemanticFileService({authorizeProject,loadRoutes,audit:auditDown,nativeConfig});
  await reject(()=>preAuditService.createFile({authenticatedMemberKey:memberKey,projectId:'safe',runtimeNodeId:personal,relativePath:'preaudit.txt',content:'NEVER'}),'AUDIT_DOWN');
  assert.equal(existsSync(join(safeRoot,'preaudit.txt')),false);
  log('audit intent failure prevents the filesystem effect');

  const completionAudit={append(event){if(event.stage==='COMPLETED')throw Error('AUDIT_DOWN');return audit.append(event);}};
  const uncertainService=new BusinessSemanticFileService({authorizeProject,loadRoutes,audit:completionAudit,nativeConfig});
  const uncertain=await reject(()=>uncertainService.createFile({authenticatedMemberKey:memberKey,projectId:'safe',runtimeNodeId:personal,relativePath:'audit-uncertain.txt',content:'COMMITTED_ONCE'}),'BUSINESS_LOCAL_AUDIT_UNCERTAIN');
  assert.equal(uncertain.effect,'COMMITTED');assert.equal(uncertain.retryable,false);
  assert.equal(readFileSync(join(safeRoot,'audit-uncertain.txt'),'utf8'),'COMMITTED_ONCE');
  await reject(()=>service.createFile({authenticatedMemberKey:memberKey,projectId:'safe',runtimeNodeId:personal,relativePath:'audit-uncertain.txt',content:'RETRY'}),'BUSINESS_DESTINATION_EXISTS');
  assert.equal(readFileSync(join(safeRoot,'audit-uncertain.txt'),'utf8'),'COMMITTED_ONCE');
  log('committed effect + completion-audit failure is explicit non-retryable audit uncertainty');

  const tamper=new BusinessLocalEffectAudit({stateDir:tamperDir,initialize:true});
  tamper.append({authenticatedMemberKey:memberKey,organizationId:'acme',projectId:'safe',runtimeNodeId:personal,mappingRevision:1,nodeType:'PERSONAL_NODE',
    projectProfile:'SAFE',tool:'fs_create_file',effectClass:'CREATE',stage:'COMPLETED',targetRelativePaths:['x.txt'],resultCode:'OK',effectOutcome:'COMMITTED'});
  const tamperFile=join(tamperDir,'local-effect-audit.jsonl');
  writeFileSync(tamperFile,readFileSync(tamperFile,'utf8').replace('"resultCode":"OK"','"resultCode":"NO"'),{mode:0o600});
  assert.throws(()=>tamper.verify(),/BUSINESS_LOCAL_AUDIT_INTEGRITY_FAILED/);
  log('HMAC chain detects local audit tampering fail-closed');

  console.log('BUSINESS_S3C1_SEMANTIC_FILE_EFFECTS=PASS');
}finally{
  rmSync(root,{recursive:true,force:true});
  console.log('test_only_fixture_cleanup=COMPLETE');
}
