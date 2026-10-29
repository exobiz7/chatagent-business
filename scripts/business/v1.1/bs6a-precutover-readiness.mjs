#!/usr/bin/env node
// Read-only B-S6A evidence acquisition. NEVER initiates cutover or recovery.
import {spawnSync} from 'node:child_process';
import {readFileSync,existsSync,lstatSync} from 'node:fs';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('../../../',import.meta.url));
const expected=process.argv.find(x=>x.startsWith('--head='))?.slice(7);
if(!/^[a-f0-9]{40}$/.test(expected??'')){console.error('BS6A_EXACT_HEAD_REQUIRED');process.exit(2);}
const run=(bin,args,cwd=root)=>{
 const r=spawnSync(bin,args,{cwd,encoding:'utf8',timeout:15000,maxBuffer:1024*1024});
 return {ok:r.status===0,text:String(r.stdout||'').trim(),error:r.error?.code||null};
};
const json=r=>{try{return r.ok?JSON.parse(r.text):null;}catch{return null;}};
const gh=(path)=>json(run('gh',['api',path]));
const repo='exobiz7/chatagent-business';
const canary='exobiz7/chatagent-business-v11-canary';
const branch='feat/business-v1.1-bs3-runtime-routing';
const local=run('git',['rev-parse','HEAD']).text;
const remote=run('git',['rev-parse','origin/'+branch]).text;
const dirty=run('git',['status','--porcelain']).text!=='';
const v1tag=run('git',['rev-list','-n','1','v1.0.0']);
const s5=JSON.parse(readFileSync(join(root,'docs/verification/v1.1/B_S5_GATE_STATE_20261012.json'),'utf8'));
const mandatory=['BUSINESS_S5_DISTRIBUTED_TEAM_E2E','BUSINESS_S5_REMOTE_COLLAB','BUSINESS_S5_NODE_SECURITY','BUSINESS_S5_FAILURE_RECOVERY','BUSINESS_S5_OPENAI_TOOL_BEHAVIOR'];
const s5ok=s5.status==='B_S5_ACCEPTED_CLOSED'&&mandatory.every(k=>s5.gates[k]==='PASS');
const protection=(r,context)=>{
 const x=gh('repos/'+r+'/branches/main/protection');
 const checks=x?.required_status_checks||{};
 return Boolean(checks.strict&&(checks.contexts||[]).includes(context)&&x?.enforce_admins?.enabled===true&&
 x?.required_pull_request_reviews?.required_approving_review_count>=1&&
 x?.required_pull_request_reviews?.dismiss_stale_reviews===true&&
 x?.allow_force_pushes?.enabled===false&&x?.allow_deletions?.enabled===false&&
 x?.required_conversation_resolution?.enabled===true);
};
const canonicalProtected=protection(repo,'standalone');
const canaryProtected=protection(canary,'provider-guard');
const ci=gh('repos/'+repo+'/commits/'+expected+'/check-runs?per_page=100');
const checks=(ci?.check_runs||[]).filter(x=>x.name==='standalone');
const hostedPassed=checks.length>=2&&checks.every(x=>x.status==='completed'&&x.conclusion==='success');
const pr=json(run('gh',['pr','view','9','--repo',repo,'--json','state,isDraft,headRefOid,baseRefName,headRefName']));
const prFrozen=pr?.state==='OPEN'&&pr.isDraft===true&&pr.headRefOid===expected&&
 pr.headRefName===branch;
const home=process.env.HOME||'';
const prodRoot=join(home,'ChatAgentBusiness/production');
const config=join(prodRoot,'operator.json'),ops=join(prodRoot,'app/scripts/business/business-ops.mjs');
let status=null;
if(existsSync(config)&&existsSync(ops)){
 try{
  const c=JSON.parse(readFileSync(config,'utf8'));
  if(typeof c.nodeBinary==='string'&&c.nodeBinary.startsWith('/')){
   const r=spawnSync(c.nodeBinary,[ops,'status'],{cwd:root,env:{...process.env,CHATAGENT_BUSINESS_OPERATOR_CONFIG:config},encoding:'utf8',timeout:8000,maxBuffer:65536});
   status=json({ok:r.status===0,text:String(r.stdout||'')});
  }
 }catch{}
}

const sqlite=join(prodRoot,'state/continuity/memory.sqlite');
const sqlitePresent=existsSync(sqlite)&&lstatSync(sqlite).isFile()&&!lstatSync(sqlite).isSymbolicLink();
const productionHealthy=status?.state==='RUNNING'&&status.healthy===true;
const http=async(port)=>{
 try{const r=await fetch('http://127.0.0.1:'+port+'/healthz',{signal:AbortSignal.timeout(1200)});return r.status;}catch{return null;}
};
const [tunnelHttp,stagingHttp]=await Promise.all([http(51950),http(31861)]);
const prodPort=(await http(31850))!==null;
const staticReady=local===expected&&remote===expected&&!dirty&&v1tag.ok&&s5ok&&canonicalProtected&&canaryProtected&&hostedPassed&&prFrozen;
const findings=[
 ...(!staticReady?['EXACT_HEAD_OR_GOVERNANCE_PREREQUISITE_NOT_READY']:[]),
 ...(!productionHealthy?['V1_PRODUCTION_RUNTIME_NOT_HEALTHY']:[]),
 ...(!prodPort?['V1_PRODUCTION_APPLICATION_UNREACHABLE']:[]),
 ...(!sqlitePresent?['V1_SQLITE_SOURCE_NOT_VERIFIED']:[])
];
const out={
 schemaVersion:1,phase:'B-S6A',operation:'READ_ONLY_PRE_CUTOVER',cutoverExecuted:false,
 expectedHead:expected,actualHead:local,originHead:remote,worktreeClean:!dirty,
 v1TagPresent:v1tag.ok,bS5Closed:s5ok,
 provider:{canonicalMainProtected:canonicalProtected,canaryMainProtected:canaryProtected,hostedCheckSuccessCount:checks.filter(x=>x.conclusion==='success').length,hostedChecksPassed:hostedPassed,releasePrOpenDraft:prFrozen},
 production:{operatorStatus:status?.state??'UNAVAILABLE',healthy:productionHealthy,appPortResponding:prodPort,tunnelHealthHttp:tunnelHttp,stagingHealthHttp:stagingHttp,sourceSqliteFilePresent:sqlitePresent},
 evidence:{staticReady,productionStatusReady:productionHealthy,doctorNotExecuted:true,freshBackupNotExecuted:true,targetImportNotExecuted:true,releaseTagNotCreated:true},
 blockers:findings,
 verdict:findings.length===0?'PRECHECKS_ELIGIBLE_NOT_CUTOVER_AUTHORIZED':'NO_GO',
 pending:['PRODUCTION_DOCTOR_WITH_OWNER_APPROVAL','FRESH_VERIFIED_SOURCE_BACKUP_DURING_WINDOW',
 'SOURCE_EXPORT_COUNTS_DIGESTS','EMPTY_SUPABASE_TARGET_PROOF','ONE_TIME_IMPORT_AND_RECONCILIATION',
 'ARTIFACT_AND_RUNTIME_RESTART','POST_CUTOVER_CANARY_AND_BACKUP','EXPLICIT_CUTOVER_AUTHORIZATION']
};
console.log(JSON.stringify(out,null,2));
if(out.verdict!=='PRECHECKS_ELIGIBLE_NOT_CUTOVER_AUTHORIZED')process.exitCode=3;
