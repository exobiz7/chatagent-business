import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
import {mkdtempSync,mkdirSync,realpathSync,writeFileSync,readFileSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {randomUUID,createHash} from "node:crypto";
import {setTimeout as delay} from "node:timers/promises";
import {L1Broker} from "./broker-core.mjs";
import {HostFileOps} from "./host-file-ops.mjs";
import {AsyncHashJobs} from "./async-hash-jobs.mjs";

const root=realpathSync(mkdtempSync(join(tmpdir(),"chatagent-b05-hash-")));
const state=join(root,"state"),work=join(root,"work");mkdirSync(work,{mode:0o700});
const source=join(work,"24mb.bin");
const data=Buffer.alloc(24*1024*1024,0x67);
writeFileSync(source,data,{mode:0o600});
const expected=createHash("sha256").update(data).digest("hex");
const password="12345678",broker=new L1Broker(state,{initialize:true});
broker.pair(password);broker.setMode("FULL_HOST",password);
const jobs=new AsyncHashJobs(broker,new HostFileOps(broker,{privateRoot:state}));
const key=randomUUID();
const wait=async(fn,tries=120)=>{
 for(let i=0;i<tries;i++){const result=await fn();if(result)return result;await delay(80);}
 throw Error("B05_JOB_TIMEOUT");
};
try{
 const job=await jobs.start({path:source,idempotencyKey:key});
 assert.ok(job.processId);assert.equal(job.bytes,data.length);
 await wait(()=>jobs.status({processId:job.processId}).state==="EXITED");
 const out=jobs.read({processId:job.processId,cursor:0,maxBytes:16384});
 assert.equal(out.exitCode,0);assert.equal(out.hasMore,false);
 const m=out.content.match(/\{"event":"HASH_DONE","bytes":(\d+),"sha256":"([a-f0-9]{64})"\}/);
 assert.ok(m,"MISSING_FINAL_HASH");assert.equal(Number(m[1]),data.length);assert.equal(m[2],expected);
 assert.match(out.content,/HASH_PROGRESS/);
 console.log("PASS bounded 24MiB read-only async hash with progress and terminal digest");
 const reopened=new L1Broker(state);
 const other=new AsyncHashJobs(reopened,new HostFileOps(reopened,{privateRoot:state}));
 const resumed=other.status({processId:job.processId});
 assert.equal(resumed.state,"EXITED");
 assert.equal(other.read({processId:job.processId,cursor:0,maxBytes:16384}).content,out.content);
 const duplicate=await other.start({path:source,idempotencyKey:key});
 assert.equal(duplicate.processId,job.processId);
 console.log("PASS sealed completion, independent reopen and exact-key no replay");
 const st=(await import("node:fs")).statSync(source);
 const bad=spawnSync(process.execPath,[fileURLToPath(new URL("./async-file-hash-worker.mjs",import.meta.url)),
  source,String(st.dev),String(st.ino),String(st.size),String(st.mtimeMs+1)],{
  encoding:"utf8",timeout:3000});
 assert.equal(bad.status,3);assert.match(bad.stderr,/ASYNC_HASH_SOURCE_CHANGED/);
 assert.doesNotMatch(bad.stdout,/HASH_DONE/);
 console.log("PASS stale source identity refused without a false final hash");
 await assert.rejects(()=>jobs.start({path:join(state,"sealed-state.json"),idempotencyKey:randomUUID()}),
  /OWNER_CONTROL_PATH_DENIED/);
 const unrelated=await jobs.processes.start({executable:process.execPath,cwd:work,
  argv:["-e","process.stdout.write('UNRELATED')"],timeoutMs:10000,idempotencyKey:randomUUID()});
 await wait(()=>jobs.processes.status({processId:unrelated.processId}).state==="EXITED");
 assert.throws(()=>jobs.status({processId:unrelated.processId}),/ASYNC_HASH_NOT_OWNED/);
 assert.throws(()=>jobs.read({processId:unrelated.processId}),/ASYNC_HASH_NOT_OWNED/);
 assert.throws(()=>jobs.stop({processId:unrelated.processId}),/ASYNC_HASH_NOT_OWNED/);
 console.log("PASS async-hash tools refuse a generic owned process ID");
 broker.setMode("ASK",password);
 await assert.rejects(()=>jobs.start({path:source,idempotencyKey:randomUUID()}),/ACCESS_REQUIRED/);
 assert.equal(createHash("sha256").update(readFileSync(source)).digest("hex"),expected);
 console.log("PASS private state and revoked read denied; original source bytes unchanged");
 console.log("L6_B05_ASYNC_HASH=PASS");
}catch(e){console.error("L6_B05_ASYNC_HASH=FAIL "+e.stack);process.exitCode=1;}
finally{
 // The completed owned job is already EXITED; only test-owned fixtures are removed.
 rmSync(root,{recursive:true,force:true});console.log("isolated_fixture_cleanup=COMPLETE");
}
