import {assertRuntimeAuthorization} from '../control/runtime-authorization-lease.mjs';

const SLUG=/^[a-z0-9][a-z0-9._-]{0,63}$/;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const fail=code=>{throw Error(code);};

function validateProjectAuthorization(value,projectId){
  if(!value||typeof value!=='object'||Array.isArray(value)||value.projectId!==projectId||value.authorized!==true)
    fail('BUSINESS_PROJECT_AUTHORIZATION_DENIED');
  return value;
}

export class BusinessRuntimeMappingService{
  constructor({workspaceRegistry,runtimeRegistry,authorizeProject}={}){
    if(!workspaceRegistry||typeof workspaceRegistry.mapProject!=='function'||typeof workspaceRegistry.unmapProject!=='function'||
       !runtimeRegistry||typeof runtimeRegistry.status!=='function'||typeof authorizeProject!=='function')
      fail('BUSINESS_RUNTIME_MAPPING_SERVICE_CONFIG_INVALID');
    this.workspaceRegistry=workspaceRegistry;
    this.runtimeRegistry=runtimeRegistry;
    this.authorizeProject=authorizeProject;
  }

  async #authorize({projectId,runtimeNodeId,toolName}){
    if(typeof projectId!=='string'||!SLUG.test(projectId)||typeof runtimeNodeId!=='string'||!UUID.test(runtimeNodeId))
      fail('BUSINESS_RUNTIME_MAPPING_INPUT_INVALID');
    validateProjectAuthorization(await this.authorizeProject(projectId),projectId);
    const node=await this.runtimeRegistry.status(runtimeNodeId);
    if(!node||node.nodeId!==runtimeNodeId)fail('BUSINESS_RUNTIME_NODE_DENIED');
    assertRuntimeAuthorization({node,controlReachable:true,toolName});
    return node;
  }

  async mapProject(args={}){
    await this.#authorize({projectId:args.projectId,runtimeNodeId:args.runtimeNodeId,toolName:'runtime_map_project'});
    return this.workspaceRegistry.mapProject(args);
  }

  async unmapProject(args={}){
    await this.#authorize({projectId:args.projectId,runtimeNodeId:args.runtimeNodeId,toolName:'runtime_unmap_project'});
    return this.workspaceRegistry.unmapProject(args);
  }
}
