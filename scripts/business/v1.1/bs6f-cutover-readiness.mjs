#!/usr/bin/env node
// B-S6F evidence worksheet verifier. Read-only. Cannot grant or execute cutover.
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

export const STEPS=Object.freeze([
 'exact-head full regression','GitHub/macOS CI','production Status/Doctor',
 'maintenance window begins','stop v1.0 production','fresh verified source backup',
 'final SQLite logical export','record source counts/revisions/digests',
 'prove production Supabase target state','one-time final import',
 'authenticated readback/export','reconcile IDs/counts/revisions/contextDigest',
 'retire one-time import RPC','install v1.1 artifact','start Gateway/runtime nodes',
 'verify exact published tool contract','TEAM continuity canary',
 'continuity_search_history canary','HOST_USER / process_start_host canary',
 'focused semantic filesystem canary','Git/GitHub semantic canary',
 'multi-node fresh-chat canary','restart persistence','node revoke canary',
 'post-cutover encrypted backup','privately publish updated Business app',
 'post-publish production smoke','merge release PR','tag v1.1.0',
 'publish release artifact','update Product Specification','update User Manual',
 'create DevOps handoff'
]);
export const PR_STACK=Object.freeze([6,7,8,9]);
const ST=new Set(['PASS','PENDING','BLOCKED','NOT_STARTED']);
const REQUIRED=Object.freeze([
 'finalHeadApproval','fullReleaseHostCI','hostedCI','productionStatus','productionDoctor',
 'protectedPRStackPlan','ownerApproval','maintenanceWindowAndRoles',
 'sourceBackupRecoveryPlan','productionSupabaseTargetProof',
 'oneTimeImportReconciliationPlan','restartPersistenceSafetyPlan','rollbackDecisionPlan'
]);
const isObj=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const exact=(obj,keys)=>isObj(obj)&&Object.keys(obj).sort().join('|')===keys.slice().sort().join('|');
export function evaluateCutoverWorksheet(d){
 const errors=[];
 if(!exact(d,['schemaVersion','workUnit','productionCutoverStarted','release','checks','steps']))errors.push('SCHEMA_KEYS');
 if(d?.schemaVersion!==1||d?.workUnit!=='B-S6F')errors.push('SCHEMA_VERSION_PHASE');
 if(d?.productionCutoverStarted!==false)errors.push('UNAUTHORIZED_EXECUTION_OR_INVALID_FLAG');
 const rel=d?.release;
 if(!exact(rel,['currentProductionVersion','candidateHead','pullRequestStack','targetVersion','protectedReleaseBranch']))errors.push('RELEASE_SCHEMA');
 if(rel?.currentProductionVersion!=='1.0.0'||rel?.targetVersion!=='1.1.0'||rel?.protectedReleaseBranch!=='main')errors.push('RELEASE_IDENTITY');
 if(!Array.isArray(rel?.pullRequestStack)||rel.pullRequestStack.join(',')!==PR_STACK.join(','))errors.push('STACK_SEQUENCE');
 if(!/^[0-9a-f]{40}$/.test(rel?.candidateHead??''))errors.push('HEAD_UNPINNED');
 const checks=d?.checks;
 if(!exact(checks,REQUIRED))errors.push('CHECK_SCHEMA');
 for(const k of REQUIRED)if(!ST.has(checks?.[k]))errors.push('INVALID_CHECK_STATUS_'+k);
 if(checks?.ownerApproval==='PASS')errors.push('OWNER_APPROVAL_CANNOT_BE_ASSERTED_BY_WORKSHEET');
 if(!Array.isArray(d?.steps)||d.steps.length!==STEPS.length)errors.push('STEP_COUNT');
 else for(let i=0;i<STEPS.length;i++){
  const s=d.steps[i];
  if(!exact(s,['number','name','status'])||s.number!==i+1||s.name!==STEPS[i]||!ST.has(s.status))
   errors.push('STEP_CONTRACT_'+(i+1));
  if(i>=3&&s.status==='PASS')errors.push('FUTURE_STEP_PRECLAIMED_'+(i+1));
 }
 // Decisions are strictly advisory. Even a fully checked worksheet cannot authorize a live effect.
 const blockers=REQUIRED.filter(k=>checks?.[k]!=='PASS');
 const canReview=errors.length===0&&blockers.length===0&&d.steps.slice(0,3).every(x=>x.status==='PASS');
 return Object.freeze({
  schemaVersion:1,workUnit:'B-S6F',readOnly:true,cutoverExecuted:false,executionAllowed:false,
  structurallyValid:errors.length===0,errors,
  checksPassed:REQUIRED.filter(k=>checks?.[k]==='PASS').length,
  checksTotal:REQUIRED.length,blockers,
  preliminaryVerdict:errors.length?'INVALID_WORKSHEET':canReview?'MANUAL_REVIEW_REQUIRED':'NO_GO_CUTOVER',
  note:'This tool is evidence-only. Final owner approval, live target proof and production cutover are independent actions.'
 });
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const opts=process.argv.slice(2);
 if(opts.length!==1||!opts[0].startsWith('--worksheet=')){console.error('BS6F_WORKSHEET_REQUIRED');process.exit(2);}
 try{
  const file=opts[0].slice('--worksheet='.length);
  if(!file||file==='-')throw Error('BS6F_FILE_REQUIRED');
  const stat=readFileSync(file);
  if(stat.length>65536)throw Error('BS6F_WORKSHEET_TOO_LARGE');
  const result=evaluateCutoverWorksheet(JSON.parse(stat.toString('utf8')));
  console.log(JSON.stringify(result,null,2));
  if(!result.structurallyValid)process.exitCode=3;
 }catch(e){
  console.error('BS6F_WORKSHEET_READ_OR_PARSE_FAILED');
  process.exitCode=2;
 }
}
