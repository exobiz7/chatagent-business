const fail=code=>{throw Error(code);};

export async function settleBs3g1IsolatedCanary({isolated,authenticatedMemberKey,started,marker='BS3G1_ISOLATED_OK',maxPolls=20,waitMs=500,maxBytes=65536}={}){
  if(!isolated||typeof isolated.readOutput!=='function'||typeof authenticatedMemberKey!=='string'||!started||typeof started!=='object')
    fail('BS3G1_ISOLATED_RESULT_INVALID');
  let out={...started},content=out.content??'',cursor=out.cursor??0;
  for(let i=0;i<maxPolls&&out.state==='RUNNING';i++){
    const part=await isolated.readOutput({authenticatedMemberKey,processId:out.processId,cursor,maxBytes,waitMs});
    content+=part.content??'';cursor=part.cursor??cursor;out={...part,content};
  }
  if(out.state!=='EXITED'||out.exitCode!==0||!content.includes(marker))fail('BS3G1_ISOLATED_RESULT_INVALID');
  return {...out,content};
}
