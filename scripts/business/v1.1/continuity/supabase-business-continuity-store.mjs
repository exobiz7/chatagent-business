import {assertContinuitySafe} from './sensitive-text-guard.mjs';
import {assembleBusinessHandoff,applyBusinessFreshness,unavailableBusinessContext} from './business-handoff-context.mjs';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PROJECT=/^[a-z0-9][a-z0-9._-]{0,63}$/;
const fail=code=>{throw Error(code);};
const rpcCode=error=>{
  const message=String(error?.message??'');
  const match=message.match(/BUSINESS_[A-Z0-9_]{3,80}/);
  return match?.[0]??'BUSINESS_BACKEND_UNAVAILABLE';
};
const text=(v,min,max)=>typeof v==='string'&&v.trim().length>=min&&v.length<=max?v.trim():fail('BUSINESS_CONTINUITY_INPUT_INVALID');
const arr=(v,max=32)=>{
  if(v===undefined||v===null)return [];
  if(!Array.isArray(v)||v.length>max||v.some(x=>typeof x!=='string'||!x.trim()||x.length>1024))fail('BUSINESS_CONTINUITY_INPUT_INVALID');
  return v.map(x=>x.trim());
};
const uuid=v=>UUID.test(v??'')?v:fail('BUSINESS_CONTINUITY_INPUT_INVALID');
const project=v=>PROJECT.test(v??'')?v:fail('BUSINESS_CONTINUITY_INPUT_INVALID');

export class SupabaseBusinessContinuityStore{
  constructor({authSession}={}){
    if(!authSession||typeof authSession.ensureSession!=='function'||typeof authSession.rpc!=='function')
      fail('BUSINESS_CONTINUITY_CONFIG_INVALID');
    this.authSession=authSession;
  }
  async rpc(name,args){
    await this.authSession.ensureSession();
    const {data,error}=await this.authSession.rpc(name,args);
    if(error)fail(rpcCode(error));
    return data;
  }
  taskStart({projectId,objective,operationId,assignedToUserId=null,tags=[]}={}){
    const input={projectId:project(projectId),objective:text(objective,1,4096),operationId:uuid(operationId),
      assignedToUserId:assignedToUserId===null?null:uuid(assignedToUserId),tags:arr(tags,32)};
    assertContinuitySafe(input);
    return this.rpc('bc_task_start',{p_project_key:input.projectId,p_objective:input.objective,p_operation_id:input.operationId,
      p_assigned_to_user_id:input.assignedToUserId,p_tags:input.tags});
  }
  checkpointAppend({projectId,taskId,expectedTaskRevision,summary,currentState,operationId,nextActions=[],verification=null,
    decisions=[],facts=[],artifacts=[],sourceRuntimeNodeId=null}={}){
    if(!Number.isSafeInteger(expectedTaskRevision)||expectedTaskRevision<0)fail('BUSINESS_CONTINUITY_INPUT_INVALID');
    const input={projectId:project(projectId),taskId:uuid(taskId),expectedTaskRevision,
      summary:text(summary,1,4096),currentState:text(currentState,1,8192),operationId:uuid(operationId),
      nextActions:arr(nextActions),verification:verification===null?null:text(verification,1,4096),decisions:arr(decisions),facts:arr(facts),artifacts:arr(artifacts),
      sourceRuntimeNodeId:sourceRuntimeNodeId===null?null:uuid(sourceRuntimeNodeId)};
    assertContinuitySafe(input);
    return this.rpc('bc_checkpoint_append',{p_project_key:input.projectId,p_task_id:input.taskId,p_expected_task_revision:expectedTaskRevision,
      p_summary:input.summary,p_current_state:input.currentState,p_operation_id:input.operationId,p_next_actions:input.nextActions,
      p_verification:input.verification,p_decisions:input.decisions,p_facts:input.facts,p_artifacts:input.artifacts,
      p_source_runtime_node_id:input.sourceRuntimeNodeId});
  }
  taskGet({projectId,taskId}={}){
    return this.rpc('bc_task_get',{p_project_key:project(projectId),p_task_id:uuid(taskId)});
  }
  taskComplete({projectId,taskId,expectedTaskRevision,operationId}={}){
    if(!Number.isSafeInteger(expectedTaskRevision)||expectedTaskRevision<0)fail('BUSINESS_CONTINUITY_INPUT_INVALID');
    return this.rpc('bc_task_complete',{p_project_key:project(projectId),p_task_id:uuid(taskId),
      p_expected_task_revision:expectedTaskRevision,p_operation_id:uuid(operationId)});
  }
  projectContext({projectId,limit=10}={}){
    if(!Number.isSafeInteger(limit)||limit<1||limit>20)fail('BUSINESS_CONTINUITY_INPUT_INVALID');
    return this.rpc('bc_project_context',{p_project_key:project(projectId),p_limit:limit});
  }
  historySearch({projectId,query,limit=10}={}){
    if(!Number.isSafeInteger(limit)||limit<1||limit>20)fail('BUSINESS_CONTINUITY_INPUT_INVALID');
    const normalized=text(query,1,128);
    return this.rpc('bc_history_search',{p_project_key:project(projectId),p_query:normalized,p_limit:limit});
  }
  exportSnapshot({projectId}={}){
    return this.rpc('bc_export_snapshot',{p_project_key:project(projectId)});
  }
  async prepareHandoff({projectId,taskId}={}){
    projectId=project(projectId);taskId=uuid(taskId);
    try{
      const [profile,taskResult]=await Promise.all([
        this.rpc('bc_member_profile',{}),this.taskGet({projectId,taskId})
      ]);
      const pkg=assembleBusinessHandoff({organizationId:profile?.organizationSlug,taskResult});
      return applyBusinessFreshness(pkg,null);
    }catch(error){
      if(String(error?.message)==='BUSINESS_BACKEND_UNAVAILABLE')
        return unavailableBusinessContext({projectId,taskId});
      throw error;
    }
  }
  async getContext({projectId,taskId=null,expectedContextDigest=null,limit=10}={}){
    projectId=project(projectId);
    if(taskId===null||taskId===undefined){
      if(expectedContextDigest!==null&&expectedContextDigest!==undefined)fail('BUSINESS_CONTINUITY_INPUT_INVALID');
      try{
        const context=await this.projectContext({projectId,limit});
        if(context?.integrityVerified===false)return {
          ...unavailableBusinessContext({projectId}),freshnessReason:'CONTINUITY_INTEGRITY_UNVERIFIED',
          recentTasks:[],contextSeq:context.contextSeq??null
        };
        return {...context,freshness:'FRESH',freshnessReason:'CURRENT_AUTHORITY_READ',contextOnly:true,authority:'NONE'};
      }catch(error){
        if(String(error?.message)==='BUSINESS_BACKEND_UNAVAILABLE')
          return {...unavailableBusinessContext({projectId}),recentTasks:[]};
        throw error;
      }
    }
    taskId=uuid(taskId);
    try{
      const [profile,taskResult]=await Promise.all([
        this.rpc('bc_member_profile',{}),this.taskGet({projectId,taskId})
      ]);
      return applyBusinessFreshness(assembleBusinessHandoff({organizationId:profile?.organizationSlug,taskResult}),expectedContextDigest);
    }catch(error){
      if(String(error?.message)==='BUSINESS_BACKEND_UNAVAILABLE')
        return unavailableBusinessContext({projectId,taskId});
      throw error;
    }
  }
}
