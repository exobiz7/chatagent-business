import {createClient} from '@supabase/supabase-js';

const fail=code=>{throw Error(code);};
const URL=/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i;
const PUB=/^sb_publishable_[A-Za-z0-9_-]{16,}$/;

const authError=error=>{
  const status=Number(error?.status??0);
  if(status===400||status===401||status===403)return 'BUSINESS_AUTH_REQUIRED';
  return 'BUSINESS_BACKEND_UNAVAILABLE';
};

const validTokenPair=session=>session&&typeof session.access_token==='string'&&
  session.access_token.length>20&&typeof session.refresh_token==='string'&&
  session.refresh_token.length>=1&&session.refresh_token.length<=16384;

const normalizeSession=(session,nowSeconds)=>{
  if(!validTokenPair(session))fail('BUSINESS_SESSION_INVALID');
  let expiresAt=session.expires_at;
  if(!Number.isFinite(expiresAt)){
    if(!Number.isFinite(session.expires_in)||session.expires_in<=0)
      fail('BUSINESS_SESSION_INVALID');
    expiresAt=nowSeconds+Math.floor(session.expires_in);
  }
  return session.expires_at===expiresAt?session:{...session,expires_at:expiresAt};
};

const validSession=session=>validTokenPair(session)&&Number.isFinite(session.expires_at);
const boundedFetch=(fetchImpl,timeoutMs)=>(input,init={})=>{
  const timeout=AbortSignal.timeout(timeoutMs);
  const signal=init.signal?AbortSignal.any([init.signal,timeout]):timeout;
  return fetchImpl(input,{...init,signal});
};

