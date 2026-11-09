#!/usr/bin/env node
import {spawnSync} from 'node:child_process';

const REPO=/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const BRANCH=/^[A-Za-z0-9._\/-]+$/;
const SHA=/^[a-f0-9]{40}$/i;

function arg(name){
  const prefix=`--${name}=`;
  const value=process.argv.slice(2).find(x=>x.startsWith(prefix));
  return value?value.slice(prefix.length):null;
}
function fail(message){console.error(message);process.exit(2);}
const repo=arg('repo');
const branch=arg('branch')||'main';
const head=arg('head');
if(!repo||!REPO.test(repo))fail('BS5E_REPO_INVALID');
if(!BRANCH.test(branch))fail('BS5E_BRANCH_INVALID');
if(head&&!SHA.test(head))fail('BS5E_HEAD_INVALID');

function ghGet(endpoint){
  const child=spawnSync('gh',['api',endpoint],{encoding:'utf8',env:process.env,maxBuffer:2*1024*1024});
  const stdout=String(child.stdout||'').trim();
  const stderr=String(child.stderr||'').trim();
  let data=null;
  if(stdout){try{data=JSON.parse(stdout);}catch{}}
  return {ok:child.status===0,status:child.status,stdout,stderr,data};
}
function messageOf(r){
  return String(r?.data?.message||r?.stdout||r?.stderr||'').replace(/\s+/g,' ').trim().slice(0,500);
}
function classifyGovernance(r){
  if(r.ok)return {status:'AVAILABLE',message:null};
  const message=messageOf(r);
  if(/Upgrade to GitHub Pro or make this repository public/i.test(message))return {status:'BLOCKED_GITHUB_PRIVATE_PLAN',message};
  return {status:'ERROR',message};
}

const protection=ghGet(`repos/${repo}/branches/${encodeURIComponent(branch)}/protection`);
const rulesets=ghGet(`repos/${repo}/rulesets`);
const actionsPermissions=ghGet(`repos/${repo}/actions/permissions`);
const workflowPermissions=ghGet(`repos/${repo}/actions/permissions/workflow`);

let checkRuns=[];
let annotationMessages=[];
if(head){
  const checks=ghGet(`repos/${repo}/commits/${head}/check-runs?filter=latest&per_page=100`);
  if(checks.ok&&Array.isArray(checks.data?.check_runs)){
    for(const check of checks.data.check_runs){
      const row={id:check.id,name:check.name,status:check.status,conclusion:check.conclusion||null,runnerAssigned:null,annotations:[]};
      const annotations=ghGet(`repos/${repo}/check-runs/${check.id}/annotations`);
      if(annotations.ok&&Array.isArray(annotations.data)){
        row.annotations=annotations.data.map(x=>({level:x.annotation_level||null,message:String(x.message||'').slice(0,500)}));
        annotationMessages.push(...row.annotations.map(x=>x.message));
      }
      checkRuns.push(row);
    }
  }
}

const billingBlocked=annotationMessages.some(x=>/recent account payments have failed|spending limit needs to be increased/i.test(x));
const runnerAcquisitionBlocked=annotationMessages.some(x=>/not acquired by Runner of type hosted/i.test(x));
const macCapacityNotice=annotationMessages.some(x=>/capacity constraints.*macOS arm64/i.test(x));
const hostedCiStatus=billingBlocked?'BLOCKED_GITHUB_BILLING_OR_SPENDING_LIMIT':runnerAcquisitionBlocked?'BLOCKED_HOSTED_RUNNER_ACQUISITION':head&&checkRuns.length&&checkRuns.every(x=>x.conclusion==='success')?'PASS':head?'NOT_PASSING':'NOT_PROBED';

const branchProtection=classifyGovernance(protection);
const repositoryRulesets=classifyGovernance(rulesets);
const protectionPolicy=protection.ok?{
  active:true,
  strictStatusChecks:Boolean(protection.data?.required_status_checks?.strict),
  requiredStatusContexts:Array.isArray(protection.data?.required_status_checks?.contexts)?[...protection.data.required_status_checks.contexts].sort():[],
  requiredApprovingReviewCount:Number(protection.data?.required_pull_request_reviews?.required_approving_review_count||0),
  dismissStaleReviews:Boolean(protection.data?.required_pull_request_reviews?.dismiss_stale_reviews),
  enforceAdmins:Boolean(protection.data?.enforce_admins?.enabled),
  requiredConversationResolution:Boolean(protection.data?.required_conversation_resolution?.enabled),
  requiredLinearHistory:Boolean(protection.data?.required_linear_history?.enabled),
  allowForcePushes:Boolean(protection.data?.allow_force_pushes?.enabled),
  allowDeletions:Boolean(protection.data?.allow_deletions?.enabled)
}:null;
const providerGovernanceReady=Boolean(protectionPolicy?.active&&protectionPolicy.strictStatusChecks&&protectionPolicy.requiredStatusContexts.length>0&&protectionPolicy.requiredApprovingReviewCount>=1&&protectionPolicy.dismissStaleReviews&&protectionPolicy.enforceAdmins&&protectionPolicy.requiredConversationResolution&&protectionPolicy.requiredLinearHistory&&!protectionPolicy.allowForcePushes&&!protectionPolicy.allowDeletions);
const hostedCiReady=hostedCiStatus==='PASS';

const result={
  schemaVersion:1,
  probe:'B-S5E_PROVIDER_GOVERNANCE_HOSTED_CI_READINESS',
  repo,branch,head:head||null,
  readOnly:true,
  providerGovernance:{
    branchProtection,
    protectionPolicy,
    rulesets:repositoryRulesets,
    ready:providerGovernanceReady
  },
  actions:{
    repositoryActionsEnabled:actionsPermissions.ok?Boolean(actionsPermissions.data?.enabled):null,
    allowedActions:actionsPermissions.ok?(actionsPermissions.data?.allowed_actions||null):null,
    defaultWorkflowPermissions:workflowPermissions.ok?(workflowPermissions.data?.default_workflow_permissions||null):null,
    hostedCiStatus,
    billingOrSpendingLimitBlock:billingBlocked,
    hostedRunnerAcquisitionBlock:runnerAcquisitionBlocked,
    macosArm64CapacityNotice:macCapacityNotice,
    checkRuns
  },
  overall:providerGovernanceReady&&hostedCiReady?'READY':'BLOCKED_EXTERNAL_PROVIDER_ACCOUNT_OR_POLICY'
};
console.log(JSON.stringify(result,null,2));
