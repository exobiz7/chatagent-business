const KEY=/^sb_publishable_[A-Za-z0-9_-]{16,}$/;
const fail=code=>{throw Error(code);};

export function createBusinessContinuityRpcSession({supabaseUrl,publishableKey,accessToken,fetchImpl=fetch,timeoutMs=8000}={}){
  const base=String(supabaseUrl??'').replace(/\/$/,'');
  if(!/^https:\/\/[^/]+\.supabase\.co$/.test(base)||!KEY.test(publishableKey??'')||typeof accessToken!=='string'||!accessToken)
    fail('BUSINESS_CONTINUITY_CONFIG_INVALID');
  return {
    async ensureSession(){return {access_token:accessToken};},
    async rpc(name,args={}){
      if(!/^bc_[a-z0-9_]{3,80}$/.test(name))return {data:null,error:{message:'BUSINESS_RPC_NAME_INVALID'}};
      try{
        const response=await fetchImpl(`${base}/rest/v1/rpc/${name}`,{
          method:'POST',headers:{'content-type':'application/json',apikey:publishableKey,authorization:`Bearer ${accessToken}`},
          body:JSON.stringify(args),signal:AbortSignal.timeout(timeoutMs)
        });
        const raw=await response.text(); let body=null;
        try{body=raw?JSON.parse(raw):null;}catch{body=null;}
        if(!response.ok)return {data:null,error:{message:String(body?.message||body?.error||`BUSINESS_RPC_HTTP_${response.status}`)}};
        return {data:body,error:null};
      }catch{return {data:null,error:{message:'BUSINESS_BACKEND_UNAVAILABLE'}};}
    }
  };
}
