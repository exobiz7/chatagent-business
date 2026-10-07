const fail=code=>{throw Error(code);};
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const rpcCode=error=>{
  const message=String(error?.message??'');
  const match=message.match(/BUSINESS_[A-Z0-9_]{3,80}/);
  return match?.[0]??'BUSINESS_BACKEND_UNAVAILABLE';
};

const cleanNodeName=value=>{
  if(typeof value!=='string'||!value.trim()||value.trim().length>128)
    fail('BUSINESS_RUNTIME_INPUT_INVALID');
  return value.trim();
};

export class BusinessRuntimeRegistry {
  constructor({authSession}={}){
    if(!authSession||typeof authSession.ensureSession!=='function'||typeof authSession.rpc!=='function')
      fail('BUSINESS_RUNTIME_REGISTRY_CONFIG_INVALID');
    this.authSession=authSession;
  }
  async rpc(name,args={}){
    await this.authSession.ensureSession();
    const {data,error}=await this.authSession.rpc(name,args);
    if(error)fail(rpcCode(error));
    return data;
  }
  enroll({nodeId,nodeName,nodeType='PERSONAL_NODE',operationId,approve=false,sharedHostPowerEnabled=false}={}){
    if(!UUID.test(nodeId??'')||!UUID.test(operationId??'')||
       !['PERSONAL_NODE','SHARED_NODE'].includes(nodeType)||
       typeof approve!=='boolean'||typeof sharedHostPowerEnabled!=='boolean')
      fail('BUSINESS_RUNTIME_INPUT_INVALID');
    return this.rpc('bc_runtime_enroll',{
      p_node_id:nodeId,
      p_node_name:cleanNodeName(nodeName),
      p_node_type:nodeType,
      p_operation_id:operationId,
      p_approve:approve,
      p_shared_host_power_enabled:sharedHostPowerEnabled
    });
  }
  status(nodeId){
    if(!UUID.test(nodeId??''))fail('BUSINESS_RUNTIME_INPUT_INVALID');
    return this.rpc('bc_runtime_status',{p_node_id:nodeId});
  }
  list(){return this.rpc('bc_runtime_list',{});}
  revoke({nodeId,operationId}={}){
    if(!UUID.test(nodeId??'')||!UUID.test(operationId??''))
      fail('BUSINESS_RUNTIME_INPUT_INVALID');
    return this.rpc('bc_runtime_revoke',{p_node_id:nodeId,p_operation_id:operationId});
  }
}
