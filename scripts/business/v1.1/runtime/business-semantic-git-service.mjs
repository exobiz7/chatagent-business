import {spawn} from 'node:child_process';
import {existsSync,lstatSync,realpathSync} from 'node:fs';
import {promises as fs} from 'node:fs';
import {createHash,randomUUID} from 'node:crypto';
import {isAbsolute,join,resolve,sep} from 'node:path';
import {assertRuntimeAuthorization} from '../control/runtime-authorization-lease.mjs';
import {resolveBusinessRuntimeRoute} from './business-runtime-router.mjs';

const PROJECT=/^[a-z0-9][a-z0-9._-]{0,63}$/;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SHA=/^[a-f0-9]{64}$/;
const BRANCH=/^[A-Za-z0-9][A-Za-z0-9._\/-]{0,254}$/;
const REMOTE=/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const WORKSPACE=/^[a-z0-9][a-z0-9._-]{0,63}$/;
const EFFECT=Object.freeze({
  git_create_branch:'BRANCH_CREATE',git_switch_branch:'BRANCH_SWITCH',git_stage_files:'STAGE',git_create_commit:'COMMIT',
  git_clone_repository:'CLONE',git_fetch_remote:'FETCH',git_pull_ff_only:'PULL_FF',git_push_branch:'PUSH',
  github_create_pull_request:'PR_CREATE'
});
const fail=code=>{throw Error(code);};
const within=(child,parent)=>child===parent||child.startsWith(parent+sep);
const digest=value=>createHash('sha256').update(value).digest('hex');
const text=buffer=>Buffer.isBuffer(buffer)?buffer.toString('utf8'):String(buffer??'');

