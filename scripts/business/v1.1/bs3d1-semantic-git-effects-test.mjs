import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync,chmodSync,existsSync,unlinkSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {randomUUID} from 'node:crypto';
import {BusinessSemanticGitService} from './runtime/business-semantic-git-service.mjs';
import {BusinessLocalEffectAudit} from './runtime/business-local-effect-audit.mjs';

const git=process.env.BUSINESS_TEST_GIT_BINARY||'/usr/bin/git';
const root=mkdtempSync(join(tmpdir(),'business-bs3d1-'));
const workspaceRoot=join(root,'workspace'),repo=join(workspaceRoot,'mapped'),remoteBare=join(root,'remote.git'),actor=join(root,'actor'),auditDir=join(root,'audit');
mkdirSync(workspaceRoot,{mode:0o700});mkdirSync(auditDir,{mode:0o700});
const g=(cwd,args,options={})=>execFileSync(git,args,{cwd,encoding:options.encoding??'utf8',stdio:options.stdio??['ignore','pipe','pipe'],env:{...process.env,GIT_TERMINAL_PROMPT:'0'}});
const cfg=(cwd,key,value)=>g(cwd,['config',key,value]);
const fileRemote=pathToFileURL(remoteBare).href;
const personal=randomUUID(),second=randomUUID();
const memberKey='oauth-subject-bs3d1-member-0001';
let profile='STANDARD';
let node={nodeId:personal,nodeType:'PERSONAL_NODE',lifecycle:'APPROVED',ownedByCaller:true,sharedHostPowerEnabled:false};
let routes=[];
let service;

function setupGit(){
  g(root,['init','--bare',remoteBare]);
  g(root,['init','-b','main',repo]);cfg(repo,'user.name','B-S3D Test');cfg(repo,'user.email','bs3d@example.test');
  writeFileSync(join(repo,'README.md'),'initial\n');g(repo,['add','--','README.md']);g(repo,['commit','-m','initial']);
  g(repo,['remote','add','origin',fileRemote]);g(repo,['push','-u','origin','main']);
  g(root,['--git-dir',remoteBare,'symbolic-ref','HEAD','refs/heads/main']);
  g(root,['clone',fileRemote,actor]);cfg(actor,'user.name','Actor');cfg(actor,'user.email','actor@example.test');
}
function mapping(n=node){return {projectId:'standard',runtimeNodeId:n.nodeId,workspaceRootId:'workspace',workspaceRelativePath:'mapped',mappingRevision:1,canonicalPath:repo};}
function resetRoutes(){routes=[{node,mapping:mapping(node),session:null}];}
function directBranch(){return g(repo,['symbolic-ref','--short','HEAD']).trim();}
function branchExists(name){try{g(repo,['show-ref','--verify','--quiet',`refs/heads/${name}`]);return true;}catch{return false;}}

