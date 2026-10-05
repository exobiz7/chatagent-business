import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname,resolve} from 'node:path';

const here=dirname(fileURLToPath(import.meta.url));
const root=resolve(here,'../../..');
const toolManifest=JSON.parse(readFileSync(resolve(root,'docs/verification/v1.1/B_S0_TOOL_CONTRACT_CANDIDATE.json'),'utf8'));
const golden=JSON.parse(readFileSync(resolve(root,'docs/verification/v1.1/B_S0_TOOL_SELECTION_GOLDEN_SET.json'),'utf8'));

const tools=toolManifest.tools;
const names=tools.map(x=>x.name);
assert.equal(new Set(names).size,names.length,'DUPLICATE_TOOL_NAME');
assert.ok(names.length>0,'EMPTY_TOOL_INVENTORY');
assert.equal(toolManifest.principles.toolCountConstrained,false,'TOOL_COUNT_MUST_NOT_BE_CONSTRAINED');

const namePattern=/^[a-z][a-z0-9]*_[a-z][a-z0-9]*_[a-z][a-z0-9_]*$/;
for(const t of tools){
  assert.match(t.name,namePattern,`BAD_TOOL_NAME:${t.name}`);
  for(const k of ['readOnlyHint','destructiveHint','openWorldHint'])
    assert.equal(typeof t.annotations?.[k],'boolean',`MISSING_ANNOTATION:${t.name}:${k}`);
}
for(const banned of ['git_inspect','git_prepare','git_sync','git_publish','exec_host_start','exec_isolated_start','continuity_open','continuity_search'])
  assert.equal(names.includes(banned),false,`STALE_UMBRELLA_TOOL:${banned}`);

const power=tools.filter(x=>x.powerTool===true);
assert.deepEqual(power.map(x=>x.name),['process_start_host']);
assert.deepEqual(power[0].annotations,{readOnlyHint:false,destructiveHint:true,openWorldHint:true});
assert.equal(tools.find(x=>x.name==='member_get_profile')?.meta?.['openai/profile'],true,'PROFILE_TOOL_META_MISSING');
assert.equal(names.includes('runtime_list_nodes'),true,'RUNTIME_NODE_DISCOVERY_MISSING');
assert.equal(names.includes('git_clone_repository'),true,'GIT_CLONE_SEMANTIC_TOOL_MISSING');

for(const tc of golden.cases){
  for(const n of [...(tc.expected??[]),...(tc.mustNotUse??[])]) assert.ok(names.includes(n),`GOLDEN_UNKNOWN_TOOL:${tc.id}:${n}`);
  if((tc.expected??[]).length && tc.expected.includes('process_start_host')) assert.equal(tc.mustNotUse.length,0,`POWER_TOOL_CASE_CONTRADICTORY:${tc.id}`);
}

// Minimal authority/routing prototype. This is deliberately transport-agnostic:
// actual relay transport is implemented later, but routing/ownership semantics are executable here.
const now=1_000_000;
const members=new Map([
  ['mA',{status:'ACTIVE',role:'MEMBER'}],
  ['mB',{status:'ACTIVE',role:'MEMBER'}],
  ['mC',{status:'ACTIVE',role:'MEMBER'}],
]);
const nodes=new Map([
  ['nodeB',{type:'PERSONAL_NODE',owner:'mB',status:'APPROVED',mappings:new Map([['backend','/Users/b/work/backend']])}],
  ['nodeC',{type:'PERSONAL_NODE',owner:'mC',status:'APPROVED',mappings:new Map([['backend','/Users/c/work/backend']])}],
  ['shared1',{type:'SHARED_NODE',owner:null,status:'APPROVED',hostPowerEnabled:false,mappings:new Map([['backend','/srv/company/backend']])}],
]);

function authorizeRoute({memberId,nodeId,projectId,tool=null,controlReachable=true,tokenExp=now+3600,leaseExp=now+900,cachedNodeStatus='APPROVED'}){
  const member=members.get(memberId);
  if(!member||member.status!=='ACTIVE') throw Error('MEMBER_DENIED');
  if(tokenExp<=now) throw Error('AUTH_TOKEN_EXPIRED');
  const node=nodes.get(nodeId);
  if(!node) throw Error('NODE_UNKNOWN');
  if(controlReachable){
    if(node.status!=='APPROVED') throw Error('NODE_REVOKED');
  }else{
    if(leaseExp<=now||cachedNodeStatus!=='APPROVED') throw Error('AUTH_LEASE_EXPIRED');
  }
  if(node.type==='PERSONAL_NODE'&&node.owner!==memberId) throw Error('PERSONAL_NODE_OWNER_MISMATCH');
  if(node.type==='SHARED_NODE'&&tool==='process_start_host'&&node.hostPowerEnabled!==true) throw Error('SHARED_HOST_POWER_DENIED');
  if(!node.mappings.has(projectId)) throw Error('PROJECT_NOT_MAPPED');
  return {nodeId,localPath:node.mappings.get(projectId)};
}

