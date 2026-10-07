import {spawnSync} from "node:child_process";
import {createHash} from "node:crypto";
import {lstatSync,readFileSync} from "node:fs";

const SHA=/^[0-9a-f]{64}$/;
const LABEL=/^[^\x00-\x1f\x7f]{1,255}$/;
const fail=code=>{throw Error(code);};

const verifyBinary=(path,expectedSha256)=>{
  if(typeof path!=="string"||!path.startsWith("/")||!SHA.test(expectedSha256??""))
    fail("KEYCHAIN_HELPER_CONFIG_INVALID");
  const st=lstatSync(path);
  if(!st.isFile()||st.isSymbolicLink()||st.nlink!==1||
     (typeof process.getuid==="function"&&st.uid!==process.getuid())||
     (st.mode&0o022)!==0)
    fail("KEYCHAIN_HELPER_UNSAFE");
  const actual=createHash("sha256").update(readFileSync(path)).digest("hex");
  if(actual!==expectedSha256)fail("KEYCHAIN_HELPER_SHA_MISMATCH");
};

const nativeCode=stderr=>{
  const value=String(stderr??"").trim();
  return /^KEYCHAIN_[A-Z0-9_]{3,64}$/.test(value)?value:"KEYCHAIN_HELPER_FAILED";
};

export class MacKeychainRefreshTokenStore {
  constructor({binary,binarySha256,service,account}={}){
    verifyBinary(binary,binarySha256);
    if(typeof service!=="string"||!LABEL.test(service)||
       typeof account!=="string"||!LABEL.test(account))
      fail("KEYCHAIN_HELPER_CONFIG_INVALID");
    this.binary=binary;
    this.service=service;
    this.account=account;
  }
  run(operation,{input=null,allowMissing=false}={}){
    const result=spawnSync(this.binary,[operation,this.service,this.account],{
      input:input===null?undefined:Buffer.from(input,"utf8"),
      encoding:"utf8",
      timeout:5000,
      maxBuffer:32768,
      windowsHide:true
    });
    if(result.error||result.signal)fail("KEYCHAIN_HELPER_FAILED");
    if(result.status!==0){
      const code=nativeCode(result.stderr);
      if(allowMissing&&code==="KEYCHAIN_NOT_FOUND")return null;
      fail(code);
    }
    return result.stdout;
  }
  read(){
    const value=this.run("read",{allowMissing:true});
    if(value===null)return null;
    if(typeof value!=="string"||value.length<1||value.length>16384)
      fail("KEYCHAIN_SECRET_INVALID");
    return value;
  }
  write(secret){
    if(typeof secret!=="string"||secret.length<1||secret.length>16384||secret.includes("\0"))
      fail("KEYCHAIN_SECRET_INVALID");
    this.run("write",{input:secret});
  }
  delete(){
    this.run("delete",{allowMissing:true});
  }
}