try{
  setupGit();resetRoutes();
  const fakeGh=join(root,'fake-gh');const ghLog=join(root,'gh.log');
  writeFileSync(fakeGh,`#!/bin/sh\nprintf '%s\\n' "$*" >> '${ghLog.replaceAll("'","'\\''")}'\nprintf '%s\\n' 'https://github.com/example/repo/pull/123'\n`,{mode:0o700});chmodSync(fakeGh,0o700);
  const audit=new BusinessLocalEffectAudit({stateDir:auditDir,initialize:true});
  const authorizeProject=async({projectId})=>({projectId,authorized:true,projectProfile:profile,organizationId:'acme'});
  const loadRoutes=async()=>({routes,controlReachable:true});
  const authorizeWorkspaceClone=async({runtimeNodeId,workspaceRootId})=>({authorized:true,organizationId:'acme',runtimeNodeId,workspaceRootId,workspaceRootPath:workspaceRoot,node});
  service=new BusinessSemanticGitService({authorizeProject,loadRoutes,authorizeWorkspaceClone,audit,gitBinary:git,githubBinary:fakeGh,allowFileProtocolForTests:true});
  const routed={authenticatedMemberKey:memberKey,projectId:'standard',runtimeNodeId:personal};

  const initialStatus=await service.getStatus(routed);assert.equal(initialStatus.branch,'main');assert.deepEqual(initialStatus.entries,[]);
  const initialHistory=await service.getHistory({...routed,limit:5});assert.equal(initialHistory.commits.length,1);assert.equal(initialHistory.commits[0].subject,'initial');
  const initialBranches=await service.listBranches({...routed,includeRemoteTracking:true});assert.ok(initialBranches.branches.some(x=>x.name==='main'&&x.kind==='local'));
  writeFileSync(join(repo,'README.md'),'initial\nchanged\n');const diff=await service.getDiff({...routed,scope:'unstaged'});assert.match(diff.diff,/\+changed/);g(repo,['restore','--','README.md']);
  console.log('PASS mapped Git reads are bounded/local and preserve project-relative output');

  const made=await service.createBranch({...routed,branchName:'feature/test'});assert.equal(made.branchName,'feature/test');assert.equal(directBranch(),'main');
  await service.switchBranch({...routed,branchName:'feature/test'});assert.equal(directBranch(),'feature/test');
  writeFileSync(join(repo,'feature.txt'),'feature-v1\n');
  const staged=await service.stageFiles({...routed,paths:['feature.txt']});assert.match(staged.stagedDiffSha256,/^[a-f0-9]{64}$/);assert.ok(staged.stagedBytes>0);
  await assert.rejects(()=>service.createCommit({...routed,message:'wrong digest must fail',expectedStagedDiffSha256:'0'.repeat(64)}),/BUSINESS_GIT_STAGED_DIFF_CONFLICT/);
  const committed=await service.createCommit({...routed,message:'feat: semantic git fixture',expectedStagedDiffSha256:staged.stagedDiffSha256});assert.match(committed.commitOid,/^[a-f0-9]{40,64}$/);
  assert.equal(g(repo,['diff','--cached','--name-only']).trim(),'');
  console.log('PASS branch/create/switch/stage/commit use focused semantics and exact staged-diff precondition');

  const magic=':(glob)*.txt';writeFileSync(join(repo,magic),'literal\n');writeFileSync(join(repo,'other.txt'),'other\n');
  const magicStage=await service.stageFiles({...routed,paths:[magic]});assert.match(magicStage.stagedDiffSha256,/^[a-f0-9]{64}$/);
  const stagedNames=g(repo,['--literal-pathspecs','diff','--cached','--name-only']).trim().split(/\r?\n/).filter(Boolean);assert.deepEqual(stagedNames,[magic]);
  g(repo,['--literal-pathspecs','restore','--staged','--',magic]);unlinkSync(join(repo,magic));unlinkSync(join(repo,'other.txt'));
  console.log('PASS Git pathspec magic is treated literally and cannot broaden staging');

  const pushed=await service.pushBranch({...routed,branchName:'feature/test',remoteName:'origin'});assert.equal(pushed.branchName,'feature/test');
  assert.equal(g(root,['--git-dir',remoteBare,'rev-parse','refs/heads/feature/test']).trim(),committed.commitOid);
  await service.switchBranch({...routed,branchName:'main'});assert.equal(directBranch(),'main');
  writeFileSync(join(actor,'upstream.txt'),'upstream\n');g(actor,['add','--','upstream.txt']);g(actor,['commit','-m','upstream change']);g(actor,['push','origin','main']);
  const remoteMain=g(root,['--git-dir',remoteBare,'rev-parse','refs/heads/main']).trim();
  await service.fetchRemote({...routed,remoteName:'origin'});assert.equal(g(repo,['rev-parse','refs/remotes/origin/main']).trim(),remoteMain);
  const pulled=await service.pullFfOnly(routed);assert.equal(pulled.commitOid,remoteMain);assert.equal(readFileSync(join(repo,'upstream.txt'),'utf8'),'upstream\n');
  console.log('PASS fetch/pull/push preserve configured remote authority, ff-only pull, and single non-force branch publication');

  const cloned=await service.cloneRepository({authenticatedMemberKey:memberKey,runtimeNodeId:personal,workspaceRootId:'workspace',repositoryUrl:fileRemote,directoryName:'cloned-copy'});
  assert.equal(cloned.cloned,true);assert.ok(existsSync(join(workspaceRoot,'cloned-copy','.git')));assert.equal(routes.length,1,'clone must not create a hidden Business mapping');
  console.log('PASS clone creates only a new checkout inside approved workspace and never creates project mapping');

  cfg(repo,'filter.evil.clean','sh -c "echo pwned"');writeFileSync(join(repo,'filter.txt'),'x\n');
  await assert.rejects(()=>service.stageFiles({...routed,paths:['filter.txt']}),/BUSINESS_GIT_EXTERNAL_FILTER_DENIED/);assert.equal(g(repo,['diff','--cached','--name-only']).trim(),'');
  g(repo,['config','--unset-all','filter.evil.clean']);unlinkSync(join(repo,'filter.txt'));
  cfg(repo,'core.sshCommand','sh -c "echo pwned"');await assert.rejects(()=>service.fetchRemote({...routed,remoteName:'origin'}),/BUSINESS_GIT_REMOTE_CONFIG_DENIED/);g(repo,['config','--unset-all','core.sshCommand']);
  g(repo,['remote','set-url','origin','ext::sh -c echo-pwned']);await assert.rejects(()=>service.fetchRemote({...routed,remoteName:'origin'}),/BUSINESS_GIT_REMOTE_URL_DENIED/);g(repo,['remote','set-url','origin',fileRemote]);
  console.log('PASS arbitrary clean filters, sshCommand and ext/rewrite-style remote execution paths fail closed before effect');

  profile='SAFE';await assert.rejects(()=>service.getStatus(routed),/BUSINESS_PROFILE_DENIED/);profile='STANDARD';
  node={...node,ownedByCaller:false};resetRoutes();await assert.rejects(()=>service.createBranch({...routed,branchName:'owner-denied'}),/BUSINESS_PERSONAL_NODE_OWNER_MISMATCH/);assert.equal(branchExists('owner-denied'),false);
  node={nodeId:personal,nodeType:'SHARED_NODE',lifecycle:'APPROVED',ownedByCaller:false,sharedHostPowerEnabled:false};resetRoutes();
  const sharedMade=await service.createBranch({...routed,branchName:'shared-semantic-ok'});assert.equal(sharedMade.branchName,'shared-semantic-ok');
  node={nodeId:personal,nodeType:'PERSONAL_NODE',lifecycle:'APPROVED',ownedByCaller:true,sharedHostPowerEnabled:false};
  routes=[{node,mapping:mapping(node),session:null},{node:{...node,nodeId:second},mapping:{...mapping({...node,nodeId:second}),runtimeNodeId:second},session:null}];
  await assert.rejects(()=>service.getStatus({authenticatedMemberKey:memberKey,projectId:'standard'}),/BUSINESS_RUNTIME_NODE_REQUIRED/);resetRoutes();
  console.log('PASS STANDARD profile, PERSONAL owner, SHARED semantic authority, and explicit multi-node routing remain fail-closed');

  g(repo,['remote','set-url','origin','https://github.com/example/repo.git']);
  const pr=await service.createPullRequest({...routed,title:'B-S3D semantic PR',body:'provider boundary fixture',baseBranch:'main',headBranch:'feature/test',draft:true});
  assert.equal(pr.url,'https://github.com/example/repo/pull/123');const ghArgs=readFileSync(ghLog,'utf8');assert.match(ghArgs,/pr create/);assert.match(ghArgs,/--repo example\/repo/);assert.match(ghArgs,/--head feature\/test/);assert.doesNotMatch(ghArgs,/push|merge|force/);
  console.log('PASS GitHub PR adapter uses explicit repo/head and creates no hidden push/merge/force operation');

  const records=audit.verify();assert.equal(records.length,24);
  assert.equal(records.filter(x=>x.stage==='FAILED').length,0);assert.equal(records.filter(x=>x.stage==='COMPLETED').length,12);
  assert.ok(records.some(x=>x.tool==='git_clone_repository'&&x.projectId===null&&x.workspaceRootId==='workspace'));
  assert.ok(records.some(x=>x.tool==='github_create_pull_request'&&x.effectClass==='PR_CREATE'));
  const raw=readFileSync(join(auditDir,'local-effect-audit.jsonl'),'utf8');
  assert.doesNotMatch(raw,/feature-v1|provider boundary fixture|wrong digest must fail|https:\/\/github\.com|file:\/\//);
  assert.ok(!raw.includes(memberKey));assert.ok(!raw.includes(root));assert.doesNotMatch(raw,/--force|reset --hard|clean -fdx/);
  console.log('PASS local HMAC audit records bounded Git/GitHub effect metadata without command text, message/body, remote URL, OAuth subject, or host root');
  console.log('BUSINESS_S3D1_SEMANTIC_GIT_EFFECTS=PASS');
} finally {
  rmSync(root,{recursive:true,force:true});
  console.log('test_only_fixture_cleanup=COMPLETE');
}
