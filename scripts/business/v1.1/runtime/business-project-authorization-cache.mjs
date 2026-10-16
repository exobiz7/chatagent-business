const PROJECT=/^[a-z0-9][a-z0-9._-]{0,63}$/;
const PROFILES=new Set(['READ_ONLY','SAFE','STANDARD']);
const fail=code=>{throw Error(code);};

function member(value){
  if(typeof value!=='string'||value.length<8||value.length>512||/[\0\r\n]/.test(value))
    fail('BUSINESS_AUTHENTICATED_MEMBER_INVALID');
  return value;
}
function project(value){if(typeof value!=='string'||!PROJECT.test(value))fail('BUSINESS_PROJECT_ID_INVALID');return value;}
function fresh(value,projectId){
  if(!value||typeof value!=='object'||Array.isArray(value)||value.projectId!==projectId||value.authorized!==true||
     !PROFILES.has(value.projectProfile)||typeof value.organizationId!=='string'||!value.organizationId||value.organizationId.length>128)
    fail('BUSINESS_PROJECT_AUTHORIZATION_DENIED');
  return {projectId,authorized:true,projectProfile:value.projectProfile,organizationId:value.organizationId};
}
const backendUnavailable=error=>String(error?.message??'')==='BUSINESS_BACKEND_UNAVAILABLE';

export class BusinessProjectAuthorizationCache{
  constructor({loadFresh,ttlMs=300000,maxEntries=256,now=()=>Date.now()}={}){
    if(typeof loadFresh!=='function'||!Number.isInteger(ttlMs)||ttlMs<30000||ttlMs>3600000||
       !Number.isInteger(maxEntries)||maxEntries<1||maxEntries>4096||typeof now!=='function')
      fail('BUSINESS_PROJECT_AUTH_CACHE_CONFIG_INVALID');
    this.loadFresh=loadFresh;this.ttlMs=ttlMs;this.maxEntries=maxEntries;this.now=now;this.cache=new Map();
  }
  #key(authenticatedMemberKey,projectId){return authenticatedMemberKey+'\0'+projectId;}
  #prune(nowMs){
    for(const [key,value] of this.cache)if(value.expiresAt<=nowMs)this.cache.delete(key);
    while(this.cache.size>this.maxEntries)this.cache.delete(this.cache.keys().next().value);
  }
  snapshot(){
    const nowMs=this.now();this.#prune(nowMs);
    return [...this.cache.values()].map(x=>({projectId:x.projectId,projectProfile:x.projectProfile,
      organizationId:x.organizationId,expiresAt:x.expiresAt}));
  }
  invalidate({authenticatedMemberKey,projectId}={}){
    authenticatedMemberKey=member(authenticatedMemberKey);projectId=project(projectId);
    return this.cache.delete(this.#key(authenticatedMemberKey,projectId));
  }
  async authorize({authenticatedMemberKey,projectId}={}){
    authenticatedMemberKey=member(authenticatedMemberKey);projectId=project(projectId);
    const key=this.#key(authenticatedMemberKey,projectId),nowMs=this.now();this.#prune(nowMs);
    try{
      const value=fresh(await this.loadFresh({authenticatedMemberKey,projectId}),projectId);
      const cached=Object.freeze({...value,authorizationSource:'CONTROL_PLANE',expiresAt:nowMs+this.ttlMs});
      this.cache.delete(key);this.cache.set(key,cached);this.#prune(nowMs);
      return cached;
    }catch(error){
      if(!backendUnavailable(error))throw error;
      const cached=this.cache.get(key);
      if(!cached||cached.expiresAt<=nowMs){this.cache.delete(key);fail('BUSINESS_PROJECT_AUTH_LEASE_EXPIRED');}
      return Object.freeze({projectId:cached.projectId,authorized:true,projectProfile:cached.projectProfile,
        organizationId:cached.organizationId,authorizationSource:'CACHED_LEASE',expiresAt:cached.expiresAt});
    }
  }
}
