import pg from 'pg';
const {Client}=pg;

const ORG=/^[a-z0-9][a-z0-9._-]{0,63}$/;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const fail=code=>{throw Error(code);};

function connection(value,{allowInsecureLocal=false}={}){
  if(typeof value!=='string'||value.length<16||value.length>8192||/[\0\r\n]/.test(value))fail('BUSINESS_MAINTENANCE_DATABASE_URL_INVALID');
  let u;try{u=new URL(value);}catch{fail('BUSINESS_MAINTENANCE_DATABASE_URL_INVALID');}
  if(!['postgres:','postgresql:'].includes(u.protocol)||!u.hostname||!u.username)fail('BUSINESS_MAINTENANCE_DATABASE_URL_INVALID');
  const local=['127.0.0.1','localhost','::1'].includes(u.hostname.toLowerCase());
  if(local&&!allowInsecureLocal&&u.searchParams.get('sslmode')!=='require')fail('BUSINESS_MAINTENANCE_TLS_REQUIRED');
  if(!local&&!['require','verify-full'].includes(u.searchParams.get('sslmode')??''))fail('BUSINESS_MAINTENANCE_TLS_REQUIRED');
  return {value,local};
}
function organizationId(value){if(typeof value!=='string'||!ORG.test(value))fail('BUSINESS_MAINTENANCE_ORGANIZATION_INVALID');return value;}
function actor(value){if(typeof value!=='string'||!UUID.test(value))fail('BUSINESS_MAINTENANCE_ACTOR_INVALID');return value;}
function parseJsonValue(row,code){
  const value=row?.value;
  if(value&&typeof value==='object')return value;
  if(typeof value==='string'){try{return JSON.parse(value);}catch{}}
  fail(code);
}

export class BusinessV11MaintenancePostgres{
  constructor({connectionString,allowInsecureLocal=false,timeoutMs=10000,ClientClass=Client}={}){
    const c=connection(connectionString,{allowInsecureLocal});
    if(!Number.isInteger(timeoutMs)||timeoutMs<1000||timeoutMs>60000||typeof ClientClass!=='function')
      fail('BUSINESS_MAINTENANCE_CONFIG_INVALID');
    this.connectionString=c.value;this.local=c.local;this.timeoutMs=timeoutMs;this.ClientClass=ClientClass;
  }
  async #withClient(fn){
    const ssl=this.local?false:{rejectUnauthorized:true};
    const client=new this.ClientClass({connectionString:this.connectionString,ssl,
      connectionTimeoutMillis:this.timeoutMs,query_timeout:this.timeoutMs,statement_timeout:this.timeoutMs,
      application_name:'chatagent-business-v11-maintenance'});
    try{await client.connect();return await fn(client);}catch(error){
      const code=String(error?.message??'');
      if(/^BUSINESS_[A-Z0-9_]{3,80}$/.test(code))throw error;
      fail('BUSINESS_MAINTENANCE_DATABASE_UNAVAILABLE');
    }finally{try{await client.end();}catch{}}
  }
  async probe({organizationId:org}={}){
    org=organizationId(org);
    return this.#withClient(async client=>{
      const r=await client.query(`select o.slug as organization_id,
        exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private_business_continuity' and p.proname='_backup_export') as backup_ready,
        exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private_business_continuity' and p.proname='_restore_empty') as restore_ready
        from private_business_control.organizations o where o.slug=$1`,[org]);
      if(r.rowCount!==1)fail('BUSINESS_MAINTENANCE_ORGANIZATION_MISMATCH');
      return {organizationId:r.rows[0].organization_id,backupReady:r.rows[0].backup_ready===true,restoreReady:r.rows[0].restore_ready===true};
    });
  }
  async inspectTarget({organizationId:org}={}){
    org=organizationId(org);
    return this.#withClient(async client=>{
      const r=await client.query(`select o.slug as organization_id,
        (select count(*)::int from private_business_control.logical_projects p where p.organization_id=o.id) as projects,
        (select count(*)::int from private_business_control.private_project_members p where p.organization_id=o.id) as private_memberships,
        (select count(*)::int from private_business_continuity.tasks t where t.organization_id=o.id) as tasks,
        (select count(*)::int from private_business_continuity.checkpoints c where c.organization_id=o.id) as checkpoints,
        (select count(*)::int from private_business_continuity.operations x where x.organization_id=o.id) as operations,
        (select count(*)::int from private_business_continuity.events e where e.organization_id=o.id) as events,
        coalesce((select context_seq from private_business_continuity.continuity_state s where s.organization_id=o.id),0)::bigint::text as context_seq
        from private_business_control.organizations o where o.slug=$1`,[org]);
      if(r.rowCount!==1)fail('BUSINESS_MAINTENANCE_ORGANIZATION_MISMATCH');
      const row=r.rows[0];return {organizationId:row.organization_id,projects:row.projects,privateMemberships:row.private_memberships,
        tasks:row.tasks,checkpoints:row.checkpoints,operations:row.operations,events:row.events,contextSeq:Number(row.context_seq)};
    });
  }
  async exportSnapshot({organizationId:org}={}){
    org=organizationId(org);
    return this.#withClient(async client=>{
      const r=await client.query(`select private_business_continuity._backup_export($1)::text as value`,[org]);
      if(r.rowCount!==1)fail('BUSINESS_BACKUP_EXPORT_FAILED');
      return parseJsonValue(r.rows[0],'BUSINESS_BACKUP_EXPORT_FAILED');
    });
  }
  async restoreEmpty({snapshot,actorUserId}={}){
    actorUserId=actor(actorUserId);
    if(!snapshot||typeof snapshot!=='object'||Array.isArray(snapshot))fail('BUSINESS_RESTORE_SNAPSHOT_INVALID');
    return this.#withClient(async client=>{
      const r=await client.query(`select private_business_continuity._restore_empty($1::jsonb,$2::uuid)::text as value`,[JSON.stringify(snapshot),actorUserId]);
      if(r.rowCount!==1)fail('BUSINESS_RESTORE_FAILED');
      return parseJsonValue(r.rows[0],'BUSINESS_RESTORE_FAILED');
    });
  }
}
