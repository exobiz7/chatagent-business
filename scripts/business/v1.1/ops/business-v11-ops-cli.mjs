#!/usr/bin/env node
import {spawnSync} from 'node:child_process';
import {realpathSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {loadBusinessV11OperatorConfig} from './business-v11-operator-config.mjs';
import {BusinessV11MaintenancePostgres} from './business-v11-maintenance-postgres.mjs';
import {BusinessV11Operator} from './business-v11-operator.mjs';
import {loadBusinessSupabaseConfig} from '../control/supabase-runtime-config.mjs';
import {MacKeychainRefreshTokenStore} from '../control/keychain-refresh-token-store.mjs';
import {MacKeychainBackupKeyStore} from '../control/keychain-backup-key-store.mjs';
import {BusinessSupabaseAuthSession} from '../control/supabase-auth-session.mjs';

const fail=code=>{throw Error(code);};

function maintenanceFromEnvironment(cfg){
  const client=()=>{
    const connectionString=process.env[cfg.maintenanceDatabaseUrlEnv];
    if(typeof connectionString!=='string'||!connectionString)fail('BUSINESS_MAINTENANCE_DATABASE_URL_REQUIRED');
    return new BusinessV11MaintenancePostgres({connectionString,
      allowInsecureLocal:process.env.BUSINESS_V11_MAINTENANCE_ALLOW_INSECURE_LOCAL==='1'});
  };
  return Object.freeze({
    probe:args=>client().probe(args),
    inspectTarget:args=>client().inspectTarget(args),
    exportSnapshot:args=>client().exportSnapshot(args),
    restoreEmpty:args=>client().restoreEmpty(args)
  });
}
function nodeProbe(cfg){
  return ()=>{
    const r=spawnSync(cfg.nodeBinary,['-v'],{encoding:'utf8',timeout:5000,stdio:['ignore','pipe','pipe']});
    if(r.status!==0)fail('BUSINESS_V11_NODE_UNAVAILABLE');
    const version=r.stdout.trim();if(version!==cfg.expectedNodeVersion)fail('BUSINESS_V11_NODE_VERSION_MISMATCH');
    const actualRepo=realpathSync(fileURLToPath(new URL('../../../../',import.meta.url)));
    if(realpathSync(cfg.repoRoot)!==actualRepo)fail('BUSINESS_V11_REPO_IDENTITY_MISMATCH');
    return version;
  };
}
function runtimeProbe(cfg){
  return async()=>{
    const r=await fetch(cfg.runtimeHealthUrl,{signal:AbortSignal.timeout(1200)});
    if(!r.ok)fail('BUSINESS_V11_LOCAL_RUNTIME_UNAVAILABLE');
    const body=await r.json();
    if(!body||typeof body!=='object')fail('BUSINESS_V11_LOCAL_RUNTIME_UNAVAILABLE');
    return {ready:true,status:body.status==='live'||body.ready===true?'READY':'RESPONDING'};
  };
}
function continuityProbe(authSession,cfg){
  return async()=>{
    await authSession.ensureSession();
    const {data,error}=await authSession.rpc('bc_schema_status',{});
    if(error||!data||data.organizationSlug!==cfg.organizationId)fail(error?'BUSINESS_BACKEND_UNAVAILABLE':'BUSINESS_V11_ORGANIZATION_MISMATCH');
    return {ready:true,status:'AUTHENTICATED_RPC_READY',organizationId:data.organizationSlug,schemaVersion:data.schemaVersion,contractVersion:data.contractVersion};
  };
}

export function createBusinessV11OperatorFromConfig(configPath){
  const cfg=loadBusinessV11OperatorConfig(configPath),authCfg=loadBusinessSupabaseConfig(cfg.authConfigPath);
  const tokenStore=new MacKeychainRefreshTokenStore({binary:authCfg.keychainHelper,binarySha256:authCfg.keychainHelperSha256,
    service:authCfg.keychainService,account:authCfg.projectRef});
  const authSession=new BusinessSupabaseAuthSession({url:authCfg.url,publishableKey:authCfg.publishableKey,tokenStore});
  const keyStore=new MacKeychainBackupKeyStore({binary:authCfg.keychainHelper,binarySha256:authCfg.keychainHelperSha256,
    account:cfg.organizationId,service:cfg.backupKeyService});
  const maintenance=maintenanceFromEnvironment(cfg);
  return new BusinessV11Operator({organizationId:cfg.organizationId,backupsDir:cfg.backupsDir,keyStore,maintenance,
    runtimeProbe:runtimeProbe(cfg),continuityProbe:continuityProbe(authSession,cfg),nodeVersionProbe:nodeProbe(cfg)});
}

async function main(){
  const configPath=process.env.CHATAGENT_BUSINESS_OPERATOR_CONFIG;
  if(typeof configPath!=='string'||!configPath)fail('BUSINESS_V11_OPS_CONFIG_REQUIRED');
  const command=process.argv[2],args=process.argv.slice(3),operator=createBusinessV11OperatorFromConfig(configPath);
  let result;
  if(command==='status')result=await operator.status();
  else if(command==='doctor')result=await operator.doctor();
  else if(command==='backup')result=await operator.backup({name:args[0]??null});
  else if(command==='restore')result=await operator.restore({archiveName:args[0],incidentRef:args[1],expectedLogicalDigest:args[2],confirmOrganizationId:args[3],actorUserId:args[4]});
  else fail('BUSINESS_V11_OPS_COMMAND_INVALID');
  process.stdout.write(JSON.stringify(result,null,2)+'\n');
  if(command==='doctor'&&result.ok!==true)process.exitCode=2;
}
if(process.argv[1]&&resolve(process.argv[1])===resolve(fileURLToPath(import.meta.url))){
  main().catch(error=>{process.stderr.write(JSON.stringify({success:false,code:String(error?.message??'BUSINESS_V11_OPS_FAILED'),
    ...(error?.effect?{effect:error.effect}:{}),...(error?.retryable===false?{retryable:false}:{})})+'\n');process.exitCode=1;});
}
