import assert from 'node:assert/strict';
import {chmodSync,lstatSync,mkdtempSync,mkdirSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

import {BusinessRuntimeRegistry} from './control/business-runtime-registry.mjs';
import {loadOrCreateRuntimeNodeIdentity,loadRuntimeNodeIdentity} from './control/runtime-node-identity.mjs';
import {assertRuntimeAuthorization} from './control/runtime-authorization-lease.mjs';

const nodeId='30000000-0000-4000-8000-000000000001';
const operationId='40000000-0000-4000-8000-000000000001';
const calls=[];
const authSession={
  async ensureSession(){return {access_token:'a'.repeat(32)};},
  async rpc(name,args){
    calls.push({name,args});
    if(name==='bc_runtime_enroll')return {data:{nodeId:args.p_node_id,lifecycle:args.p_approve?'APPROVED':'PENDING'},error:null};
    if(name==='bc_runtime_status')return {data:{nodeId:args.p_node_id,lifecycle:'APPROVED'},error:null};
    if(name==='bc_runtime_list')return {data:{nodes:[],count:0},error:null};
    if(name==='bc_runtime_revoke')return {data:{nodeId:args.p_node_id,lifecycle:'REVOKED'},error:null};
    return {data:null,error:{message:'unexpected'}};
  }
};
const registry=new BusinessRuntimeRegistry({authSession});
assert.equal((await registry.enroll({nodeId,nodeName:'  Mac Studio  ',operationId})).lifecycle,'PENDING');
assert.deepEqual(calls.at(-1),{name:'bc_runtime_enroll',args:{
  p_node_id:nodeId,p_node_name:'Mac Studio',p_node_type:'PERSONAL_NODE',p_operation_id:operationId,
  p_approve:false,p_shared_host_power_enabled:false
}});
assert.equal((await registry.enroll({nodeId,nodeName:'Mac Studio',operationId,approve:true})).lifecycle,'APPROVED');
assert.equal((await registry.status(nodeId)).lifecycle,'APPROVED');
assert.deepEqual(await registry.list(),{nodes:[],count:0});
assert.equal((await registry.revoke({nodeId,operationId})).lifecycle,'REVOKED');
assert.throws(()=>registry.status('not-a-uuid'),/BUSINESS_RUNTIME_INPUT_INVALID/);

const denied=new BusinessRuntimeRegistry({authSession:{
  async ensureSession(){},async rpc(){return {data:null,error:{message:'rpc BUSINESS_PERSONAL_NODE_OWNER_MISMATCH detail'}};}
}});
await assert.rejects(()=>denied.status(nodeId),/BUSINESS_PERSONAL_NODE_OWNER_MISMATCH/);

const now=Date.now();
const personal={nodeId,nodeType:'PERSONAL_NODE',lifecycle:'APPROVED',ownedByCaller:true,sharedHostPowerEnabled:false};
assert.equal(assertRuntimeAuthorization({node:personal,controlReachable:true,nowMs:now}).source,'CONTROL_PLANE');
assert.equal(assertRuntimeAuthorization({
  node:personal,controlReachable:false,nowMs:now,
  session:{sessionState:'ACTIVE',leaseExpiresAt:new Date(now+30_000).toISOString()}
}).source,'CACHED_LEASE');
assert.throws(()=>assertRuntimeAuthorization({
  node:personal,controlReachable:false,nowMs:now,
  session:{sessionState:'ACTIVE',leaseExpiresAt:new Date(now-1).toISOString()}
}),/BUSINESS_AUTH_LEASE_EXPIRED/);
assert.throws(()=>assertRuntimeAuthorization({node:{...personal,lifecycle:'REVOKED'},controlReachable:true,nowMs:now}),/BUSINESS_RUNTIME_NODE_REVOKED/);
assert.throws(()=>assertRuntimeAuthorization({node:{...personal,ownedByCaller:false},controlReachable:true,nowMs:now}),/BUSINESS_PERSONAL_NODE_OWNER_MISMATCH/);
const shared={nodeId:'30000000-0000-4000-8000-000000000002',nodeType:'SHARED_NODE',lifecycle:'APPROVED',ownedByCaller:false,sharedHostPowerEnabled:false};
assert.throws(()=>assertRuntimeAuthorization({node:shared,controlReachable:true,nowMs:now,toolName:'process_start_host'}),/BUSINESS_SHARED_HOST_POWER_DENIED/);
assert.equal(assertRuntimeAuthorization({node:{...shared,sharedHostPowerEnabled:true},controlReachable:true,nowMs:now,toolName:'process_start_host'}).authorized,true);

const root=mkdtempSync(join(tmpdir(),'business-s1c-node-'));
chmodSync(root,0o700);
try{
  const path=join(root,'node-identity.json');
  const first=loadOrCreateRuntimeNodeIdentity(path,{nodeName:'Mac Studio Test'});
  const second=loadOrCreateRuntimeNodeIdentity(path,{nodeName:'Ignored Rename'});
  assert.equal(first.nodeId,second.nodeId);
  assert.equal(first.nodeName,'Mac Studio Test');
  assert.equal(loadRuntimeNodeIdentity(path).nodeId,first.nodeId);
  assert.equal(lstatSync(path).mode&0o777,0o600);

  const unsafe=join(root,'unsafe');
  mkdirSync(unsafe,{mode:0o777});
  chmodSync(unsafe,0o777);
  assert.throws(()=>loadOrCreateRuntimeNodeIdentity(join(unsafe,'node.json'),{nodeName:'x'}),/BUSINESS_NODE_PARENT_UNSAFE/);
} finally {
  rmSync(root,{recursive:true,force:true});
}

console.log('PASS Business runtime registry exposes frozen bc_runtime_* RPCs with bounded validated inputs');
console.log('PASS authorization lease permits bounded cached authority only before expiry and fails closed afterward');
console.log('PASS PERSONAL_NODE owner and SHARED_NODE host-power rules remain authoritative locally');
console.log('PASS persistent runtime-node identity is owner-private, random, stable and authority-neutral');
console.log('BUSINESS_S1C_RUNTIME_CLIENT=PASS');
