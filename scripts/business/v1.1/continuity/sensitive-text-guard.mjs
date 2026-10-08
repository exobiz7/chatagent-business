// Adapted directly from the validated ChatAgent Personal memory input guard.
// Keep credential-like values out of both TEAM and PRIVATE continuity before RPC persistence.
export const SENSITIVE_TEXT_PATTERN=/(?:\bsk-[A-Za-z0-9_-]{8,}|\bgh[pousr]_[A-Za-z0-9_]{8,}|\bBearer\s+\S+|\bpassword\s*[:=]|\bapi[_-]?key\s*[:=]|-----BEGIN\s+\w+\s+PRIVATE KEY)/i;
const CONTROL=/[\x00-\x08\x0b\x0c\x0e-\x1f]/;
const fail=()=>{throw Error('BUSINESS_CONTINUITY_SENSITIVE_TEXT');};

export function assertContinuitySafe(value){
  const visit=x=>{
    if(typeof x==='string'){
      if(SENSITIVE_TEXT_PATTERN.test(x)||CONTROL.test(x))fail();
      return;
    }
    if(Array.isArray(x)){for(const item of x)visit(item);return;}
    if(x&&typeof x==='object'){for(const item of Object.values(x))visit(item);}
  };
  visit(value);
  return value;
}
