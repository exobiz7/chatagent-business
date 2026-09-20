import {readFileSync,lstatSync} from "node:fs";
import {isAbsolute} from "node:path";
const slug=/^[a-z0-9][a-z0-9._-]{0,127}$/;
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ROUTES=Object.freeze({
 get_project_context:"/v1/projects/context",
 search_memory:"/v1/search",
 get_task:"/v1/tasks/get"
});
export class PersonalMemoryReadAdapter {
 constructor(broker,{url,tokenFile,allowedProjects}={}){
  if(typeof url!=="string"||!/^http:\/\/127\.0\.0\.1:\d{4,5}$/.test(url))
   throw Error("MEMORY_URL_UNSAFE");
  if(typeof tokenFile!=="string"||!isAbsolute(tokenFile))
   throw Error("MEMORY_TOKEN_FILE_UNSAFE");
  const st=lstatSync(tokenFile);
  if(!st.isFile()||st.isSymbolicLink()||st.nlink!==1||(st.mode&0o077)!==0||
     (typeof process.getuid==="function"&&st.uid!==process.getuid()))
   throw Error("MEMORY_TOKEN_FILE_UNSAFE");
  const token=readFileSync(tokenFile,"utf8").trim();
  if(!/^[A-Za-z0-9._~+/=-]{32,256}$/.test(token))throw Error("MEMORY_TOKEN_INVALID");
  const projects=allowedProjects?.split(",")??[];
  if(projects.length<1||projects.length>16||projects.some(x=>!slug.test(x))||
     new Set(projects).size!==projects.length)throw Error("MEMORY_PROJECT_ALLOWLIST_REQUIRED");
  this.broker=broker;this.url=url;this.token=token;this.projects=new Set(projects);
 }
 assertOwner(){
  const status=this.broker.status();
  if(!status.paired||status.mode!=="FULL_HOST")throw Error("ACCESS_REQUIRED");
 }
 validate(op,input){
  if(!Object.hasOwn(ROUTES,op))throw Error("MEMORY_OPERATION_DENIED");
  if(!input||Array.isArray(input)||typeof input!=="object")
   throw Error("INVALID_MEMORY_INPUT");
  const keys=Object.keys(input);
  const permitted=op==="get_task"?["taskId"]:
    op==="get_project_context"?["projectId"]:
    ["projectId","query","types","limit"];
  if(keys.some(k=>!permitted.includes(k)))throw Error("INVALID_MEMORY_INPUT");
  if(op==="get_task"){
   if(!uuid.test(input.taskId??""))throw Error("INVALID_MEMORY_INPUT");
   return {taskId:input.taskId};
  }
  if(!this.projects.has(input.projectId))throw Error("MEMORY_PROJECT_DENIED");
  if(op==="get_project_context")return {projectId:input.projectId};
  if(typeof input.query!=="string"||input.query.length<1||input.query.length>256)
   throw Error("INVALID_MEMORY_INPUT");
  if(input.limit!==undefined&&(!Number.isInteger(input.limit)||input.limit<1||input.limit>20))
   throw Error("INVALID_MEMORY_INPUT");
  if(input.types!==undefined&&(!Array.isArray(input.types)||input.types.length<1||
       input.types.length>4||new Set(input.types).size!==input.types.length||
       input.types.some(x=>!["task","checkpoint","decision","fact"].includes(x))))
   throw Error("INVALID_MEMORY_INPUT");
  return {projectId:input.projectId,query:input.query,limit:input.limit??20,
    ...(input.types?{types:input.types}:{})};
 }
 async call(op,input){
  this.assertOwner();
  const query=this.validate(op,input);
  let response;
  try{
   response=await fetch(this.url+ROUTES[op],{method:"POST",redirect:"error",
    headers:{"content-type":"application/json",authorization:"Bearer "+this.token},
    body:JSON.stringify(query),signal:AbortSignal.timeout(10000)});
  }catch{throw Error("MEMORY_UNAVAILABLE");}
  if(response.status===401||response.status>=500)throw Error("MEMORY_UNAVAILABLE");
  if(!response.ok)throw Error("MEMORY_QUERY_FAILED");
  const reader=response.body?.getReader();
  if(!reader)throw Error("MEMORY_UNAVAILABLE");
  const parts=[];let size=0;
  try{
   for(;;){
    const {done,value}=await reader.read();
    if(done)break;
    size+=value.byteLength;
    if(size>65536)throw Error("MEMORY_RESPONSE_LIMIT");
    parts.push(value);
   }
  }catch(e){await reader.cancel().catch(()=>{});throw e;}
  let result;
  try{result=JSON.parse(Buffer.concat(parts).toString("utf8"));}
  catch{throw Error("MEMORY_UNAVAILABLE");}
  if(!result||typeof result!=="object"||Array.isArray(result))
   throw Error("MEMORY_UNAVAILABLE");
  // The P8 get_task endpoint takes only taskId; validate the *result* project
  // before forwarding any data, since a project filter isn't in that API.
  if(op==="get_task"&&!this.projects.has(result.task?.projectId))
   throw Error("MEMORY_PROJECT_DENIED");
  return result;
 }
}