assert.equal(authorizeRoute({memberId:'mB',nodeId:'nodeB',projectId:'backend'}).localPath,'/Users/b/work/backend');
assert.throws(()=>authorizeRoute({memberId:'mC',nodeId:'nodeB',projectId:'backend'}),/PERSONAL_NODE_OWNER_MISMATCH/);
assert.throws(()=>authorizeRoute({memberId:'mB',nodeId:'nodeB',projectId:'unmapped'}),/PROJECT_NOT_MAPPED/);
nodes.get('nodeB').status='REVOKED';
assert.throws(()=>authorizeRoute({memberId:'mB',nodeId:'nodeB',projectId:'backend',controlReachable:true}),/NODE_REVOKED/);
assert.equal(authorizeRoute({memberId:'mB',nodeId:'nodeB',projectId:'backend',controlReachable:false,leaseExp:now+10,cachedNodeStatus:'APPROVED'}).nodeId,'nodeB');
assert.throws(()=>authorizeRoute({memberId:'mB',nodeId:'nodeB',projectId:'backend',controlReachable:false,leaseExp:now-1,cachedNodeStatus:'APPROVED'}),/AUTH_LEASE_EXPIRED/);
nodes.get('nodeB').status='APPROVED';
assert.equal(authorizeRoute({memberId:'mA',nodeId:'shared1',projectId:'backend'}).nodeId,'shared1');
assert.throws(()=>authorizeRoute({memberId:'mA',nodeId:'shared1',projectId:'backend',tool:'process_start_host'}),/SHARED_HOST_POWER_DENIED/);
nodes.get('shared1').hostPowerEnabled=true;
assert.equal(authorizeRoute({memberId:'mA',nodeId:'shared1',projectId:'backend',tool:'process_start_host'}).nodeId,'shared1');
nodes.get('shared1').hostPowerEnabled=false;

function resolveNode({memberId,projectId,requestedNodeId=null}){
  const eligible=[];
  for(const [nodeId,node] of nodes){
    if(node.status!=='APPROVED'||!node.mappings.has(projectId)) continue;
    if(node.type==='PERSONAL_NODE'&&node.owner!==memberId) continue;
    eligible.push(nodeId);
  }
  if(requestedNodeId){
    if(!eligible.includes(requestedNodeId)) throw Error('RUNTIME_NODE_DENIED');
    return requestedNodeId;
  }
  if(eligible.length===0) throw Error('RUNTIME_NODE_UNAVAILABLE');
  if(eligible.length>1) throw Error('RUNTIME_NODE_REQUIRED');
  return eligible[0];
}
assert.throws(()=>resolveNode({memberId:'mB',projectId:'backend'}),/RUNTIME_NODE_REQUIRED/); // nodeB + shared1
assert.equal(resolveNode({memberId:'mB',projectId:'backend',requestedNodeId:'nodeB'}),'nodeB');
assert.throws(()=>resolveNode({memberId:'mC',projectId:'backend',requestedNodeId:'nodeB'}),/RUNTIME_NODE_DENIED/);

// Outbound-relay semantics prototype: gateway queues after authorization; nodes pull only their own jobs.
class RelayQueue{
  #queues=new Map();
  enqueue(actor,nodeId,projectId,payload){
    authorizeRoute({memberId:actor,nodeId,projectId});
    const q=this.#queues.get(nodeId)??[];
    const job={id:`job-${nodeId}-${q.length+1}`,actor,nodeId,projectId,payload};
    q.push(job);this.#queues.set(nodeId,q);return job.id;
  }
  poll(nodeId){const q=this.#queues.get(nodeId)??[];return q.shift()??null;}
}
const relay=new RelayQueue();
const jobId=relay.enqueue('mB','nodeB','backend',{tool:'git_get_status'});
assert.match(jobId,/^job-nodeB-/);
assert.equal(relay.poll('nodeC'),null);
assert.equal(relay.poll('nodeB')?.actor,'mB');
assert.throws(()=>relay.enqueue('mC','nodeB','backend',{tool:'git_get_status'}),/PERSONAL_NODE_OWNER_MISMATCH/);

console.log(`PASS tool inventory unique/focused count=${names.length} with no count constraint`);
console.log('PASS naming convention and stale umbrella-name rejection');
console.log('PASS truthful annotation presence and power-tool risk class');
console.log(`PASS golden-set references valid cases=${golden.cases.length}; live model-selection run still required`);
console.log('PASS member/profile and runtime-node discovery requirements present');
console.log('PASS explicit project mapping and PERSONAL_NODE owner isolation prototype');
console.log('PASS SHARED_NODE generic host power denied by default and allowed only after explicit node opt-in');
console.log('PASS bounded authorization lease behavior under control-plane outage');
console.log('PASS outbound relay ownership/routing logic prototype');
console.log('BUSINESS_V11_BS0_ARCHITECTURE_PROBE=PASS');
