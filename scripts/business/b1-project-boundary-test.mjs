import {fileURLToPath} from "node:url";
import assert from "node:assert/strict";
import {spawn,spawnSync} from "node:child_process";
import {chmodSync,lstatSync,mkdtempSync,mkdirSync,readFileSync,realpathSync,renameSync,rmSync,symlinkSync,writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {randomBytes,randomUUID} from "node:crypto";
import net from "node:net";
import {setTimeout as delay} from "node:timers/promises";
import {BusinessRegistry,authorizeProjectTool,businessStatus} from "./business-core.mjs";

const root=realpathSync(mkdtempSync(join(tmpdir(),"chatagent-business-b1-")));
const state=join(root,"state");
const roRoot=join(root,"read-only"),safeRoot=join(root,"safe project"),stdRoot=join(root,"standard");
mkdirSync(roRoot);mkdirSync(safeRoot);mkdirSync(stdRoot);
const log=x=>console.log("PASS "+x);
const throws=(fn,code)=>assert.throws(fn,new RegExp(code));

const freePort=()=>new Promise((resolve,reject)=>{
 const s=net.createServer();s.once("error",reject);
 s.listen(0,"127.0.0.1",()=>{const p=s.address().port;s.close(()=>resolve(p));});
});
const wait=async(child,port)=>{
 for(let i=0;i<80;i++){
  if(child.exitCode!==null)throw Error("B1_SERVER_EARLY_EXIT");
  try{const r=await fetch("http://127.0.0.1:"+port+"/health",{signal:AbortSignal.timeout(300)});if(r.status===200)return;}catch{}
  await delay(75);
 }
 throw Error("B1_SERVER_TIMEOUT");
};

let server=null;
try{
 const registry=new BusinessRegistry(state,{initialize:true,organizationId:"acme",displayName:"ACME Labs"});
 assert.equal(lstatSync(state).mode&0o077,0);
 assert.equal(lstatSync(join(state,"registry.json")).mode&0o077,0);
 assert.deepEqual(registry.organization(),{organizationId:"acme",displayName:"ACME Labs"});
 throws(()=>new BusinessRegistry(state,{initialize:true,organizationId:"other",displayName:"Other"}),"BUSINESS_STATE_ALREADY_INITIALIZED");
 log("one immutable organization deployment and owner-private registry");

 throws(()=>registry.addProject({projectId:"bad",displayName:"Bad",hostRoot:"relative",profile:"SAFE"}),"BUSINESS_PROJECT_ROOT_INVALID");
 throws(()=>registry.addProject({projectId:"missing-root",displayName:"Missing",hostRoot:join(root,"absent"),profile:"SAFE"}),"BUSINESS_PROJECT_ROOT_UNAVAILABLE");
 const link=join(root,"symlink-root");symlinkSync(safeRoot,link);
 throws(()=>registry.addProject({projectId:"link",displayName:"Link",hostRoot:link,profile:"SAFE"}),"BUSINESS_PROJECT_ROOT_UNSAFE");
 throws(()=>registry.addProject({projectId:"state",displayName:"State",hostRoot:state,profile:"SAFE"}),"BUSINESS_PROJECT_ROOT_PROTECTED");
 throws(()=>registry.addProject({projectId:"auto",displayName:"Auto",hostRoot:roRoot,profile:"AUTONOMOUS"}),"BUSINESS_PROFILE_INVALID");
 log("invalid, symlink, protected roots and AUTONOMOUS fail closed");

 const ro=registry.addProject({projectId:"docs",displayName:"Docs",hostRoot:roRoot,profile:"READ_ONLY"});
 const safe=registry.addProject({projectId:"marketing",displayName:"Marketing",hostRoot:safeRoot,profile:"SAFE"});
 const standard=registry.addProject({projectId:"dev",displayName:"Development",hostRoot:stdRoot,profile:"STANDARD"});
 assert.equal(ro.rootAvailable,true);assert.equal(safe.rootAvailable,true);assert.equal(standard.rootAvailable,true);
 throws(()=>registry.addProject({projectId:"docs",displayName:"Duplicate",hostRoot:roRoot,profile:"SAFE"}),"BUSINESS_PROJECT_EXISTS");
 log("three project profiles registered with duplicate ID denial");

 assert.equal(authorizeProjectTool(registry,{projectId:"docs",tool:"read_file"}).profile,"READ_ONLY");
 throws(()=>authorizeProjectTool(registry,{projectId:"docs",tool:"create_file"}),"BUSINESS_PROFILE_DENIED");
 assert.equal(authorizeProjectTool(registry,{projectId:"marketing",tool:"replace_file"}).profile,"SAFE");
 throws(()=>authorizeProjectTool(registry,{projectId:"marketing",tool:"exec_command"}),"BUSINESS_PROFILE_DENIED");
 assert.equal(authorizeProjectTool(registry,{projectId:"dev",tool:"exec_command"}).profile,"STANDARD");
 throws(()=>authorizeProjectTool(registry,{projectId:"missing",tool:"read_file"}),"BUSINESS_PROJECT_UNKNOWN");
 log("project registry is the sole profile ceiling for read, safe and standard tools");

 registry.setEnabled("marketing",false);
 throws(()=>authorizeProjectTool(registry,{projectId:"marketing",tool:"read_file"}),"BUSINESS_PROJECT_DISABLED");
 registry.setEnabled("marketing",true);
 assert.equal(authorizeProjectTool(registry,{projectId:"marketing",tool:"create_file"}).profile,"SAFE");
 const reopened=new BusinessRegistry(state);
 assert.equal(reopened.list().length,3);
 assert.equal(reopened.inspect("marketing").enabled,true);
 log("disable/enable and restart persistence preserve authoritative scope");

 const moved=join(root,"standard-moved");renameSync(stdRoot,moved);symlinkSync(moved,stdRoot);
 const unavailable=reopened.inspect("dev");
 assert.equal(unavailable.rootAvailable,false);assert.equal(unavailable.rootStatus,"BUSINESS_PROJECT_ROOT_UNSAFE");
 throws(()=>authorizeProjectTool(reopened,{projectId:"dev",tool:"exec_command"}),"BUSINESS_PROJECT_ROOT_UNSAFE");
 log("post-registration root replacement with symlink is denied at admission");

 const status=businessStatus(reopened);
 assert.equal(status.organization.organizationId,"acme");
 assert.equal(status.projectCounts.registered,3);
 assert.equal(status.projects.find(p=>p.projectId==="dev").available,false);
 assert.equal(JSON.stringify(status).includes(roRoot),false);
 assert.equal(JSON.stringify(status).includes(safeRoot),false);
 assert.equal(JSON.stringify(status).includes(moved),false);
 log("business_status is bounded and does not disclose host roots");

 throws(()=>authorizeProjectTool(reopened,{projectId:"docs",tool:"create_file",profile:"STANDARD"}),"BUSINESS_PROFILE_DENIED");
 log("caller-supplied profile field cannot elevate stored project authority");

 const cliState=join(root,"cli-state"),admin=fileURLToPath(new URL("./business-admin.mjs",import.meta.url));
 const cliEnv={...process.env,CHATAGENT_BUSINESS_STATE_DIR:cliState};
 let cli=spawnSync(process.execPath,[admin,"organization","init","cli-org","CLI Org"],{env:cliEnv,encoding:"utf8"});
 assert.equal(cli.status,0,cli.stderr);
 cli=spawnSync(process.execPath,[admin,"project","add","cli-project","CLI Project",roRoot,"READ_ONLY"],{env:cliEnv,encoding:"utf8"});
 assert.equal(cli.status,0,cli.stderr);
 cli=spawnSync(process.execPath,[admin,"project","disable","cli-project"],{env:cliEnv,encoding:"utf8"});
 assert.equal(cli.status,0,cli.stderr);
 cli=spawnSync(process.execPath,[admin,"project","inspect","cli-project"],{env:cliEnv,encoding:"utf8"});
 assert.equal(cli.status,0,cli.stderr);assert.equal(JSON.parse(cli.stdout).enabled,false);
 log("operator CLI init/add/disable/inspect works without MCP authority mutation");

 const authFile=join(root,"business.key"),token=randomBytes(32).toString("base64url");
 writeFileSync(authFile,token,{mode:0o600});chmodSync(authFile,0o600);
 const port=await freePort();
 server=spawn(process.execPath,[fileURLToPath(new URL("./business-mcp-server.mjs",import.meta.url))],{
  env:{...process.env,CHATAGENT_BUSINESS_STATE_DIR:state,
   CHATAGENT_BUSINESS_AUTH_FILE:authFile,CHATAGENT_BUSINESS_PORT:String(port)},
  stdio:["ignore","pipe","pipe"]
 });
 let serverErr="";server.stderr.on("data",x=>serverErr+=String(x).slice(0,1000));
 await wait(server,port);

 let rpcId=0;
 const post=async(payload,headers={})=>{
  const r=await fetch("http://127.0.0.1:"+port+"/mcp",{
   method:"POST",headers:{"content-type":"application/json","accept":"application/json, text/event-stream",
    "x-chatagent-business-credential":token,...headers},
   body:JSON.stringify(payload),signal:AbortSignal.timeout(5000)
  });
  return {status:r.status,body:await r.json()};
 };
 const rpc=async(method,params={})=>post({jsonrpc:"2.0",id:++rpcId,method,params});
 let response=await rpc("initialize",{protocolVersion:"2025-03-26",capabilities:{},
  clientInfo:{name:"business-b1-test",version:"1"}});
 assert.equal(response.status,200);assert.ok(!response.body.error,JSON.stringify(response.body));
 response=await rpc("tools/list",{});
 assert.equal(response.status,200);
 assert.deepEqual(response.body.result.tools.map(x=>x.name),["business_status"]);
 assert.equal(response.body.result.tools.some(x=>x.name==="set_profile"),false);
 log("B1 Business MCP exposes only bounded business_status and no profile setter");

 response=await rpc("tools/call",{name:"business_status",arguments:{}});
 assert.equal(response.status,200);assert.ok(!response.body.error,JSON.stringify(response.body));
 const publicStatus=response.body.result.structuredContent;
 assert.equal(publicStatus.organization.organizationId,"acme");
 assert.equal(JSON.stringify(publicStatus).includes("hostRoot"),false);
 assert.equal(JSON.stringify(publicStatus).includes(roRoot),false);

 response=await rpc("tools/call",{name:"business_status",arguments:{profile:"STANDARD"}});
 assert.equal(response.status,200);
 assert.equal(response.body.result?.isError===true||response.body.error!==undefined,true);
 log("tool-argument profile injection is rejected by strict MCP schema");

 response=await post({jsonrpc:"2.0",id:++rpcId,method:"tools/list",params:{}},
  {"x-chatagent-business-profile":"STANDARD"});
 assert.equal(response.status,400);
 assert.equal(response.body.error.message,"AUTHORITY_INPUT_FORBIDDEN");
 log("header profile injection is rejected before MCP dispatch");

 const unauth=await fetch("http://127.0.0.1:"+port+"/mcp",{
  method:"POST",headers:{"content-type":"application/json","accept":"application/json, text/event-stream"},
  body:JSON.stringify({jsonrpc:"2.0",id:++rpcId,method:"tools/list",params:{}})
 });
 assert.equal(unauth.status,401);
 log("organization deployment credential is required");

 console.log("BUSINESS_B1_PROJECT_BOUNDARY=PASS");
}catch(e){
 console.error("BUSINESS_B1_PROJECT_BOUNDARY=FAIL "+e.stack);
 process.exitCode=1;
}finally{
 if(server)server.kill("SIGTERM");
 await delay(250);
 rmSync(root,{recursive:true,force:true});
 console.log("test_only_fixture_cleanup=COMPLETE");
}
