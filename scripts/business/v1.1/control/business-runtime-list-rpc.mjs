const URL=/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i;
const PUB=/^sb_publishable_[A-Za-z0-9_-]{16,}$/;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const fail=code=>{throw Error(code);};

export async function fetchBusinessRuntimeList({
  supabaseUrl,publishableKey,accessToken,fetchImpl=globalThis.fetch,timeoutMs=5000,limit=50
}={}){
  if(typeof supabaseUrl!=='string'||!URL.test(supabaseUrl)||
     typeof publishableKey!=='string'||!PUB.test(publishableKey)||
     typeof accessToken!=='string'||accessToken.length<20||accessToken.length>16384||
     typeof fetchImpl!=='function'||!Number.isInteger(timeoutMs)||timeoutMs<250||timeoutMs>30000||
     !Number.isInteger(limit)||limit<1||limit>50)
    fail('BUSINESS_RUNTIME_LIST_RPC_CONFIG_INVALID');

  const timeout=AbortSignal.timeout(timeoutMs);
  let response;
  try{
    response=await fetchImpl(supabaseUrl.replace(/\/$/,'')+'/rest/v1/rpc/bc_runtime_list',{
      method:'POST',headers:{apikey:publishableKey,Authorization:`Bearer ${accessToken}`,'content-type':'application/json'},
      body:'{}',signal:timeout
    });
  }catch{fail('BUSINESS_RUNTIME_LIST_RPC_UNAVAILABLE');}
  if(!response?.ok)fail(response?.status===401||response?.status===403
    ?'BUSINESS_RUNTIME_LIST_RPC_UNAUTHORIZED':'BUSINESS_RUNTIME_LIST_RPC_UNAVAILABLE');

  let raw;
  try{raw=await response.json();}catch{fail('BUSINESS_RUNTIME_LIST_RPC_INVALID_RESPONSE');}
  if(!raw||typeof raw!=='object'||Array.isArray(raw)||!Array.isArray(raw.nodes)||!Number.isInteger(raw.count))
    fail('BUSINESS_RUNTIME_LIST_RPC_INVALID_RESPONSE');

  const nodes=[];
  for(const x of raw.nodes.slice(0,limit)){
    if(!x||typeof x!=='object'||Array.isArray(x)||!UUID.test(x.nodeId??'')||
       typeof x.nodeName!=='string'||!x.nodeName.trim()||x.nodeName.trim().length>128||
       !['PERSONAL_NODE','SHARED_NODE'].includes(x.nodeType)||x.lifecycle!=='APPROVED'||
       typeof x.ownedByCaller!=='boolean'||typeof x.sharedHostPowerEnabled!=='boolean')
      fail('BUSINESS_RUNTIME_LIST_RPC_INVALID_RESPONSE');
    nodes.push(Object.freeze({
      nodeId:x.nodeId,nodeName:x.nodeName,nodeType:x.nodeType,lifecycle:x.lifecycle,
      ownedByCaller:x.ownedByCaller,sharedHostPowerEnabled:x.sharedHostPowerEnabled,
      ...(typeof x.lastSeenAt==='string'?{lastSeenAt:x.lastSeenAt}:{}),
      ...(typeof x.leaseExpiresAt==='string'?{leaseExpiresAt:x.leaseExpiresAt}:{})
    }));
  }
  return Object.freeze({nodes:Object.freeze(nodes),count:nodes.length});
}
