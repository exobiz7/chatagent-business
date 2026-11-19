// Headless implementation of the future consent app's user-driven transition logic.
// Designed for offline mocked tests. Never invoked by Preview-only served JavaScript.
import {inspectConsent,decideConsent} from './bs6g5f-consent-flow.mjs';
const fail=code=>{throw Error(code);};
export function createConsentController({client,allowlist,authorizationId}){
  if(!client?.auth?.oauth||!client.auth.signInWithPassword||
     !allowlist?.clientId||!allowlist?.redirectUri||
     allowlist?.projectRef!=='hjgerbyofaxyfqdckret'||
     !/^[A-Za-z0-9_-]{8,256}$/.test(authorizationId??''))
    fail('BS6G5G_CONTROLLER_CONFIG_INCOMPLETE');
  let status='LOCKED',checked=null,used=false,busy=false;
  const acquire=()=>{
    if(busy)fail('BS6G5G_CONCURRENT_CONSENT_DENIED');
    busy=true;
  };
  return Object.freeze({
    get phase(){return status;},
    async inspect(){
      acquire();
      try{
        if(used)fail('BS6G5G_ALREADY_DECIDED');
        checked=null;status='INSPECTING';
        const x=await inspectConsent(client,authorizationId,allowlist);
        checked=x;status='REVIEW';
        // Only non-secret data for display. Never return access/refresh tokens.
        return Object.freeze({phase:status,clientLabel:x.clientLabel,
          redirectUri:x.redirectUri,scopes:[...x.scopes]});
      }catch(e){checked=null;status='LOCKED';throw e;}
      finally{busy=false;}
    },
    async login({email,password}={}){
      acquire();
      try{
        if(used)fail('BS6G5G_ALREADY_DECIDED');
        checked=null;status='LOCKED';
        if(typeof email!=='string'||email.length>254||
           typeof password!=='string'||password.length<8||
           password.length>1024)
          fail('BS6G5G_CREDENTIAL_FORMAT_INVALID');
        // Explicit UI login only; neither signup nor implicit password retries.
        const {error}=await client.auth.signInWithPassword({email,password});
        if(error)fail('BS6G5G_LOGIN_DENIED');
        status='LOGGED_IN';
        return Object.freeze({phase:status});
      }finally{busy=false;}
    },
    async decide(action){
      acquire();
      try{
        if(status!=='REVIEW'||!checked||used||
           !['approve','deny'].includes(action))
          fail('BS6G5G_NOT_REVIEWED_OR_ALREADY_USED');
        used=true;status='DECISION_PENDING';
        const x=await decideConsent(client,checked,action);
        status='REDIRECT_VALIDATED';
        return Object.freeze({phase:status,redirectUrl:x.redirectUrl});
      }catch(e){checked=null;status='LOCKED';throw e;}
      finally{busy=false;}
    }
  });
}
