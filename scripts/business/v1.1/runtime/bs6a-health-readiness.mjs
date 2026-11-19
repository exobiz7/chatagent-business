// Pure classification for the read-only B-S6 pre-cutover readiness gate.
// A 404, non-200, wrong phase or unhealthy JSON body must never count as READY.
export function isReadyV1Health(status,body){
 return status===200 && body!==null && typeof body==='object' &&
  body.ready===true && body.phase==='B5' && body.execReady===true && body.execHealthy===true;
}
export function isReadyTunnel(healthz,readyz){
 return healthz===200 && readyz===200;
}
