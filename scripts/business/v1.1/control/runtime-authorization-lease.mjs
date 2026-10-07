const fail=code=>{throw Error(code);};

const parseExpiry=value=>{
  const ms=typeof value==='number'?value:Date.parse(String(value??''));
  return Number.isFinite(ms)?ms:NaN;
};

export function assertRuntimeAuthorization({
  node,session=null,controlReachable=true,nowMs=Date.now(),toolName=null
}={}){
  if(!node||!['PERSONAL_NODE','SHARED_NODE'].includes(node.nodeType)||
     !['PENDING','APPROVED','REVOKED'].includes(node.lifecycle)||
     typeof controlReachable!=='boolean'||!Number.isFinite(nowMs))
    fail('BUSINESS_RUNTIME_AUTH_INPUT_INVALID');

  if(node.nodeType==='PERSONAL_NODE'&&node.ownedByCaller!==true)
    fail('BUSINESS_PERSONAL_NODE_OWNER_MISMATCH');
  if(node.nodeType==='SHARED_NODE'&&toolName==='process_start_host'&&
     node.sharedHostPowerEnabled!==true)
    fail('BUSINESS_SHARED_HOST_POWER_DENIED');

  if(controlReachable){
    if(node.lifecycle!=='APPROVED')
      fail(node.lifecycle==='REVOKED'?'BUSINESS_RUNTIME_NODE_REVOKED':'BUSINESS_RUNTIME_NODE_PENDING');
    return {authorized:true,source:'CONTROL_PLANE',nodeId:node.nodeId??null};
  }

  if(node.lifecycle!=='APPROVED'||!session||session.sessionState!=='ACTIVE')
    fail('BUSINESS_AUTH_LEASE_EXPIRED');
  const expiry=parseExpiry(session.leaseExpiresAt);
  if(!Number.isFinite(expiry)||expiry<=nowMs)fail('BUSINESS_AUTH_LEASE_EXPIRED');
  return {authorized:true,source:'CACHED_LEASE',nodeId:node.nodeId??null,leaseExpiresAt:session.leaseExpiresAt};
}
