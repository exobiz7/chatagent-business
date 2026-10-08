import {assertRuntimeAuthorization} from '../control/runtime-authorization-lease.mjs';

const SLUG=/^[a-z0-9][a-z0-9._-]{0,63}$/;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TOOL=/^[a-z][a-z0-9]*_[a-z][a-z0-9]*_[a-z][a-z0-9_]*$/;
const fail=code=>{throw Error(code);};

const normalizedNode=node=>{
  if(!node||typeof node!=='object'||Array.isArray(node)||!UUID.test(node.nodeId??'')||
     !['PERSONAL_NODE','SHARED_NODE'].includes(node.nodeType)||
     !['PENDING','APPROVED','REVOKED'].includes(node.lifecycle)||
     typeof node.ownedByCaller!=='boolean'||typeof node.sharedHostPowerEnabled!=='boolean')
    fail('BUSINESS_RUNTIME_ROUTE_INPUT_INVALID');
  return node;
};

const normalizedMapping=(mapping,nodeId,projectId)=>{
  if(!mapping||typeof mapping!=='object'||Array.isArray(mapping)||mapping.runtimeNodeId!==nodeId||
     mapping.projectId!==projectId||!Number.isSafeInteger(mapping.mappingRevision)||mapping.mappingRevision<1||
     typeof mapping.canonicalPath!=='string'||!mapping.canonicalPath.startsWith('/'))
    fail('BUSINESS_RUNTIME_MAPPING_INVALID');
  return mapping;
};

function authorizeRouteEntry(entry,{projectId,toolName,controlReachable,nowMs}){
  if(!entry||typeof entry!=='object'||Array.isArray(entry))fail('BUSINESS_RUNTIME_ROUTE_INPUT_INVALID');
  const node=normalizedNode(entry.node);
  const mapping=normalizedMapping(entry.mapping,node.nodeId,projectId);
  const authorization=assertRuntimeAuthorization({
    node,session:entry.session??null,controlReachable,nowMs,toolName
  });
  return Object.freeze({
    nodeId:node.nodeId,
    nodeType:node.nodeType,
    mappingRevision:mapping.mappingRevision,
    localProjectRoot:mapping.canonicalPath,
    workspaceRootId:mapping.workspaceRootId,
    workspaceRelativePath:mapping.workspaceRelativePath,
    authorizationSource:authorization.source,
    ...(authorization.leaseExpiresAt?{leaseExpiresAt:authorization.leaseExpiresAt}:{})
  });
}

export function resolveBusinessRuntimeRoute({
  projectId,runtimeNodeId=null,toolName,routes,controlReachable=true,nowMs=Date.now()
}={}){
  if(typeof projectId!=='string'||!SLUG.test(projectId)||
     !(runtimeNodeId===null||runtimeNodeId===undefined||UUID.test(runtimeNodeId))||
     typeof toolName!=='string'||!TOOL.test(toolName)||
     !Array.isArray(routes)||typeof controlReachable!=='boolean'||!Number.isFinite(nowMs))
    fail('BUSINESS_RUNTIME_ROUTE_INPUT_INVALID');

  const requested=runtimeNodeId??null;
  if(requested){
    const entry=routes.find(x=>x?.node?.nodeId===requested);
    if(!entry)fail('BUSINESS_RUNTIME_NODE_DENIED');
    try{return authorizeRouteEntry(entry,{projectId,toolName,controlReachable,nowMs});}
    catch(error){
      const code=String(error?.message??'');
      if(['BUSINESS_PERSONAL_NODE_OWNER_MISMATCH','BUSINESS_SHARED_HOST_POWER_DENIED',
          'BUSINESS_RUNTIME_NODE_REVOKED','BUSINESS_RUNTIME_NODE_PENDING','BUSINESS_AUTH_LEASE_EXPIRED',
          'BUSINESS_RUNTIME_MAPPING_INVALID'].includes(code))throw error;
      fail('BUSINESS_RUNTIME_NODE_DENIED');
    }
  }

  const eligible=[];
  for(const entry of routes){
    try{eligible.push(authorizeRouteEntry(entry,{projectId,toolName,controlReachable,nowMs}));}
    catch(error){
      const code=String(error?.message??'');
      if(code==='BUSINESS_RUNTIME_ROUTE_INPUT_INVALID')throw error;
      // Ineligible routes are intentionally skipped for implicit selection.
    }
  }
  if(eligible.length===0)fail('BUSINESS_RUNTIME_NODE_UNAVAILABLE');
  if(eligible.length>1)fail('BUSINESS_RUNTIME_NODE_REQUIRED');
  return eligible[0];
}

export function publicRuntimeRoute(route){
  if(!route||typeof route!=='object'||Array.isArray(route)||!UUID.test(route.nodeId??'')||
     !['PERSONAL_NODE','SHARED_NODE'].includes(route.nodeType)||
     !Number.isSafeInteger(route.mappingRevision)||route.mappingRevision<1)
    fail('BUSINESS_RUNTIME_ROUTE_INPUT_INVALID');
  return Object.freeze({
    runtimeNodeId:route.nodeId,
    nodeType:route.nodeType,
    mappingRevision:route.mappingRevision,
    authorizationSource:route.authorizationSource
  });
}
