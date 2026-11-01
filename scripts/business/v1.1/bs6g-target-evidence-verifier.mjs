#!/usr/bin/env node
// Evidence validation only. Never connects to a DB, grants authority, or initiates cutover.
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const EXACT=['schemaVersion','workUnit','targetRole','projectInventory','targetProof','approvedByOwner','productionMutationPerformed'];
const INVENTORY=['linkedAccountsChecked','businessStagingState','productionCandidateFound'];
const PROOF=['projectIdentity','projectActive','distinctFromStagingAndPersonal','applicationOrgSlug','controlSchema','continuitySchema','migrationAdmin','emptyTarget','importerPrivilegeIsolation','authenticatedReadbackPlan','runtimeSecretCustody'];
const PROOF_STATES=new Set(['PASS','PENDING','BLOCKED']);
const dict=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const keys=(v,list)=>dict(v)&&Object.keys(v).sort().join(',')===list.slice().sort().join(',');
export function evaluateTargetEvidence(d){
 const errors=[];
 if(!keys(d,EXACT)||d?.schemaVersion!==1||d?.workUnit!=='B-S6G') errors.push('INVALID_EVIDENCE_SCHEMA');
 if(d?.targetRole!=='DEDICATED_BUSINESS_PRODUCTION')errors.push('TARGET_ROLE_INVALID');
 if(d?.approvedByOwner!==false)errors.push('NO_OWNER_APPROVAL_IN_THIS_PROBE');
 if(d?.productionMutationPerformed!==false)errors.push('PRODUCTION_MUTATION_NOT_ALLOWED');
 if(!keys(d?.projectInventory,INVENTORY))errors.push('INVENTORY_SCHEMA');
 if(d?.projectInventory?.linkedAccountsChecked!==2)errors.push('ACCOUNT_INVENTORY_INCOMPLETE');
 if(!['INACTIVE','UNKNOWN'].includes(d?.projectInventory?.businessStagingState))errors.push('STAGING_STATUS_INVALID');
 if(typeof d?.projectInventory?.productionCandidateFound!=='boolean')errors.push('CANDIDATE_FLAG_INVALID');
 if(!keys(d?.targetProof,PROOF))errors.push('PROOF_SCHEMA');
 for(const k of PROOF)if(!PROOF_STATES.has(d?.targetProof?.[k]))errors.push('INVALID_PROOF_STATUS_'+k);
 if(d?.targetProof?.applicationOrgSlug==='PASS'&&!d?.projectInventory?.productionCandidateFound)
  errors.push('ORG_PROOF_WITHOUT_CANDIDATE');
 if(!d?.projectInventory?.productionCandidateFound)
  for(const k of PROOF)if(d?.targetProof?.[k]==='PASS')errors.push('FALSE_PROOF_WITHOUT_PROJECT_'+k);
 const blockers=PROOF.filter(k=>d?.targetProof?.[k]!=='PASS');
 const verified=errors.length===0&&d.projectInventory.productionCandidateFound===true&&blockers.length===0;
 return {
  schemaVersion:1,phase:'B-S6G',readOnly:true,cutoverAuthorized:false,mayImport:false,mayCreateProject:false,
  structurallyValid:errors.length===0,errors,proofsPassed:PROOF.length-blockers.length,totalProofs:PROOF.length,blockers,
  targetIdentityVerdict:verified?'EVIDENCE_COMPLETE_REQUIRES_INDEPENDENT_HUMAN_REVIEW':'NO_GO_TARGET_NOT_VERIFIED'
 };
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const args=process.argv.slice(2);
 if(args.length!==1||!args[0].startsWith('--evidence=')){console.error('B-S6G_EVIDENCE_REQUIRED');process.exit(2);}
 try{
  const source=args[0].slice('--evidence='.length);
  if(!source||source==='-')throw Error('B-S6G_EVIDENCE_INVALID');
  const buffer=readFileSync(source);
  if(buffer.length>32768)throw Error('B-S6G_EVIDENCE_TOO_LARGE');
  const result=evaluateTargetEvidence(JSON.parse(buffer.toString('utf8')));
  console.log(JSON.stringify(result,null,2));
  if(!result.structurallyValid)process.exitCode=3;
 }catch{console.error('B-S6G_EVIDENCE_READ_ERROR');process.exitCode=2;}
}
