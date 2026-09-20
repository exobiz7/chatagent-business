import assert from "node:assert/strict";
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync,existsSync,readdirSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {randomUUID,createHash} from "node:crypto";
import {L1Broker} from "./broker-core.mjs";
import {OwnedScratch} from "./owned-scratch.mjs";
import {HostFileOps} from "./host-file-ops.mjs";
const sha=x=>createHash("sha256").update(x).digest("hex");
const root=mkdtempSync(join(tmpdir(),"chatagent-l6-owned-scratch-"));
const state=join(root,"owner"),work=join(root,"work");
mkdirSync(work,{mode:0o700});
const broker=new L1Broker(state,{initialize:true}),pass="12345678";
broker.pair(pass);broker.setMode("FULL_HOST",pass);
try{
 const scratch=await new OwnedScratch(broker).init();
 const key=randomUUID(),content="SCRATCH_TEMP_OWNED",digest=sha(content);
 const created=await scratch.create({content,idempotencyKey:key});
 assert.equal(created.state,"CREATED");assert.equal(created.sha256,digest);
 const fixture=join(state,"scratch",created.handle+".txt");
 assert.equal(readFileSync(fixture,"utf8"),content);
 const same=await scratch.create({content,idempotencyKey:key});
 assert.equal(same.changed,false);assert.equal(same.handle,created.handle);
 await assert.rejects(()=>scratch.create({content:"DIFFERENT",idempotencyKey:key}),/IDEMPOTENCY_KEY_CONFLICT/);
 await assert.rejects(()=>scratch.cleanup({handle:created.handle,expectedSha256:sha("wrong")}),/SCRATCH_PRECONDITION_MISMATCH/);
 await assert.rejects(()=>scratch.cleanup({handle:randomUUID(),expectedSha256:digest}),/SCRATCH_NOT_OWNED/);
 console.log("PASS created-only UUID, SHA and key enforce ownership");
 const generic=new HostFileOps(broker,{privateRoot:state});
 await assert.rejects(()=>generic.read({path:fixture}),/OWNER_CONTROL_PATH_DENIED/);
 writeFileSync(fixture,"MUTATED_BY_FIXTURE");
 await assert.rejects(()=>scratch.cleanup({handle:created.handle,expectedSha256:digest}),/SCRATCH_CONTENT_MISMATCH|SCRATCH_IDENTITY_MISMATCH/);
 assert.ok(existsSync(fixture));
 writeFileSync(fixture,content);
 console.log("PASS private state inaccessible by generic tools; changed contents not deleted");
 const resumed=await new OwnedScratch(new L1Broker(state)).init();
 const cleaned=await resumed.cleanup({handle:created.handle,expectedSha256:digest});
 assert.equal(cleaned.changed,true);assert.equal(cleaned.state,"CLEANED");
 assert.equal(existsSync(fixture),false);
 assert.equal((await resumed.cleanup({handle:created.handle,expectedSha256:digest})).changed,false);
 assert.equal(readdirSync(join(state,"scratch")).length,0);
 console.log("PASS sealed restart cleanup only exact managed file and idempotent absence");
 const simultaneous=await resumed.create({content:"CONCURRENT",idempotencyKey:randomUUID()});
 const responses=await Promise.allSettled([
  resumed.cleanup({handle:simultaneous.handle,expectedSha256:sha("CONCURRENT")}),
  resumed.cleanup({handle:simultaneous.handle,expectedSha256:sha("CONCURRENT")})
 ]);
 assert.equal(responses.filter(x=>x.status==="fulfilled").length,1);
 assert.equal(responses.filter(x=>x.status==="rejected"&&x.reason.message==="SCRATCH_BUSY").length,1);
 assert.equal(existsSync(join(state,"scratch",simultaneous.handle+".txt")),false);
 console.log("PASS simultaneous cleanup rejects overlap; one exact effect");
 broker.setMode("ASK",pass);
 await assert.rejects(()=>scratch.create({content:"x",idempotencyKey:randomUUID()}),/ACCESS_REQUIRED/);
 console.log("PASS mode downgrade rejects scratch effects");

 broker.setMode("FULL_HOST",pass);
 const strict=new HostFileOps(broker,{privateRoot:state,strictMutations:true});
 const from=join(work,"source.txt"),target=join(work,"target.txt"),newPath=join(work,"new.txt");
 writeFileSync(from,"FROM");writeFileSync(target,"DEST");
 await assert.rejects(()=>strict.replace({path:target,content:"OVERWRITE",
  expectedSha256:sha("DEST")}),/ATOMIC_REPLACE_UNAVAILABLE/);
 await assert.rejects(()=>strict.copy({source:from,destination:target,
  expectedSourceSha256:sha("FROM"),expectedDestinationSha256:sha("DEST")}),/ATOMIC_REPLACE_UNAVAILABLE/);
 assert.equal(readFileSync(target,"utf8"),"DEST");
 const createdNew=await strict.create({path:newPath,content:"NEW"});
 assert.equal(createdNew.changed,true);
 console.log("PASS strict mutation mode refuses existing-target overwrite; O_EXCL create remains");
 console.log("L6_OWNED_SCRATCH_TEST=PASS");
}catch(error){
 console.error("L6_OWNED_SCRATCH_TEST=FAIL "+error.stack);process.exitCode=1;
}finally{rmSync(root,{recursive:true,force:true});console.log("isolated_fixture_cleanup=COMPLETE");}