export class BusinessSupabaseAuthSession {
  constructor({
    url,publishableKey,tokenStore,clientFactory=createClient,
    now=()=>Date.now(),refreshSkewSeconds=90,
    requestTimeoutMs=5000,fetchImpl=globalThis.fetch
  }={}){
    if(typeof url!=='string'||!URL.test(url)||
       typeof publishableKey!=='string'||!PUB.test(publishableKey)||
       !tokenStore||typeof tokenStore.read!=='function'||
       typeof tokenStore.write!=='function'||typeof tokenStore.delete!=='function'||
       typeof clientFactory!=='function'||typeof fetchImpl!=='function'||
       !Number.isFinite(refreshSkewSeconds)||refreshSkewSeconds<30||refreshSkewSeconds>600||
       !Number.isInteger(requestTimeoutMs)||requestTimeoutMs<250||requestTimeoutMs>30000)
      fail('BUSINESS_AUTH_CONFIG_INVALID');
    this.tokenStore=tokenStore;
    this.now=now;
    this.refreshSkewSeconds=refreshSkewSeconds;
    this.requestTimeoutMs=requestTimeoutMs;
    this.url=url.replace(/\/$/,'');
    this.publishableKey=publishableKey;
    this.fetch=boundedFetch(fetchImpl,requestTimeoutMs);
    this.directTransport=clientFactory===createClient;
    this.client=clientFactory(url,publishableKey,{
      auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},
      global:{fetch:this.fetch}
    });
    if(!this.client?.auth||typeof this.client.auth.signInWithPassword!=='function'||
       typeof this.client.auth.refreshSession!=='function'||
       typeof this.client.auth.signOut!=='function'||typeof this.client.rpc!=='function')
      fail('BUSINESS_AUTH_CLIENT_INVALID');
    this.session=null;
    this.refreshPromise=null;
  }
  async runNetwork(operation){
    if(typeof operation!=='function')fail('BUSINESS_AUTH_CONFIG_INVALID');
    let timer=null;
    try{
      return await Promise.race([
        Promise.resolve().then(operation),
        new Promise((_,reject)=>{
          timer=setTimeout(()=>reject(Error('BUSINESS_BACKEND_UNAVAILABLE')),
            this.requestTimeoutMs);
        })
      ]);
    }finally{
      if(timer!==null)clearTimeout(timer);
    }
  }
  async directJson(path,{body,accessToken=null,bearerKey=false}={}){
    let response;
    try{
      response=await this.fetch(this.url+path,{
        method:'POST',
        headers:{
          apikey:this.publishableKey,
          Authorization:`Bearer ${accessToken??(bearerKey?this.publishableKey:'')}`,
          'content-type':'application/json'
        },
        body:JSON.stringify(body??{})
      });
    }catch{fail('BUSINESS_BACKEND_UNAVAILABLE');}
    let payload=null;
    try{payload=await response.json();}catch{}
    if(!response.ok){
      return {data:null,error:{
        ...(payload&&typeof payload==='object'?payload:{}),
        status:response.status,
        message:String(payload?.message??'BUSINESS_BACKEND_UNAVAILABLE')
      }};
    }
    if(payload===null||typeof payload!=='object')fail('BUSINESS_BACKEND_UNAVAILABLE');
    return {data:payload,error:null};
  }
  accept(session){
    const normalized=normalizeSession(session,Math.floor(this.now()/1000));
    this.session=normalized;
    this.tokenStore.write(normalized.refresh_token);
    return normalized;
  }
  async connectWithPassword({email,password}={}){
    if(typeof email!=='string'||!email.includes('@')||email.length>320||
       typeof password!=='string'||password.length<8||password.length>1024)
      fail('BUSINESS_AUTH_INPUT_INVALID');
    const {data,error}=await this.runNetwork(
      ()=>this.client.auth.signInWithPassword({email,password})
    );
    if(error)fail(authError(error));
    return this.accept(data?.session);
  }
  async refreshFromToken(refreshToken){
    if(typeof refreshToken!=='string'||refreshToken.length<1||refreshToken.length>16384)
      fail('BUSINESS_AUTH_REQUIRED');
    if(this.directTransport){
      const {data,error}=await this.directJson(
        '/auth/v1/token?grant_type=refresh_token',
        {body:{refresh_token:refreshToken},bearerKey:true}
      );
      if(error)fail(authError(error));
      return this.accept(data);
    }
    const {data,error}=await this.runNetwork(
      ()=>this.client.auth.refreshSession({refresh_token:refreshToken})
    );
    if(error)fail(authError(error));
    return this.accept(data?.session);
  }
  async restore(){
    const refreshToken=this.tokenStore.read();
    if(!refreshToken)fail('BUSINESS_AUTH_REQUIRED');
    return this.refreshFromToken(refreshToken);
  }
  freshEnough(){
    return validSession(this.session)&&
      this.session.expires_at>Math.floor(this.now()/1000)+this.refreshSkewSeconds;
  }
  async ensureSession(){
    if(this.freshEnough())return this.session;
    if(!this.refreshPromise){
      this.refreshPromise=(async()=>{
        const token=this.session?.refresh_token??this.tokenStore.read();
        return this.refreshFromToken(token);
      })().finally(()=>{this.refreshPromise=null;});
    }
    return this.refreshPromise;
  }
  async rpc(name,args={}){
    if(typeof name!=='string'||!/^bc_[a-z0-9_]{1,80}$/.test(name))
      fail('BUSINESS_BACKEND_CONFIG_INVALID');
    if(!this.directTransport)return this.runNetwork(()=>this.client.rpc(name,args));
    const session=await this.ensureSession();
    return this.directJson('/rest/v1/rpc/'+encodeURIComponent(name),{
      body:args,accessToken:session.access_token
    });
  }
  async signOutLocal(){
    let remote=true;
    try{
      const {error}=await this.runNetwork(()=>this.client.auth.signOut({scope:'local'}));
      if(error)remote=false;
    }catch{remote=false;}
    this.session=null;
    this.tokenStore.delete();
    return {localCleared:true,remoteSignOut:remote};
  }
}
