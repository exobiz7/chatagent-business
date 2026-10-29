import {assertRuntimeAuthorization} from '../control/runtime-authorization-lease.mjs';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SLUG=/^[a-z0-9][a-z0-9._-]{0,63}$/;
const fail=code=>{throw Error(code);};

function member(value){
  if(typeof value!=='string'||value.length<8||value.length>512||/[\0\r\n]/.test(value))
    fail('BUSINESS_AUTHENTICATED_MEMBER_INVALID');
  return value;
}
function nodeId(value){if(typeof value!=='string'||!UUID.test(value))fail('BUSINESS_RUNTIME_NODE_ID_INVALID');return value.toLowerCase();}
function rootId(value){if(typeof value!=='string'||!SLUG.test(value))fail('BUSINESS_WORKSPACE_ROOT_ID_INVALID');return value;}
function organizationId(value){
  if(typeof value!=='string'||value.length<1||value.length>128||/[\0\r\n]/.test(value))fail('BUSINESS_ORGANIZATION_ID_INVALID');
  return value;
}

export class BusinessWorkspaceRootPolicy{
  constructor({workspaceRegistry,runtimeRegistry,loadOrganizationId}={}){
    if(!workspaceRegistry||typeof workspaceRegistry.resolveWorkspaceRootForEffect!=='function'||
       !runtimeRegistry||typeof runtimeRegistry.status!=='function'||typeof loadOrganizationId!=='function')
      fail('BUSINESS_WORKSPACE_ROOT_POLICY_CONFIG_INVALID');
    this.workspaceRegistry=workspaceRegistry;
    this.runtimeRegistry=runtimeRegistry;
    this.loadOrganizationId=loadOrganizationId;
  }

  async authorizeClone({authenticatedMemberKey,runtimeNodeId,workspaceRootId}={}){
    authenticatedMemberKey=member(authenticatedMemberKey);
    runtimeNodeId=nodeId(runtimeNodeId);workspaceRootId=rootId(workspaceRootId);
    if(runtimeNodeId!==this.workspaceRegistry.nodeId)fail('BUSINESS_RUNTIME_NODE_MISMATCH');
    const root=this.workspaceRegistry.resolveWorkspaceRootForEffect(workspaceRootId);
    const [node,organization]=await Promise.all([
      this.runtimeRegistry.status(runtimeNodeId),
      this.loadOrganizationId({authenticatedMemberKey})
    ]);
    if(node?.nodeId!==runtimeNodeId)fail('BUSINESS_RUNTIME_NODE_MISMATCH');
    assertRuntimeAuthorization({node,controlReachable:true,toolName:'git_clone_repository'});
    return Object.freeze({
      authorized:true,
      organizationId:organizationId(organization),
      runtimeNodeId,
      workspaceRootId,
      workspaceRootPath:root.path,
      node
    });
  }
}
