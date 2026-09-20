import { existsSync, lstatSync, mkdirSync, openSync, writeSync, fsyncSync, closeSync, readFileSync, renameSync, unlinkSync, chmodSync } from "node:fs";
import { join, isAbsolute, normalize } from "node:path";
import { randomBytes, randomUUID, createHmac, createHash, scryptSync, timingSafeEqual } from "node:crypto";

const MODES = new Set(["ASK", "TRUSTED_PROJECT", "FULL_HOST"]);
const EFFECTS = new Set(["read", "write", "host_exec"]);
const LIFETIMES = new Set(["once", "task", "session", "persistent"]);
const now = () => Date.now();
const digest = x => createHash("sha256").update(JSON.stringify(x)).digest("hex");
const logEntry = (action, info={}) => ({ at: now(), action, ...info });

function privateDirectory(dir) {
  if (!isAbsolute(dir)) throw Error("STATE_DIRECTORY_MUST_BE_ABSOLUTE");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: false, mode: 0o700 });
  const s = lstatSync(dir);
  if (!s.isDirectory() || s.isSymbolicLink() || (s.mode & 0o077) !== 0 ||
      (typeof process.getuid === "function" && s.uid !== process.getuid()))
    throw Error("STATE_DIRECTORY_UNSAFE");
}
function privateFile(file) {
  const s=lstatSync(file);
  if (!s.isFile() || s.isSymbolicLink() || (s.mode & 0o077) !== 0 ||
      (typeof process.getuid === "function" && s.uid !== process.getuid()))
    throw Error("STATE_FILE_UNSAFE");
}
function atomic(file, data) {
  const tmp=file+".tmp-"+randomUUID();
  const fd=openSync(tmp,"wx",0o600);
  try { writeSync(fd,data); fsyncSync(fd); } finally { closeSync(fd); }
  renameSync(tmp,file);
  const dfd=openSync(join(file,".."),"r"); // caller handles failure if parent fsync unavailable
  try { fsyncSync(dfd); } finally { closeSync(dfd); }
}
function initial() {
 return { version:1, epoch:0, mode:"ASK", owner:null, requests:[], grants:[], actions:[], audit:[] };
}
export class L1Broker {
  constructor(dir, {initialize=false}={}) {
    this.dir=dir; privateDirectory(dir);
    this.stateFile=join(dir,"state.json");
    this.keyFile=join(dir,"seal.key");
    if (initialize) {
      if(existsSync(this.stateFile)||existsSync(this.keyFile)) throw Error("STATE_ALREADY_EXISTS");
      const key=randomBytes(32);
      atomic(this.keyFile,key);
      chmodSync(this.keyFile,0o600);
      this.key=key;
      this.state=initial();
      this.save();
    } else {
      if(!existsSync(this.keyFile)||!existsSync(this.stateFile))throw Error("RECOVERY_REQUIRED");
      privateFile(this.keyFile);privateFile(this.stateFile);
      this.key=readFileSync(this.keyFile);
      if(this.key.length!==32)throw Error("RECOVERY_REQUIRED");
      this.reload();
    }
  }
  reload(){
    privateFile(this.stateFile);
    let record;
    try { record=JSON.parse(readFileSync(this.stateFile,"utf8")); }
    catch{ throw Error("RECOVERY_REQUIRED"); }
    const json=JSON.stringify(record.payload);
    const mac=createHmac("sha256",this.key).update(json).digest("hex");
    if(typeof record.mac!=="string"||!/^([a-f0-9]{64})$/.test(record.mac)||
      !timingSafeEqual(Buffer.from(mac),Buffer.from(record.mac))||
      record.payload.version!==1||!MODES.has(record.payload.mode))
      throw Error("RECOVERY_REQUIRED");
    this.state=record.payload;
    if(!Array.isArray(this.state.actions))this.state.actions=[];
    return this.state;
  }
  save(){
    const payload=this.state;
    const mac=createHmac("sha256",this.key).update(JSON.stringify(payload)).digest("hex");
    atomic(this.stateFile,JSON.stringify({payload,mac})+"\n");
  }
  record(action, metadata={}){
    this.state.audit.push(logEntry(action,metadata));
    if(this.state.audit.length>80)this.state.audit=this.state.audit.slice(-80);
  }
  status(){
    const s=this.state;
    return {mode:s.mode,paired:!!s.owner,ownerIdentity:s.owner?"LOCAL_PAIRED_OWNER":"UNPAIRED",
      pending:s.requests.filter(x=>x.status==="PENDING_OWNER_APPROVAL"&&x.expiresAt>now()).length,
      approvedRecords:s.grants.filter(x=>!x.revokedAt&&x.expiresAt>now()).length,
      epoch:s.epoch,realFilesystemAccess:false,realHostExec:false,grantsEnforced:false};
  }
  pair(passphrase){
    if(this.state.owner)throw Error("OWNER_ALREADY_PAIRED");
    if(typeof passphrase!=="string"||passphrase.length<8||passphrase.length>256)throw Error("OWNER_SECRET_POLICY");
    const salt=randomBytes(16).toString("hex");
    this.state.owner={salt, verifier:scryptSync(passphrase,Buffer.from(salt,"hex"),32).toString("hex"),pairedAt:now()};
    this.record("OWNER_PAIRED");
    this.save();
    return this.status();
  }
  verifyOwner(passphrase){
    if(!this.state.owner||typeof passphrase!=="string")return false;
    const o=this.state.owner;
    const value=scryptSync(passphrase,Buffer.from(o.salt,"hex"),32);
    return timingSafeEqual(value,Buffer.from(o.verifier,"hex"));
  }
  requireOwner(passphrase){
    if(!this.verifyOwner(passphrase))throw Error("OWNER_AUTH_DENIED");
  }
  propose({path,mode,purpose,lifetime="task"}){
    if(!this.state.owner)throw Error("OWNER_NOT_PAIRED");
    if(typeof path!=="string"||path.length>512||!isAbsolute(path)||path.includes("\0")||/[\r\n]/.test(path)||
       !EFFECTS.has(mode)||typeof purpose!=="string"||!purpose.trim()||purpose.length>256||
       !LIFETIMES.has(lifetime))throw Error("INVALID_SCOPE");
    const displayPath=normalize(path);
    const intent={path:displayPath,mode,purpose:purpose.trim(),lifetime};
    const d=digest(intent);
    const previous=this.state.requests.find(x=>x.digest===d&&x.status==="PENDING_OWNER_APPROVAL"&&x.expiresAt>now());
    if(previous)return {requestId:previous.id,status:previous.status,expiresAt:previous.expiresAt,duplicate:true};
    const item={id:randomUUID(),digest:d,...intent,status:"PENDING_OWNER_APPROVAL",
      requestedAt:now(),expiresAt:now()+600_000};
    this.state.requests.push(item);
    this.record("REQUEST_CREATED",{requestId:item.id,mode});
    this.save();
    return {requestId:item.id,status:item.status,expiresAt:item.expiresAt,duplicate:false};
  }
  check(requestId){
    const r=this.state.requests.find(x=>x.id===requestId);
    if(!r)return {requestId,status:"NOT_FOUND",realGrant:false};
    const status=r.status==="PENDING_OWNER_APPROVAL"&&r.expiresAt<=now()?"EXPIRED":r.status;
    const grant=this.state.grants.find(g=>g.requestId===requestId);
    const effective=!!grant&&!grant.revokedAt&&grant.expiresAt>now();
    return {requestId,status:effective?"APPROVED_RECORD_ONLY":status,grantId:grant?.id??null,
      recordValid:effective,realGrant:false,realFilesystemAccess:false};
  }
  pending(){return this.state.requests.filter(x=>x.status==="PENDING_OWNER_APPROVAL"&&x.expiresAt>now()).map(x=>({requestId:x.id,path:x.path,mode:x.mode,purpose:x.purpose,lifetime:x.lifetime,digest:x.digest,expiresAt:x.expiresAt}));}
  grants(){return this.state.grants.map(x=>({grantId:x.id,requestId:x.requestId,path:x.path,mode:x.mode,lifetime:x.lifetime,expiresAt:x.expiresAt,revoked:!!x.revokedAt}));}
  approve(requestId,passphrase,expectedDigest){
    if(passphrase!==undefined)this.requireOwner(passphrase);
    const r=this.state.requests.find(x=>x.id===requestId);
    if(!r||r.status!=="PENDING_OWNER_APPROVAL"||r.expiresAt<=now())throw Error("REQUEST_NOT_PENDING");
    if(r.digest!==expectedDigest)throw Error("REQUEST_DIGEST_MISMATCH");
    const ttl=r.lifetime==="once"?600_000:r.lifetime==="task"?3_600_000:
      r.lifetime==="session"?8*3_600_000:365*24*3_600_000;
    const grant={id:randomUUID(),requestId:r.id,path:r.path,mode:r.mode,lifetime:r.lifetime,
      createdAt:now(),expiresAt:now()+ttl,revokedAt:null};
    r.status="APPROVED";r.grantId=grant.id;
    this.state.grants.push(grant);this.state.epoch++;
    this.record("GRANT_RECORD_APPROVED",{requestId,grantId:grant.id});
    this.save();
    return {grantId:grant.id,recordValid:true,realGrant:false};
  }
  revoke(grantId,passphrase){
    if(passphrase!==undefined)this.requireOwner(passphrase);
    const g=this.state.grants.find(x=>x.id===grantId);
    if(!g)throw Error("GRANT_NOT_FOUND");
    if(!g.revokedAt){g.revokedAt=now();this.state.epoch++;
      this.record("GRANT_RECORD_REVOKED",{grantId});this.save();}
    return {grantId,revoked:true,realGrant:false,epoch:this.state.epoch};
  }
  setMode(mode,passphrase){
    if(mode==="FULL_HOST"||passphrase!==undefined)this.requireOwner(passphrase);
    if(!MODES.has(mode))throw Error("INVALID_MODE");
    if(mode!==this.state.mode){this.state.mode=mode;this.state.epoch++;
      this.record("MODE_SELECTED",{mode});this.save();}
    return {mode,configured:true,enforced:false,realFilesystemAccess:false,realHostExec:false};
  }
  // Durable process start fence. An unknown result must NEVER be auto-retried
  // after a broker crash; retained keys require explicit manual reconciliation.
  reserveAction(idempotencyKey,requestDigest,prepared=null){
    if(typeof idempotencyKey!=="string"||!/^[0-9a-fA-F-]{36}$/.test(idempotencyKey)||
      typeof requestDigest!=="string"||!/^[a-f0-9]{64}$/.test(requestDigest))throw Error("INVALID_ACTION_ID");
    const actions=this.state.actions??=[];
    const previous=actions.find(x=>x.key===idempotencyKey);
    if(previous){
      if(previous.digest!==requestDigest)throw Error("IDEMPOTENCY_KEY_CONFLICT");
      throw Error("ACTION_RECONCILIATION_REQUIRED");
    }
    if(actions.length>=200)throw Error("ACTION_JOURNAL_LIMIT");
    if(prepared!==null&&(
       typeof prepared.processId!=="string"||!/^[0-9a-fA-F-]{36}$/.test(prepared.processId)||
       typeof prepared.nonceDigest!=="string"||!/^[a-f0-9]{64}$/.test(prepared.nonceDigest)||
       actions.some(x=>x.processId===prepared.processId)))throw Error("INVALID_PREPARED_ACTION");
    actions.push({key:idempotencyKey,digest:requestDigest,stage:"ISSUED",at:now(),
       ...(prepared?{processId:prepared.processId,nonceDigest:prepared.nonceDigest}:{})});
    this.record("HOST_PROCESS_ISSUED",{actionKeyDigest:digest(idempotencyKey)});
    this.save();
  }
  // Durable supervisor identity is sealed after ISSUED and before returning the job.
  bindAction(idempotencyKey,{processId,runnerPid,runnerStartToken,nonceDigest}){
    const entry=(this.state.actions??[]).find(x=>x.key===idempotencyKey);
    if(!entry||entry.stage!=="ISSUED"||entry.runnerPid||
       (entry.processId&&entry.processId!==processId)||
       (entry.nonceDigest&&entry.nonceDigest!==nonceDigest)||
       typeof processId!=="string"||!/^[0-9a-fA-F-]{36}$/.test(processId)||
       !Number.isInteger(runnerPid)||runnerPid<1||
       typeof runnerStartToken!=="string"||!runnerStartToken||runnerStartToken.length>128||
       typeof nonceDigest!=="string"||!/^[a-f0-9]{64}$/.test(nonceDigest))
       throw Error("ACTION_BINDING_REQUIRED");
    entry.processId=processId;entry.runnerPid=runnerPid;
    entry.runnerStartToken=runnerStartToken;entry.nonceDigest=nonceDigest;
    this.record("HOST_PROCESS_BOUND",{actionKeyDigest:digest(idempotencyKey)});
    this.save();
  }
  markActionTerminal(idempotencyKey,terminal){
    const entry=(this.state.actions??[]).find(x=>x.key===idempotencyKey);
    if(!entry||!["EXITED","FAILED","TERMINATED"].includes(terminal))throw Error("ACTION_NOT_FOUND");
    entry.stage=terminal;entry.endedAt=now();
    this.record("HOST_PROCESS_TERMINAL",{actionKeyDigest:digest(idempotencyKey),terminal});
    this.save();
  }
  // Trusted-client posture: macOS effective user permissions define access only after
  // explicit local owner enrollment and persistent FULL_HOST delegation.
  // A grant ID, model text or pending request is never itself authority.
  accessDecision(effect,path){
    if(!this.state.owner)return {allowed:false,reason:"OWNER_NOT_PAIRED"};
    if(!EFFECTS.has(effect)||typeof path!=="string"||!isAbsolute(path)||path.includes("\0")||/[\r\n]/.test(path))
      return {allowed:false,reason:"INVALID_SCOPE"};
    if(this.state.mode==="FULL_HOST")return {allowed:true,mode:"FULL_HOST",scope:"MACOS_EFFECTIVE_USER",epoch:this.state.epoch};
    // TRUSTED_PROJECT is not path-enforced here: do not claim scoped arbitrary execution.
    return {allowed:false,reason:"ACCESS_REQUIRED",mode:this.state.mode};
  }
  audit(){
    return this.state.audit.map(x=>({...x}));
  }
}