function member(value){
  if(typeof value!=='string'||value.length<8||value.length>512||/[\0\r\n]/.test(value))fail('BUSINESS_AUTHENTICATED_MEMBER_INVALID');
  return value;
}
function project(value){if(typeof value!=='string'||!PROJECT.test(value))fail('BUSINESS_PROJECT_ID_INVALID');return value;}
function workspace(value){if(typeof value!=='string'||!WORKSPACE.test(value))fail('BUSINESS_WORKSPACE_ROOT_ID_INVALID');return value;}
function branch(value){
  if(typeof value!=='string'||!BRANCH.test(value)||value.includes('..')||value.includes('//')||value.endsWith('/')||value.endsWith('.')||value.endsWith('.lock'))
    fail('BUSINESS_GIT_BRANCH_INVALID');
  return value;
}
function remote(value='origin'){if(typeof value!=='string'||!REMOTE.test(value))fail('BUSINESS_GIT_REMOTE_INVALID');return value;}
function relative(value){
  if(typeof value!=='string'||value.length<1||value.length>4096||isAbsolute(value)||/[\0\r\n\\]/.test(value))fail('BUSINESS_GIT_PATH_INVALID');
  const parts=value.split('/');
  if(parts.some(x=>!x||x==='.'||x==='..'||x.toLowerCase()==='.git'))fail('BUSINESS_GIT_PATH_INVALID');
  return parts.join('/');
}
function routePayload(value){
  if(Array.isArray(value))return {routes:value,controlReachable:true,nowMs:Date.now()};
  if(!value||typeof value!=='object'||Array.isArray(value)||!Array.isArray(value.routes))fail('BUSINESS_RUNTIME_ROUTE_INPUT_INVALID');
  return {routes:value.routes,controlReachable:value.controlReachable!==false,nowMs:Number.isFinite(value.nowMs)?value.nowMs:Date.now()};
}
function projectAuthorization(value,projectId){
  if(!value||typeof value!=='object'||Array.isArray(value)||value.projectId!==projectId||value.authorized!==true||
     value.projectProfile!=='STANDARD'||typeof value.organizationId!=='string'||!value.organizationId||value.organizationId.length>128)
    fail(value?.projectProfile&&value.projectProfile!=='STANDARD'?'BUSINESS_PROFILE_DENIED':'BUSINESS_PROJECT_AUTHORIZATION_DENIED');
  return value;
}
function cloneAuthorization(value,{runtimeNodeId,workspaceRootId}){
  if(!value||typeof value!=='object'||Array.isArray(value)||value.authorized!==true||value.runtimeNodeId!==runtimeNodeId||
     value.workspaceRootId!==workspaceRootId||typeof value.organizationId!=='string'||!value.organizationId||
     typeof value.workspaceRootPath!=='string'||!isAbsolute(value.workspaceRootPath)||!value.node)
    fail('BUSINESS_GIT_CLONE_AUTHORIZATION_DENIED');
  return value;
}
function executable(value,code){
  if(typeof value!=='string'||!isAbsolute(value))fail(code);
  let real,st;try{real=realpathSync(value);st=lstatSync(real);}catch{fail(code);}
  if(!st.isFile()||st.isSymbolicLink()||(st.mode&0o022)!==0)fail(code);
  return value;
}
function safeEnv(){
  const env={PATH:process.env.PATH??'/usr/bin:/bin:/usr/sbin:/sbin:/opt/homebrew/bin',HOME:process.env.HOME??'',
    LANG:process.env.LANG??'en_US.UTF-8',GIT_TERMINAL_PROMPT:'0',GIT_PAGER:'cat',PAGER:'cat',GIT_LITERAL_PATHSPECS:'1'};
  if(process.env.SSH_AUTH_SOCK)env.SSH_AUTH_SOCK=process.env.SSH_AUTH_SOCK;
  return env;
}
function commandError(code,{uncertain=false}={}){const e=Error(code);if(uncertain){e.effect='UNCERTAIN';e.retryable=false;}return e;}
async function run(binary,args,{cwd,timeoutMs=10000,maxBytes=1024*1024,allowTruncate=false,uncertainCode=null}={}){
  return await new Promise((resolveRun,reject)=>{
    let child;
    try{child=spawn(binary,args,{cwd,stdio:['ignore','pipe','pipe'],shell:false,env:safeEnv()});}
    catch{return reject(commandError(uncertainCode??'BUSINESS_GIT_COMMAND_FAILED',{uncertain:Boolean(uncertainCode)}));}
    let out=[],err=[],outBytes=0,errBytes=0,ended=false,truncated=false,timedOut=false,limited=false;
    const timer=setTimeout(()=>{timedOut=true;child.kill('SIGKILL');},timeoutMs);
    const capture=(target,c)=>{
      if(target==='out'){
        if(outBytes+c.length>maxBytes){
          const room=Math.max(0,maxBytes-outBytes);if(room)out.push(c.subarray(0,room));outBytes+=room;
          if(allowTruncate){truncated=true;child.kill('SIGKILL');}else{limited=true;child.kill('SIGKILL');}
        }else{out.push(c);outBytes+=c.length;}
      }else if(errBytes<65536){const room=65536-errBytes;err.push(c.subarray(0,room));errBytes+=Math.min(room,c.length);}
    };
    child.stdout.on('data',c=>capture('out',c));child.stderr.on('data',c=>capture('err',c));
    child.on('error',()=>{if(!ended){ended=true;clearTimeout(timer);reject(commandError(uncertainCode??'BUSINESS_GIT_COMMAND_FAILED',{uncertain:Boolean(uncertainCode)}));}});
    child.on('close',code=>{
      if(ended)return;ended=true;clearTimeout(timer);
      const stdout=Buffer.concat(out),stderr=text(Buffer.concat(err));
      if(truncated&&allowTruncate)return resolveRun({stdout,stderr,code,truncated:true});
      if(timedOut||limited)return reject(commandError(uncertainCode??(limited?'BUSINESS_GIT_OUTPUT_LIMIT':'BUSINESS_GIT_TIMEOUT'),{uncertain:Boolean(uncertainCode)}));
      if(code!==0){const e=commandError('BUSINESS_GIT_COMMAND_FAILED');e.commandStatus=code;e.stderr=stderr.slice(0,2048);return reject(e);}
      resolveRun({stdout,stderr,code,truncated:false});
    });
  });
}
function gitBase(root,{readOnly=false,allowFile=false}={}){
  return ['--literal-pathspecs',...(readOnly?['--no-optional-locks']:[]),'-c','core.hooksPath=/dev/null','-c','core.fsmonitor=false',
    '-c','commit.gpgSign=false','-c','protocol.ext.allow=never','-c',`protocol.file.allow=${allowFile?'always':'never'}`,'-C',root];
}
function cleanResultError(error,defaultCode='BUSINESS_GIT_OPERATION_FAILED'){
  if(error?.effect==='UNCERTAIN')return error;
  const code=String(error?.message??'');
  if(/^BUSINESS_[A-Z0-9_]{3,80}$/.test(code)&&code!=='BUSINESS_GIT_COMMAND_FAILED')return error;
  return Error(defaultCode);
}
function publicRoute(route){return {runtimeNodeId:route.nodeId,mappingRevision:route.mappingRevision};}
function targetLabel(prefix,value){return `${prefix}/${String(value).replace(/^\/+|\/+$/g,'')}`.slice(0,4096);}
function stageAuditTargets(paths){return paths.length<=2?paths:[`pathset/${paths.length}/${digest(JSON.stringify(paths))}`];}

