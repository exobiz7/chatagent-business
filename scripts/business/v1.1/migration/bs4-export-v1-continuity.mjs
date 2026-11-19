#!/usr/bin/env node
import {closeSync,existsSync,fsyncSync,lstatSync,openSync,writeSync} from 'node:fs';
import {dirname,isAbsolute,resolve} from 'node:path';
import {exportBusinessV1Continuity} from './v1-sqlite-logical-export.mjs';

const fail=code=>{throw Error(code);};
const owner=()=>typeof process.getuid==='function'?process.getuid():null;
function parentSafe(path){
  const parent=dirname(path),st=lstatSync(parent);
  if(!st.isDirectory()||st.isSymbolicLink()||(st.mode&0o077)!==0||(owner()!==null&&st.uid!==owner()))fail('BUSINESS_MIGRATION_OUTPUT_PARENT_UNSAFE');
}
function args(argv){
  const out={};for(let i=0;i<argv.length;i+=2){const key=argv[i],value=argv[i+1];if(!value||!['--source-state-dir','--output'].includes(key)||out[key])fail('BUSINESS_MIGRATION_CLI_USAGE');out[key]=value;}
  if(Object.keys(out).length!==2||!isAbsolute(out['--source-state-dir'])||!isAbsolute(out['--output'])||resolve(out['--output'])==='/')fail('BUSINESS_MIGRATION_CLI_USAGE');
  return {sourceStateDir:out['--source-state-dir'],output:out['--output']};
}

try{
  const {sourceStateDir,output}=args(process.argv.slice(2));parentSafe(output);if(existsSync(output))fail('BUSINESS_MIGRATION_OUTPUT_EXISTS');
  const bundle=exportBusinessV1Continuity({sourceStateDir}),body=Buffer.from(JSON.stringify(bundle,null,2)+'\n');
  const fd=openSync(output,'wx',0o600);try{let offset=0;while(offset<body.length){const n=writeSync(fd,body,offset,body.length-offset);if(n<=0)fail('BUSINESS_MIGRATION_OUTPUT_WRITE_FAILED');offset+=n;}fsyncSync(fd);}finally{closeSync(fd);}
  const result={exported:true,organizationId:bundle.payload.organizationId,counts:bundle.payload.counts,logicalDigest:bundle.logicalDigest,sourceVersion:bundle.sourceVersion};
  process.stdout.write(JSON.stringify(result)+'\n');
}catch(error){process.stderr.write(String(error?.message??'BUSINESS_MIGRATION_EXPORT_FAILED')+'\n');process.exitCode=1;}
