import assert from 'node:assert/strict';
import {chmodSync,mkdtempSync,mkdirSync,readFileSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomBytes} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {BusinessProjectAuthorizationCache} from './runtime/business-project-authorization-cache.mjs';
import {BusinessV11Operator} from './ops/business-v11-operator.mjs';
import {BusinessV11MaintenancePostgres} from './ops/business-v11-maintenance-postgres.mjs';

const repo=fileURLToPath(new URL('../../../',import.meta.url));
const root=mkdtempSync(join(tmpdir(),'business-bs4c-contract-'));chmodSync(root,0o700);const backups=join(root,'backups');mkdirSync(backups,{mode:0o700});
const org='chatagent-business-v11-bs0',actor='71000000-0000-4000-8000-000000000001';
const emptySnapshot={format:'chatagent-business-continuity-logical-v1',schemaVersion:1,contractVersion:1,organizationSlug:org,
 contextSeq:0,headSha256:'0'.repeat(64),projects:[],privateProjectMembers:[],tasks:[],checkpoints:[],operations:[],events:[],
 counts:{projects:0,privateProjectMembers:0,tasks:0,checkpoints:0,operations:0,events:0}};
let backendUp=true,now=1000000,freshCalls=0;
const key=randomBytes(32);
const cache=new BusinessProjectAuthorizationCache({now:()=>now,ttlMs:60000,loadFresh:async({projectId})=>{
 freshCalls++;if(!backendUp)throw Error('BUSINESS_BACKEND_UNAVAILABLE');return {projectId,authorized:true,projectProfile:'STANDARD',organizationId:org};
}});
try{
 const first=await cache.authorize({authenticatedMemberKey:'oauth-member-a',projectId:'alpha'});assert.equal(first.authorizationSource,'CONTROL_PLANE');
 backendUp=false;now+=1000;const cached=await cache.authorize({authenticatedMemberKey:'oauth-member-a',projectId:'alpha'});assert.equal(cached.authorizationSource,'CACHED_LEASE');
 await assert.rejects(()=>cache.authorize({authenticatedMemberKey:'oauth-member-b',projectId:'alpha'}),/BUSINESS_PROJECT_AUTH_LEASE_EXPIRED/);
 now+=60000;await assert.rejects(()=>cache.authorize({authenticatedMemberKey:'oauth-member-a',projectId:'alpha'}),/BUSINESS_PROJECT_AUTH_LEASE_EXPIRED/);
 backendUp=true;now=2000000;const hardDeny=new BusinessProjectAuthorizationCache({now:()=>now,loadFresh:async()=>{throw Error('BUSINESS_PROJECT_AUTHORIZATION_DENIED');}});
 await assert.rejects(()=>hardDeny.authorize({authenticatedMemberKey:'oauth-member-a',projectId:'alpha'}),/BUSINESS_PROJECT_AUTHORIZATION_DENIED/);
 console.log('PASS project authorization cache falls back only for backend outage, is member/project scoped, bounded and non-persistent');

 const keyStore={read:()=>Buffer.from(key),loadOrCreate:()=>Buffer.from(key)};
 let restored=false,snapshot=structuredClone(emptySnapshot);
 const maintenance={
   async probe(){return {organizationId:org,backupReady:true,restoreReady:true};},
   async inspectTarget(){return restored?{organizationId:org,projects:1,privateMemberships:0,tasks:0,checkpoints:0,operations:0,events:0,contextSeq:0}:
     {organizationId:org,projects:0,privateMemberships:0,tasks:0,checkpoints:0,operations:0,events:0,contextSeq:0};},
   async exportSnapshot(){return structuredClone(snapshot);},
   async restoreEmpty({snapshot:input,actorUserId}){assert.equal(actorUserId,actor);snapshot=structuredClone(input);restored=true;return {integrityVerified:true};}
 };
 let continuityReady=true,runtimeReady=true;
 const op=new BusinessV11Operator({organizationId:org,backupsDir:backups,keyStore,maintenance,
   runtimeProbe:async()=>runtimeReady?{ready:true,status:'READY'}:Promise.reject(Error('LOCAL_DOWN')),
   continuityProbe:async()=>continuityReady?{ready:true,status:'AUTHENTICATED_RPC_READY',organizationId:org}:Promise.reject(Error('BUSINESS_BACKEND_UNAVAILABLE'))});
 let status=await op.status();assert.equal(status.mode,'NORMAL');assert.equal(status.continuityMutation,'AVAILABLE');
 continuityReady=false;status=await op.status();assert.equal(status.mode,'DEGRADED_CONTINUITY');assert.equal(status.localWork,'AVAILABLE');assert.equal(status.continuityMutation,'FAIL_CLOSED');
 const doctor=await op.doctor();assert.equal(doctor.ok,false);assert.equal(doctor.mode,'DEGRADED_CONTINUITY');
 continuityReady=true;
 const backup=await op.backup({name:'contract'});assert.equal(backup.encrypted,true);assert.equal(backup.organizationId,org);assert.match(backup.logicalDigest,/^sha256:/);
 await assert.rejects(()=>op.restore({archiveName:'contract.bcbak',incidentRef:'INC-42',expectedLogicalDigest:backup.logicalDigest,confirmOrganizationId:'wrong',actorUserId:actor}),/BUSINESS_RESTORE_CONFIRMATION_REQUIRED/);
 const restoredReceipt=await op.restore({archiveName:'contract.bcbak',incidentRef:'INC-42',expectedLogicalDigest:backup.logicalDigest,confirmOrganizationId:org,actorUserId:actor});
 assert.equal(restoredReceipt.reconciled,true);assert.equal(restoredReceipt.logicalDigest,backup.logicalDigest);
 await assert.rejects(()=>op.restore({archiveName:'contract.bcbak',incidentRef:'INC-43',expectedLogicalDigest:backup.logicalDigest,confirmOrganizationId:org,actorUserId:actor}),/BUSINESS_RESTORE_TARGET_NOT_EMPTY/);
 console.log('PASS v1.1 Status/Doctor expose NORMAL vs DEGRADED_CONTINUITY and continuity mutation fail-closed state');
 console.log('PASS v1.1 Backup/Restore requires encrypted archive, explicit incident+org+digest confirmation, empty target and post-restore reconciliation');

 assert.throws(()=>new BusinessV11MaintenancePostgres({connectionString:'postgresql://user:pass@example.com/db'}),/BUSINESS_MAINTENANCE_TLS_REQUIRED/);
 assert.doesNotThrow(()=>new BusinessV11MaintenancePostgres({connectionString:'postgresql://user:pass@example.com/db?sslmode=require'}));
 assert.throws(()=>new BusinessV11MaintenancePostgres({connectionString:'postgresql://u:p@127.0.0.1/db'}),/BUSINESS_MAINTENANCE_TLS_REQUIRED/);
 assert.doesNotThrow(()=>new BusinessV11MaintenancePostgres({connectionString:'postgresql://u:p@127.0.0.1/db',allowInsecureLocal:true}));
 console.log('PASS maintenance transport requires TLS remotely and permits insecure PostgreSQL only under explicit localhost test mode');

 for(const wrapper of ['Status','Doctor','Backup','Restore']){
   const text=readFileSync(join(repo,'ops',wrapper+'.command'),'utf8');assert.match(text,/schemaVersion/);assert.match(text,/business-v11-ops-cli\.mjs/);assert.match(text,/business-ops\.mjs/);
 }
 console.log('PASS existing four operator wrappers dispatch schemaVersion=2 to v1.1 while preserving schemaVersion=1 compatibility');
 console.log('BUSINESS_S4C_OPS_CONTRACT=PASS');
}finally{key.fill(0);rmSync(root,{recursive:true,force:true});}
