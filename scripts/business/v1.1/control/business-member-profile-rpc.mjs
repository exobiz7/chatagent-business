const URL=/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i;
const PUB=/^sb_publishable_[A-Za-z0-9_-]{16,}$/;
const fail=code=>{throw Error(code);};

export async function fetchBusinessMemberProfile({
  supabaseUrl,publishableKey,accessToken,fetchImpl=globalThis.fetch,timeoutMs=5000
}={}){
  if(typeof supabaseUrl!=='string'||!URL.test(supabaseUrl)||
     typeof publishableKey!=='string'||!PUB.test(publishableKey)||
     typeof accessToken!=='string'||accessToken.length<20||accessToken.length>16384||
     typeof fetchImpl!=='function'||!Number.isInteger(timeoutMs)||timeoutMs<250||timeoutMs>30000)
    fail('BUSINESS_PROFILE_RPC_CONFIG_INVALID');

  const timeout=AbortSignal.timeout(timeoutMs);
  let response;
  try{
    response=await fetchImpl(supabaseUrl.replace(/\/$/,'')+'/rest/v1/rpc/bc_member_profile',{
      method:'POST',
      headers:{
        apikey:publishableKey,
        Authorization:`Bearer ${accessToken}`,
        'content-type':'application/json'
      },
      body:'{}',signal:timeout
    });
  }catch{fail('BUSINESS_PROFILE_RPC_UNAVAILABLE');}
  if(!response?.ok)fail(response?.status===401||response?.status===403
    ?'BUSINESS_PROFILE_RPC_UNAUTHORIZED':'BUSINESS_PROFILE_RPC_UNAVAILABLE');

  let raw;
  try{raw=await response.json();}catch{fail('BUSINESS_PROFILE_RPC_INVALID_RESPONSE');}
  if(!raw||typeof raw!=='object'||Array.isArray(raw)||
     typeof raw.id!=='string'||!/^prf_[0-9a-f]{32}$/.test(raw.id))
    fail('BUSINESS_PROFILE_RPC_INVALID_RESPONSE');

  const profile={id:raw.id};
  if(typeof raw.name==='string'&&raw.name.trim())profile.name=raw.name;
  if(typeof raw.email==='string'&&raw.email.includes('@'))profile.email=raw.email;
  if(typeof raw.nickname==='string'&&raw.nickname.trim())profile.nickname=raw.nickname;
  return Object.freeze(profile);
}
