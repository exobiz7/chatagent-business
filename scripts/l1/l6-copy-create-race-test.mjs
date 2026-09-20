import assert from "node:assert/strict";
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,readdirSync,rmSync,realpathSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {createHash} from "node:crypto";
import {L1Broker} from "./broker-core.mjs";
import {HostFileOps} from "./host-file-ops.mjs";
const sha=x=>createHash("sha256").update(x).digest("hex");
const root=mkdtempSync(join(tmpdir(),"chatagent-l6-copy-race-"));
const state=join(root,"state"),work=join(root,"work");
mkdirSync(work,{mode:0o700});
const b=new L1Broker(state,{initialize:true});
b.pair("12345678");b.setMode("FULL_HOST","12345678");
const sourcePath=join(work,"source.txt"),dest=join(work,"target.txt"),fresh=join(work,"fresh.txt");
writeFileSync(sourcePath,"SOURCE_OWNED",{mode:0o600});
const expected=sha("SOURCE_OWNED");
let interposed=0;
const files=new HostFileOps(b,{privateRoot:state,testHooks:{
 beforeCopyCreateCommit:async({destination})=>{
  assert.equal(destination,join(realpathSync(work),"target.txt"));
  writeFileSync(destination,"RACER_OWNED",{mode:0o600,flag:"wx"});
  interposed++;
 }
}});
try{
 await assert.rejects(()=>files.copy({source:sourcePath,destination:dest,
   expectedSourceSha256:expected,expectedDestinationSha256:null}),e=>e.code==="EEXIST");
 assert.equal(interposed,1);
 assert.equal(readFileSync(dest,"utf8"),"RACER_OWNED");
 assert.equal(readdirSync(work).filter(x=>x.startsWith(".chatagent-")).length,0);
 console.log("PASS deterministic concurrent destination creation cannot be overwritten");

 const allowed=new HostFileOps(b,{privateRoot:state});
 const result=await allowed.copy({source:sourcePath,destination:fresh,
  expectedSourceSha256:expected,expectedDestinationSha256:null});
 assert.equal(result.sha256,expected);
 assert.equal(readFileSync(fresh,"utf8"),"SOURCE_OWNED");
 assert.equal(readdirSync(work).filter(x=>x.startsWith(".chatagent-")).length,0);
 console.log("PASS new-destination link commit and temporary stage cleanup");
 console.log("L6_COPY_CREATE_RACE=PASS");
}catch(e){console.error("L6_COPY_CREATE_RACE=FAIL "+e.stack);process.exitCode=1;}
finally{rmSync(root,{recursive:true,force:true});console.log("isolated_fixture_cleanup=COMPLETE");}
