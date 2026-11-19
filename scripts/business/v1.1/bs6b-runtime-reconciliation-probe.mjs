#!/usr/bin/env node
// Owner-local read-only runtime reconciliation evidence. Never repairs records.
import {spawnSync} from 'node:child_process';
import {lstatSync,readFileSync,readdirSync,statSync} from 'node:fs';
import {join,isAbsolute} from 'node:path';
const arg=process.argv.find(v=>v.startsWith('--root='));
const root=arg?.slice('--root='.length)??join(process.env.HOME||'','ChatAgentBusiness/production');
if(!isAbsolute(root)){console.error('BS6B_ROOT_ABSOLUTE_REQUIRED');process.exit(2);}
const cmd=(bin,args)=>spawnSync(bin,args,{encoding:'utf8',timeout:5000,maxBuffer:100_000});
const plainFile=p=>{try{const s=lstatSync(p);return s.isFile()&&!s.isSymbolicLink();}catch{return false;}};
const plainDir=p=>{try{const s=lstatSync(p);return s.isDirectory()&&!s.isSymbolicLink();}catch{return false;}};
const json=p=>{try{return plainFile(p)?JSON.parse(readFileSync(p,'utf8')):null;}catch{return null;}};
const config=json(join(root,'operator.json'));
const recordPath=config&&typeof config.runtimeDir==='string'?join(config.runtimeDir,'business-runtime.json'):null;
const record=recordPath?json(recordPath):null;
const wellFormed=Boolean(record&&Number.isInteger(record.pid)&&record.pid>1&&Number.isInteger(record.port)&&typeof record.instanceId==='string'&&
 typeof record.nodeBinary==='string'&&typeof record.serverPath==='string'&&Number.isSafeInteger(record.startedAt));
let processInfo=null;
if(wellFormed){
 const p=cmd('/bin/ps',['-ww','-p',String(record.pid),'-o','uid=','-o','command=']);
 const m=p.status===0?p.stdout.trim().match(/^(\d+)\s+(.*)$/s):null;
 if(m)processInfo={uid:Number(m[1]),sameOwner:Number(m[1])===process.getuid?.(),
 exactIdentity:m[2].includes(record.nodeBinary)&&m[2].includes(record.serverPath)&&m[2].includes('--business-instance='+record.instanceId)};
}
const boot=cmd('/usr/sbin/sysctl',['-n','kern.boottime']);
const epochMatch=boot.status===0?boot.stdout.match(/sec\s*=\s*(\d+)/):null;
const bootEpoch=epochMatch?Number(epochMatch[1]):null;
const previousBoot=wellFormed&&bootEpoch!==null?record.startedAt/1000<bootEpoch:null;
const launch=cmd('/bin/launchctl',['print','gui/'+process.getuid?.()+'/com.chatagent.business.server']);
const launchState=launch.status===0?launch.stdout.match(/\bstate = (not running|running|waiting)\b/)?.[1]??'UNKNOWN':'UNAVAILABLE';
const launchExit=launch.status===0?launch.stdout.match(/\blast exit code = ([0-9]+)\b/)?.[1]??null:null;
const app=async(port,path)=>{
 if(!Number.isInteger(port)||port<1||port>65535)return null;
 try{return (await fetch('http://127.0.0.1:'+port+path,{signal:AbortSignal.timeout(1000)})).status;}
 catch{return null;}
};
const [appStatus,tunnelStatus]=await Promise.all([app(config?.port,'/health'),app(51950,'/healthz')]);
const db=join(root,'state/continuity/memory.sqlite');
const snapshots=join(root,'backups');
const names=plainDir(snapshots)?readdirSync(snapshots,{withFileTypes:true}).filter(v=>v.isDirectory()&&!v.isSymbolicLink()).map(v=>v.name).sort():[];
const sqlitePresent=plainFile(db);
const source=sqlitePresent?statSync(db):null;
let diagnosis='INSUFFICIENT_EVIDENCE';
if(wellFormed&&!processInfo&&previousBoot===true)diagnosis='STALE_AFTER_HOST_REBOOT_CONSISTENT';
else if(wellFormed&&!processInfo)diagnosis='STALE_PROCESS_MISSING';
else if(wellFormed&&processInfo&&!processInfo.exactIdentity)diagnosis='PROCESS_IDENTITY_MISMATCH';
else if(wellFormed&&processInfo?.exactIdentity&&appStatus!==200)diagnosis='PROCESS_RUNNING_APP_UNHEALTHY';
else if(wellFormed&&processInfo?.exactIdentity&&appStatus===200)diagnosis='PROCESS_EXISTS_HEALTH_UNVERIFIED_INSTANCE';
const out={
 schemaVersion:1,phase:'B-S6B',readOnly:true,repairPerformed:false,cutoverPerformed:false,
 authority:'V1_PRODUCTION_OWNER_READ_ONLY',
 runtime:{recordExists:recordPath?plainFile(recordPath):false,recordValid:wellFormed,recordPid:wellFormed?record.pid:null,
  recordPrecedesCurrentBoot:previousBoot,processPresent:processInfo!==null,processIdentityMatched:processInfo?.exactIdentity??false,
  launchAgentState:launchState,launchAgentLastExitCode:launchExit,applicationHealthHttp:appStatus,tunnelHealthHttp:tunnelStatus},
 source:{sqlitePresent,sqliteBytes:source?.size??null,walPresent:plainFile(db+'-wal'),
  shmPresent:plainFile(db+'-shm'),backupSnapshotDirectoryCount:names.length,
  backupSnapshotNames:names},
 diagnosis,verdict:diagnosis==='STALE_AFTER_HOST_REBOOT_CONSISTENT'?'NO_GO_RECONCILIATION_REQUIRED':'NO_GO_OPERATOR_REVIEW_REQUIRED',
 next:'EXPLICIT_APPROVAL_REQUIRED_BEFORE_REVERSIBLE_RECORD_QUARANTINE_OR_PRODUCTION_RESTART'
};
console.log(JSON.stringify(out,null,2));
if(out.verdict.startsWith('NO_GO'))process.exitCode=3;
