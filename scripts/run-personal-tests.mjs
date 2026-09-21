import {spawnSync} from "node:child_process";
import {existsSync,lstatSync} from "node:fs";
const tests=[
 "scripts/l1/l1-local-test.mjs",
 "scripts/l1/l1-mcp-test.mjs",
 "scripts/l1/l1-host-file-test.mjs",
 "scripts/l1/l1-host-process-test.mjs",
 "scripts/l1/l1-poweruser-mcp-test.mjs",
 "scripts/l1/l1-semantic-write-test.mjs",
 "scripts/l1/l6-reliability-preflight.mjs",
 "scripts/l1/l6-durable-physical-test.mjs",
 "scripts/l1/l6-durable-http-test.mjs",
 "scripts/l1/l6-locked-startup-test.mjs",
 "scripts/l1/l6-launch-window-test.mjs",
 "scripts/l1/l6-copy-create-race-test.mjs",
 "scripts/l1/l6-owned-scratch-test.mjs",
 "scripts/l1/l6-owned-scratch-mcp-test.mjs",
 "scripts/l1/l6-native-create-test.mjs",
 "scripts/l1/personal-native-cas-test.mjs",
 "scripts/l1/personal-native-cas-mcp-test.mjs",
 "scripts/l1/personal-f01-f02-contract-test.mjs",
 "scripts/l1/personal-f02-r1-test.mjs",
 "scripts/l1/l6-b05-async-hash-test.mjs",
 "scripts/l1/l6-b05-async-hash-mcp-test.mjs",
 "scripts/l1/l6-b05-async-copy-test.mjs",
 "test/compat/p8-read-adapter-test.mjs",
 "scripts/l1/l6-personal-mcp-e2e-test.mjs",
 "scripts/l1/personal-copy-sigkill-test.mjs",
 "scripts/l1/personal-copy-e2e-kill-test.mjs",
 "scripts/l1/personal-memory-store-test.mjs",
 "scripts/l1/personal-memory-mcp-test.mjs",
 "scripts/l1/personal-memory-physical-restart-test.mjs",
 "scripts/l1/personal-36-tool-candidate-test.mjs",
 "scripts/l1/personal-memory-backup-test.mjs",
 "scripts/l1/personal-memory-encrypted-archive-test.mjs",
 "scripts/l1/personal-runner-observation-test.mjs",
 "scripts/l1/personal-stage-sigkill-test.mjs"
];
if(!existsSync("node_modules")||lstatSync("node_modules").isSymbolicLink())
 throw Error("DEPENDENCIES_MUST_BE_INSTALLED_IN_PERSONAL_REPO");
for(const file of tests){
 const r=spawnSync(process.execPath,[file],{encoding:"utf8",timeout:35000});
 if(r.status!==0||!/PASS/.test(r.stdout)){
  process.stderr.write("FAIL "+file+"\n"+r.stdout.slice(-2400)+"\n"+r.stderr.slice(-1500)+"\n");
  process.exit(1);
 }
 console.log("PASS "+file);
}
if(process.env.PERSONAL_TEST_SSD_ROOT){
 const r=spawnSync(process.execPath,["scripts/l1/personal-ssd-copy-test.mjs"],{
  encoding:"utf8",timeout:35000,env:process.env});
 if(r.status!==0||!r.stdout.includes("PERSONAL_SSD_COPY=PASS")){
  process.stderr.write("SSD_FAIL\n"+r.stdout.slice(-1200)+"\n"+r.stderr.slice(-1200));
  process.exit(1);
 }
 console.log("PASS personal SSD create-only copy");
}
console.log("PERSONAL_STANDALONE_SUITE=PASS count="+tests.length);
