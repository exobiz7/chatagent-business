import assert from 'node:assert/strict';
import {settleBs3g1IsolatedCanary} from './runtime/bs3g1-isolated-canary-settle.mjs';
const reads=[];
const isolated={async readOutput(args){reads.push(args);return {processId:args.processId,state:'EXITED',exitCode:0,cursor:18,content:'BS3G1_ISOLATED_OK\n',hasMore:false};}};
const out=await settleBs3g1IsolatedCanary({isolated,authenticatedMemberKey:'oauth-subject-member',started:{processId:'xexec_'+'a'.repeat(32),state:'RUNNING',exitCode:null,cursor:0,content:'',hasMore:false}});
assert.equal(reads.length,1);assert.equal(reads[0].waitMs,500);assert.equal(out.state,'EXITED');assert.equal(out.exitCode,0);assert.match(out.content,/BS3G1_ISOLATED_OK/);
await assert.rejects(()=>settleBs3g1IsolatedCanary({isolated:{async readOutput(){return {processId:'x',state:'EXITED',exitCode:1,cursor:0,content:'',hasMore:false};}},authenticatedMemberKey:'oauth-subject-member',started:{processId:'x',state:'RUNNING',cursor:0,content:''}}),/BS3G1_ISOLATED_RESULT_INVALID/);
console.log('PASS B-S3G-1 fixture settles RUNNING isolated start through bounded readOutput polling');
console.log('BUSINESS_S3G1_TERMINAL_SETTLE=PASS');
