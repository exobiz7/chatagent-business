// B-S6G-5J. Offline candidate guard. This is not wired into production or the live MCP gateway.
import {jwtVerify} from 'jose';
const reject=(code)=>{throw Error('BS6G5J_'+code)};
export async function verifyExactMcpAccessToken(token,key,configuration){
 const c=configuration;
 if(!c||!/^https:\/\/[^/]+\/auth\/v1$/.test(c.issuer??'')||
    !/^https:\/\/[^/]+\/mcp$/.test(c.resource??'')||
    !/^[0-9a-f-]{36}$/i.test(c.clientId??'')||
    !Array.isArray(c.scopes)||!c.scopes.length)
    reject('CONFIG_UNVERIFIED');
 if(typeof token!=='string'||token.length>12000||!key)reject('TOKEN_REQUIRED');
 let payload;
 try {
   ({payload}=await jwtVerify(token,key,{
     issuer:c.issuer,audience:c.resource,
     algorithms:['RS256','ES256'],clockTolerance:0
   }));
 } catch {reject('CRYPTO_ISSUER_EXPIRY_OR_RESOURCE_AUDIENCE_INVALID')}
 if(typeof payload.sub!=='string'||!payload.sub||payload.role!=='authenticated'||
    payload.is_anonymous===true)reject('IDENTITY_INVALID');
 if(payload.client_id!==c.clientId)reject('CLIENT_ID_MISMATCH');
 if(payload.resource!==c.resource)reject('RESOURCE_CLAIM_MISMATCH');
 const scopes=typeof payload.scope==='string'?payload.scope.split(/\s+/):null;
 if(!scopes||c.scopes.some(s=>!scopes.includes(s)))reject('SCOPE_NOT_AUTHORIZED');
 return Object.freeze({verified:true,subject:payload.sub,clientId:payload.client_id,
    resource:c.resource,scope:scopes});
}