export class BusinessSemanticGitService{
  constructor({authorizeProject,loadRoutes,authorizeWorkspaceClone,audit,gitBinary,githubBinary=null,allowFileProtocolForTests=false,githubHosts=['github.com']}={}){
    if(typeof authorizeProject!=='function'||typeof loadRoutes!=='function'||typeof authorizeWorkspaceClone!=='function'||
       !audit||typeof audit.append!=='function'||typeof allowFileProtocolForTests!=='boolean'||!Array.isArray(githubHosts)||githubHosts.length<1)
      fail('BUSINESS_SEMANTIC_GIT_SERVICE_CONFIG_INVALID');
    this.authorizeProject=authorizeProject;this.loadRoutes=loadRoutes;this.authorizeWorkspaceClone=authorizeWorkspaceClone;this.audit=audit;
    this.gitBinary=executable(gitBinary,'BUSINESS_GIT_BINARY_UNSAFE');
    this.githubBinary=githubBinary?executable(githubBinary,'BUSINESS_GITHUB_BINARY_UNSAFE'):null;
    this.allowFileProtocolForTests=allowFileProtocolForTests;
    this.githubHosts=new Set(githubHosts.map(x=>String(x).toLowerCase()));
  }

  async #git(root,args,options={}){return run(this.gitBinary,[...gitBase(root,{readOnly:options.readOnly,allowFile:this.allowFileProtocolForTests}),...args],{cwd:root,...options});}
  async #repo(root){
    if(typeof root!=='string'||!isAbsolute(root))fail('BUSINESS_GIT_REPOSITORY_INVALID');
    let canonical,top,gitDir;
    try{
      const st=await fs.lstat(root);if(!st.isDirectory()||st.isSymbolicLink())fail('BUSINESS_GIT_REPOSITORY_INVALID');
      canonical=await fs.realpath(root);
      const gst=await fs.lstat(join(canonical,'.git'));if(!gst.isDirectory()||gst.isSymbolicLink())fail('BUSINESS_GIT_REPOSITORY_UNSUPPORTED');
      top=text((await this.#git(canonical,['rev-parse','--show-toplevel'],{readOnly:true,maxBytes:8192})).stdout).trim();
      gitDir=text((await this.#git(canonical,['rev-parse','--absolute-git-dir'],{readOnly:true,maxBytes:8192})).stdout).trim();
    }catch(e){throw cleanResultError(e,'BUSINESS_GIT_REPOSITORY_INVALID');}
    let topReal,gitReal;try{topReal=realpathSync(top);gitReal=realpathSync(gitDir);}catch{fail('BUSINESS_GIT_REPOSITORY_INVALID');}
    if(topReal!==canonical||gitReal!==realpathSync(join(canonical,'.git'))||!within(gitReal,canonical))fail('BUSINESS_GIT_REPOSITORY_UNSUPPORTED');
    return canonical;
  }
  async #configSafety(root,{remoteOperation=false}={}){
    let cfg='';try{cfg=text((await this.#git(root,['config','--show-origin','--list'],{readOnly:true,maxBytes:262144})).stdout);}catch(e){throw cleanResultError(e);}
    for(const line of cfg.split(/\r?\n/)){
      const item=(line.includes('\t')?line.slice(line.indexOf('\t')+1):line).trim();
      const lower=item.toLowerCase();
      const filter=/^filter\.([^.]+)\.(clean|smudge|process)=(.*)$/i.exec(item);
      if(filter){
        const key=`${filter[1].toLowerCase()}.${filter[2].toLowerCase()}`,value=filter[3].trim();
        const lfs=(key==='lfs.clean'&&value==='git-lfs clean -- %f')||(key==='lfs.smudge'&&value==='git-lfs smudge -- %f')||
          (key==='lfs.process'&&value==='git-lfs filter-process');
        if(!lfs)fail('BUSINESS_GIT_EXTERNAL_FILTER_DENIED');
      }
      if(remoteOperation&&(lower.startsWith('core.sshcommand=')||(/^url\..*\.insteadof=/i.test(item))))
        fail('BUSINESS_GIT_REMOTE_CONFIG_DENIED');
    }
  }
  async #context({authenticatedMemberKey,projectId,runtimeNodeId,tool,mutation=false,remoteOperation=false}){
    authenticatedMemberKey=member(authenticatedMemberKey);projectId=project(projectId);
    const auth=projectAuthorization(await this.authorizeProject({authenticatedMemberKey,projectId}),projectId);
    const source=routePayload(await this.loadRoutes({authenticatedMemberKey,projectId}));
    const route=resolveBusinessRuntimeRoute({projectId,runtimeNodeId,toolName:tool,...source});
    const root=await this.#repo(route.localProjectRoot);
    if(mutation||remoteOperation)await this.#configSafety(root,{remoteOperation});
    return {authenticatedMemberKey,projectId,auth,route,root};
  }
  #auditBase(ctx,{requestId,tool,targetRelativePaths,preconditionDigest=null}){
    return {requestId,authenticatedMemberKey:ctx.authenticatedMemberKey,organizationId:ctx.auth.organizationId,projectId:ctx.projectId,
      runtimeNodeId:ctx.route.nodeId,mappingRevision:ctx.route.mappingRevision,nodeType:ctx.route.nodeType,projectProfile:'STANDARD',workspaceRootId:null,
      tool,effectClass:EFFECT[tool],targetRelativePaths,preconditionDigest};
  }
  async #mutate(ctx,{tool,targetRelativePaths,preconditionDigest=null},execute){
    const requestId=randomUUID(),base=this.#auditBase(ctx,{requestId,tool,targetRelativePaths,preconditionDigest});
    this.audit.append({...base,stage:'ISSUED',resultCode:'ISSUED',effectOutcome:'PENDING'});
    try{
      const result=await execute();
      try{this.audit.append({...base,stage:'COMPLETED',resultCode:'OK',effectOutcome:'COMMITTED'});}
      catch{const e=Error('BUSINESS_LOCAL_AUDIT_UNCERTAIN');e.effect='COMMITTED';e.audit='UNCERTAIN';e.retryable=false;throw e;}
      return {...result,...publicRoute(ctx.route)};
    }catch(error){
      if(String(error?.message)==='BUSINESS_LOCAL_AUDIT_UNCERTAIN')throw error;
      const outcome=error?.effect==='UNCERTAIN'?'UNCERTAIN':error?.effect==='COMMITTED'?'COMMITTED':'NONE';
      try{this.audit.append({...base,stage:'FAILED',resultCode:/^[A-Z][A-Z0-9_]{2,79}$/.test(String(error?.message))?String(error.message):'BUSINESS_GIT_OPERATION_FAILED',effectOutcome:outcome});}
      catch{error.audit='UNCERTAIN';}
      throw error;
    }
  }
  async #stagedDiff(root,{maxBytes=1024*1024}={}){
    const r=await this.#git(root,['diff','--cached','--binary','--full-index','--no-ext-diff','--no-textconv','--no-color','--no-renames'],{readOnly:true,maxBytes});
    return r.stdout;
  }
  #safeRemoteUrl(value,{githubOnly=false}={}){
    if(typeof value!=='string'||value.length<1||value.length>2048||/[\0\r\n]/.test(value))fail('BUSINESS_GIT_REMOTE_URL_DENIED');
    if(this.allowFileProtocolForTests&&/^file:\/\//i.test(value))return {kind:'file',host:'local',path:value};
    if(/^https:\/\//i.test(value)||/^ssh:\/\//i.test(value)){
      let u;try{u=new URL(value);}catch{fail('BUSINESS_GIT_REMOTE_URL_DENIED');}
      if(u.password||!u.hostname||(u.protocol==='https:'&&u.username))fail('BUSINESS_GIT_REMOTE_URL_DENIED');
      const host=u.hostname.toLowerCase();if(githubOnly&&!this.githubHosts.has(host))fail('BUSINESS_GITHUB_REMOTE_REQUIRED');
      return {kind:u.protocol.slice(0,-1),host,path:u.pathname.replace(/^\//,'')};
    }
    const scp=/^([A-Za-z0-9._-]+)@([A-Za-z0-9.-]+):([A-Za-z0-9._~\/-]+)$/.exec(value);
    if(scp){const host=scp[2].toLowerCase();if(githubOnly&&!this.githubHosts.has(host))fail('BUSINESS_GITHUB_REMOTE_REQUIRED');return {kind:'ssh',host,path:scp[3]};}
    fail('BUSINESS_GIT_REMOTE_URL_DENIED');
  }
  async #remoteInfo(ctx,name,{push=false,githubOnly=false}={}){
    name=remote(name);await this.#configSafety(ctx.root,{remoteOperation:true});
    let value;try{value=text((await this.#git(ctx.root,['remote','get-url',...(push?['--push']:[]),name],{readOnly:true,maxBytes:8192})).stdout).trim();}
    catch{fail('BUSINESS_GIT_REMOTE_UNKNOWN');}
    return {name,url:value,parsed:this.#safeRemoteUrl(value,{githubOnly})};
  }
  async #currentBranch(root){
    let value;try{value=text((await this.#git(root,['symbolic-ref','--quiet','--short','HEAD'],{readOnly:true,maxBytes:4096})).stdout).trim();}
    catch{fail('BUSINESS_GIT_DETACHED_HEAD');}
    return branch(value);
  }

  async getStatus(args={}){
    const ctx=await this.#context({...args,tool:'git_get_status'}),maxEntries=args.maxEntries??200;
    let raw;try{raw=text((await this.#git(ctx.root,['status','--porcelain=v2','--branch','--untracked-files=normal'],{readOnly:true,maxBytes:524288,allowTruncate:true})).stdout);}
    catch(e){throw cleanResultError(e);}
    let branchName=null,upstream=null,ahead=0,behind=0;const entries=[];
    for(const line of raw.split(/\r?\n/).filter(Boolean)){
      if(line.startsWith('# branch.head '))branchName=line.slice(14);
      else if(line.startsWith('# branch.upstream '))upstream=line.slice(18);
      else if(line.startsWith('# branch.ab ')){const m=/\+(-?\d+)\s+-(-?\d+)/.exec(line);if(m){ahead=Number(m[1]);behind=Number(m[2]);}}
      else if(line.startsWith('# '))continue;
      else if(entries.length<maxEntries)entries.push(line.slice(0,4096));
    }
    return {projectId:ctx.projectId,...publicRoute(ctx.route),branch:branchName,upstream,ahead,behind,entries,truncated:entries.length>=maxEntries};
  }
  async getDiff(args={}){
    const ctx=await this.#context({...args,tool:'git_get_diff'}),scope=args.scope??'unstaged',maxBytes=args.maxBytes??262144;
    const common=['--binary','--full-index','--no-ext-diff','--no-textconv','--no-color','--no-renames'];
    const commands=scope==='staged'?[['diff','--cached',...common]]:scope==='all'?[['diff','--cached',...common],['diff',...common]]:[['diff',...common]];
    let parts=[],truncated=false,room=maxBytes;
    for(const cmd of commands){if(room<=0){truncated=true;break;}const r=await this.#git(ctx.root,cmd,{readOnly:true,maxBytes:room,allowTruncate:true});parts.push(r.stdout);room-=r.stdout.length;truncated ||= r.truncated;}
    return {projectId:ctx.projectId,...publicRoute(ctx.route),scope,diff:Buffer.concat(parts).toString('utf8'),truncated};
  }
  async getHistory(args={}){
    const ctx=await this.#context({...args,tool:'git_get_history'}),limit=args.limit??20;
    const cmd=['log',`-${limit}`,'--date=iso-strict','--format=%H%x1f%aI%x1f%an%x1f%s'];
    if(args.relativePath!==undefined)cmd.push('--',relative(args.relativePath));
    const raw=text((await this.#git(ctx.root,cmd,{readOnly:true,maxBytes:262144})).stdout);
    const commits=raw.split(/\r?\n/).filter(Boolean).slice(0,limit).map(line=>{const [oid,authoredAt,authorName,subject]=line.split('\x1f');return {oid,authoredAt,authorName,subject};});
    return {projectId:ctx.projectId,...publicRoute(ctx.route),commits};
  }
  async listBranches(args={}){
    const ctx=await this.#context({...args,tool:'git_list_branches'}),limit=args.limit??100,includeRemoteTracking=args.includeRemoteTracking===true;
    const refs=['refs/heads',...(includeRemoteTracking?['refs/remotes']:[])];
    const raw=text((await this.#git(ctx.root,['for-each-ref','--format=%(refname)%09%(objectname)%09%(HEAD)%09%(upstream:short)',...refs],{readOnly:true,maxBytes:262144})).stdout);
    const branches=[];for(const line of raw.split(/\r?\n/).filter(Boolean)){if(branches.length>=limit)break;const [ref,oid,head,upstream]=line.split('\t');if(ref.endsWith('/HEAD'))continue;branches.push({name:ref.replace(/^refs\/heads\//,'').replace(/^refs\/remotes\//,''),kind:ref.startsWith('refs/heads/')?'local':'remote_tracking',oid,current:head==='*',upstream:upstream||null});}
    return {projectId:ctx.projectId,...publicRoute(ctx.route),branches,truncated:branches.length>=limit};
  }
  async createBranch(args={}){
    const ctx=await this.#context({...args,tool:'git_create_branch',mutation:true}),name=branch(args.branchName);
    let oid;try{const start=args.startPoint??'HEAD';if(typeof start!=='string'||!start||start.length>255||start.startsWith('-')||/[\0\r\n]/.test(start))fail('BUSINESS_GIT_START_POINT_INVALID');oid=text((await this.#git(ctx.root,['rev-parse','--verify','--end-of-options',`${start}^{commit}`],{readOnly:true,maxBytes:4096})).stdout).trim();}
    catch(e){throw cleanResultError(e,'BUSINESS_GIT_START_POINT_INVALID');}
    return this.#mutate(ctx,{tool:'git_create_branch',targetRelativePaths:[targetLabel('branch',name)]},async()=>{
      try{await this.#git(ctx.root,['branch','--no-track',name,oid],{maxBytes:65536,uncertainCode:'BUSINESS_GIT_EFFECT_UNCERTAIN'});}catch(e){throw cleanResultError(e,'BUSINESS_GIT_BRANCH_CREATE_FAILED');}
      return {projectId:ctx.projectId,branchName:name,startOid:oid};
    });
  }
  async switchBranch(args={}){
    const ctx=await this.#context({...args,tool:'git_switch_branch',mutation:true}),name=branch(args.branchName);
    try{await this.#git(ctx.root,['show-ref','--verify','--quiet',`refs/heads/${name}`],{readOnly:true,maxBytes:4096});}catch{fail('BUSINESS_GIT_BRANCH_NOT_FOUND');}
    return this.#mutate(ctx,{tool:'git_switch_branch',targetRelativePaths:[targetLabel('branch',name)]},async()=>{
      try{await this.#git(ctx.root,['switch','--no-guess',name],{maxBytes:131072,uncertainCode:'BUSINESS_GIT_EFFECT_UNCERTAIN'});}catch(e){throw cleanResultError(e,'BUSINESS_GIT_SWITCH_FAILED');}
      return {projectId:ctx.projectId,branchName:name};
    });
  }
  async stageFiles(args={}){
    const ctx=await this.#context({...args,tool:'git_stage_files',mutation:true});
    if(!Array.isArray(args.paths)||args.paths.length<1||args.paths.length>128)fail('BUSINESS_GIT_PATH_INVALID');
    const paths=[...new Set(args.paths.map(relative))];
    return this.#mutate(ctx,{tool:'git_stage_files',targetRelativePaths:stageAuditTargets(paths)},async()=>{
      try{await this.#git(ctx.root,['add','--',...paths],{maxBytes:131072,uncertainCode:'BUSINESS_GIT_EFFECT_UNCERTAIN'});}catch(e){throw cleanResultError(e,'BUSINESS_GIT_STAGE_FAILED');}
      const diff=await this.#stagedDiff(ctx.root);return {projectId:ctx.projectId,paths,stagedDiffSha256:digest(diff),stagedBytes:diff.length};
    });
  }
  async createCommit(args={}){
    const ctx=await this.#context({...args,tool:'git_create_commit',mutation:true});
    if(typeof args.message!=='string'||args.message.length<1||args.message.length>4096||args.message.includes('\0')||!SHA.test(args.expectedStagedDiffSha256??''))fail('BUSINESS_GIT_COMMIT_INPUT_INVALID');
    const staged=await this.#stagedDiff(ctx.root);if(staged.length===0)fail('BUSINESS_GIT_NOTHING_STAGED');
    const actual=digest(staged);if(actual!==args.expectedStagedDiffSha256)fail('BUSINESS_GIT_STAGED_DIFF_CONFLICT');
    return this.#mutate(ctx,{tool:'git_create_commit',targetRelativePaths:['index'],preconditionDigest:actual},async()=>{
      try{await this.#git(ctx.root,['commit','-m',args.message],{timeoutMs:30000,maxBytes:262144,uncertainCode:'BUSINESS_GIT_EFFECT_UNCERTAIN'});}catch(e){throw cleanResultError(e,'BUSINESS_GIT_COMMIT_FAILED');}
      const oid=text((await this.#git(ctx.root,['rev-parse','HEAD'],{readOnly:true,maxBytes:4096})).stdout).trim();
      return {projectId:ctx.projectId,commitOid:oid,stagedDiffSha256:actual};
    });
  }
  async fetchRemote(args={}){
    const ctx=await this.#context({...args,tool:'git_fetch_remote',mutation:true,remoteOperation:true}),info=await this.#remoteInfo(ctx,args.remoteName??'origin');
    return this.#mutate(ctx,{tool:'git_fetch_remote',targetRelativePaths:[targetLabel('remote',info.name)]},async()=>{
      try{await this.#git(ctx.root,['fetch','--no-tags','--recurse-submodules=no',info.name],{timeoutMs:60000,maxBytes:524288,uncertainCode:'BUSINESS_GIT_REMOTE_UNCERTAIN'});}catch(e){throw cleanResultError(e,'BUSINESS_GIT_FETCH_FAILED');}
      return {projectId:ctx.projectId,remoteName:info.name};
    });
  }
  async pullFfOnly(args={}){
    const ctx=await this.#context({...args,tool:'git_pull_ff_only',mutation:true,remoteOperation:true});
    let upstream;try{upstream=text((await this.#git(ctx.root,['rev-parse','--abbrev-ref','--symbolic-full-name','@{upstream}'],{readOnly:true,maxBytes:4096})).stdout).trim();}catch{fail('BUSINESS_GIT_UPSTREAM_REQUIRED');}
    const slash=upstream.indexOf('/');if(slash<1)fail('BUSINESS_GIT_UPSTREAM_REQUIRED');const remoteName=remote(upstream.slice(0,slash)),remoteBranch=branch(upstream.slice(slash+1));
    await this.#remoteInfo(ctx,remoteName);
    return this.#mutate(ctx,{tool:'git_pull_ff_only',targetRelativePaths:[targetLabel('branch',await this.#currentBranch(ctx.root))]},async()=>{
      try{await this.#git(ctx.root,['pull','--ff-only','--no-rebase','--no-tags','--recurse-submodules=no',remoteName,remoteBranch],{timeoutMs:60000,maxBytes:524288,uncertainCode:'BUSINESS_GIT_REMOTE_UNCERTAIN'});}catch(e){throw cleanResultError(e,'BUSINESS_GIT_PULL_FAILED');}
      const oid=text((await this.#git(ctx.root,['rev-parse','HEAD'],{readOnly:true,maxBytes:4096})).stdout).trim();return {projectId:ctx.projectId,branchName:await this.#currentBranch(ctx.root),commitOid:oid};
    });
  }
  async pushBranch(args={}){
    const ctx=await this.#context({...args,tool:'git_push_branch',mutation:true,remoteOperation:true}),name=args.branchName?branch(args.branchName):await this.#currentBranch(ctx.root),info=await this.#remoteInfo(ctx,args.remoteName??'origin',{push:true});
    try{await this.#git(ctx.root,['show-ref','--verify','--quiet',`refs/heads/${name}`],{readOnly:true,maxBytes:4096});}catch{fail('BUSINESS_GIT_BRANCH_NOT_FOUND');}
    return this.#mutate(ctx,{tool:'git_push_branch',targetRelativePaths:[targetLabel('branch',name),targetLabel('remote',info.name)]},async()=>{
      try{await this.#git(ctx.root,['push','--porcelain',info.name,`refs/heads/${name}:refs/heads/${name}`],{timeoutMs:60000,maxBytes:524288,uncertainCode:'BUSINESS_GIT_REMOTE_UNCERTAIN'});}catch(e){throw cleanResultError(e,'BUSINESS_GIT_PUSH_FAILED');}
      const oid=text((await this.#git(ctx.root,['rev-parse',`refs/heads/${name}`],{readOnly:true,maxBytes:4096})).stdout).trim();return {projectId:ctx.projectId,remoteName:info.name,branchName:name,commitOid:oid};
    });
  }
  async cloneRepository(args={}){
    const authenticatedMemberKey=member(args.authenticatedMemberKey),runtimeNodeId=String(args.runtimeNodeId??''),workspaceRootId=workspace(args.workspaceRootId);
    if(!UUID.test(runtimeNodeId))fail('BUSINESS_RUNTIME_NODE_ID_INVALID');
    if(typeof args.directoryName!=='string'||!/^[A-Za-z0-9._-]{1,255}$/.test(args.directoryName)||['.','..'].includes(args.directoryName)||args.directoryName.endsWith('.lock'))fail('BUSINESS_GIT_CLONE_DIRECTORY_INVALID');
    this.#safeRemoteUrl(args.repositoryUrl);
    const auth=cloneAuthorization(await this.authorizeWorkspaceClone({authenticatedMemberKey,runtimeNodeId,workspaceRootId}),{runtimeNodeId,workspaceRootId});
    assertRuntimeAuthorization({node:auth.node,controlReachable:true,toolName:'git_clone_repository'});
    let root;try{root=realpathSync(auth.workspaceRootPath);}catch{fail('BUSINESS_WORKSPACE_ROOT_UNAVAILABLE');}
    const st=lstatSync(root);if(!st.isDirectory()||st.isSymbolicLink()||resolve(root)==='/')fail('BUSINESS_WORKSPACE_ROOT_UNSAFE');
    await this.#configSafety(root,{remoteOperation:true}).catch(e=>{if(String(e?.message)==='BUSINESS_GIT_REPOSITORY_INVALID')return;throw e;});
    const destination=join(root,args.directoryName);if(existsSync(destination))fail('BUSINESS_DESTINATION_EXISTS');
    const requestId=randomUUID(),base={requestId,authenticatedMemberKey,organizationId:auth.organizationId,projectId:null,runtimeNodeId,mappingRevision:null,
      nodeType:auth.node.nodeType,projectProfile:null,workspaceRootId,tool:'git_clone_repository',effectClass:EFFECT.git_clone_repository,
      targetRelativePaths:[args.directoryName],preconditionDigest:null};
    this.audit.append({...base,stage:'ISSUED',resultCode:'ISSUED',effectOutcome:'PENDING'});
    try{
      try{await run(this.gitBinary,['--literal-pathspecs','-c','core.hooksPath=/dev/null','-c','core.fsmonitor=false','-c','protocol.ext.allow=never','-c',`protocol.file.allow=${this.allowFileProtocolForTests?'always':'never'}`,
        'clone','--no-recurse-submodules','--origin','origin','--',args.repositoryUrl,destination],{cwd:root,timeoutMs:120000,maxBytes:1024*1024,uncertainCode:'BUSINESS_GIT_CLONE_UNCERTAIN'});}catch(e){throw cleanResultError(e,'BUSINESS_GIT_CLONE_FAILED');}
      const cloned=await this.#repo(destination);if(cloned!==realpathSync(destination)||!within(cloned,root))fail('BUSINESS_GIT_CLONE_UNCERTAIN');
      try{this.audit.append({...base,stage:'COMPLETED',resultCode:'OK',effectOutcome:'COMMITTED'});}catch{const e=Error('BUSINESS_LOCAL_AUDIT_UNCERTAIN');e.effect='COMMITTED';e.audit='UNCERTAIN';e.retryable=false;throw e;}
      return {runtimeNodeId,workspaceRootId,directoryName:args.directoryName,cloned:true};
    }catch(error){
      if(String(error?.message)==='BUSINESS_LOCAL_AUDIT_UNCERTAIN')throw error;
      const outcome=error?.effect==='UNCERTAIN'?'UNCERTAIN':existsSync(destination)?'UNCERTAIN':'NONE';
      try{this.audit.append({...base,stage:'FAILED',resultCode:/^[A-Z][A-Z0-9_]{2,79}$/.test(String(error?.message))?String(error.message):'BUSINESS_GIT_CLONE_FAILED',effectOutcome:outcome});}catch{error.audit='UNCERTAIN';}
      throw error;
    }
  }
  async createPullRequest(args={}){
    if(!this.githubBinary)fail('BUSINESS_GITHUB_NOT_CONFIGURED');
    const ctx=await this.#context({...args,tool:'github_create_pull_request',mutation:true,remoteOperation:true});
    if(typeof args.title!=='string'||!args.title.trim()||args.title.length>256||/[\0\r\n]/.test(args.title)||typeof (args.body??'')!=='string'||(args.body??'').length>16384||String(args.body??'').includes('\0'))fail('BUSINESS_GITHUB_PR_INPUT_INVALID');
    const head=args.headBranch?branch(args.headBranch):await this.#currentBranch(ctx.root),base=args.baseBranch?branch(args.baseBranch):null;
    try{await this.#git(ctx.root,['show-ref','--verify','--quiet',`refs/heads/${head}`],{readOnly:true,maxBytes:4096});}catch{fail('BUSINESS_GIT_BRANCH_NOT_FOUND');}
    let remoteName='origin';try{const upstream=text((await this.#git(ctx.root,['rev-parse','--abbrev-ref','--symbolic-full-name',`${head}@{upstream}`],{readOnly:true,maxBytes:4096})).stdout).trim();if(upstream.includes('/'))remoteName=remote(upstream.slice(0,upstream.indexOf('/')));}catch{}
    const info=await this.#remoteInfo(ctx,remoteName,{push:true,githubOnly:true});
    const repoPath=info.parsed.path.replace(/\.git$/,'').replace(/^\//,'');if(!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repoPath))fail('BUSINESS_GITHUB_REMOTE_REQUIRED');
    return this.#mutate(ctx,{tool:'github_create_pull_request',targetRelativePaths:[targetLabel('branch',head),targetLabel('repo',repoPath)]},async()=>{
      const argv=['pr','create','--repo',repoPath,'--title',args.title,'--body',args.body??'','--head',head];if(base)argv.push('--base',base);if(args.draft===true)argv.push('--draft');
      let out;try{out=text((await run(this.githubBinary,argv,{cwd:ctx.root,timeoutMs:60000,maxBytes:262144,uncertainCode:'BUSINESS_GITHUB_PR_UNCERTAIN'})).stdout).trim();}catch(e){throw cleanResultError(e,'BUSINESS_GITHUB_PROVIDER_DENIED');}
      const url=out.split(/\s+/).find(x=>/^https:\/\//.test(x));if(!url)fail('BUSINESS_GITHUB_RESPONSE_INVALID');
      return {projectId:ctx.projectId,headBranch:head,baseBranch:base,draft:args.draft===true,url};
    });
  }
}
