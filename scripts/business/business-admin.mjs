#!/usr/bin/env node
import {BusinessRegistry} from "./business-core.mjs";

const state=process.env.CHATAGENT_BUSINESS_STATE_DIR;
if(!state)throw Error("CHATAGENT_BUSINESS_STATE_DIR_REQUIRED");

const args=process.argv.slice(2);
const out=value=>process.stdout.write(JSON.stringify(value,null,2)+"\n");
const [area,action,...rest]=args;

if(area==="organization"&&action==="init"){
 const [organizationId,displayName]=rest;
 const registry=new BusinessRegistry(state,{initialize:true,organizationId,displayName});
 out({organization:registry.organization()});
}else{
 const registry=new BusinessRegistry(state);
 if(area!=="project")throw Error("BUSINESS_ADMIN_COMMAND_INVALID");
 if(action==="add"){
  const [projectId,displayName,hostRoot,profile]=rest;
  out(registry.addProject({projectId,displayName,hostRoot,profile}));
 }else if(action==="list"){
  out({projects:registry.list()});
 }else if(action==="enable"){
  out(registry.setEnabled(rest[0],true));
 }else if(action==="disable"){
  out(registry.setEnabled(rest[0],false));
 }else if(action==="inspect"){
  out(registry.inspect(rest[0]));
 }else{
  throw Error("BUSINESS_ADMIN_COMMAND_INVALID");
 }
}
