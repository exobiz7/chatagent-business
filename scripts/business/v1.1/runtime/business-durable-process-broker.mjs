import {isAbsolute} from 'node:path';
import {L1Broker} from '../../../l1/broker-core.mjs';

const fail=code=>{throw Error(code);};

export class BusinessDurableProcessBroker extends L1Broker{
  #hostStartPermit=false;

  runAuthorizedHostStart(startFn){
    if(typeof startFn!=='function')fail('BUSINESS_HOST_PROCESS_BROKER_INPUT_INVALID');
    if(this.#hostStartPermit)fail('BUSINESS_HOST_PROCESS_AUTH_REENTRANT');
    this.#hostStartPermit=true;
    try{
      // DurableHostProcesses performs all accessDecision checks synchronously
      // before its first await. Drop the ephemeral Business admission permit as
      // soon as startFn returns its promise; it is not a persistent authority.
      return startFn();
    } finally {
      this.#hostStartPermit=false;
    }
  }

  accessDecision(effect,path){
    if(!this.#hostStartPermit)
      return {allowed:false,reason:'BUSINESS_HOST_PROCESS_AUTH_REQUIRED'};
    if(!['host_exec','read'].includes(effect)||typeof path!=='string'||!isAbsolute(path)||
       path.includes('\0')||/[\r\n]/.test(path))
      return {allowed:false,reason:'BUSINESS_HOST_PROCESS_SCOPE_INVALID'};
    return {allowed:true,mode:'BUSINESS_AUTHORIZED',scope:'MACOS_EFFECTIVE_USER'};
  }
}
