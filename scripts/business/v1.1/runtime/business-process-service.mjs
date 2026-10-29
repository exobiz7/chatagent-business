const HOST=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISOLATED=/^xexec_[a-f0-9]{32}$/;
const fail=code=>{throw Error(code);};

export class BusinessProcessService{
  constructor({hostService,isolatedService}={}){
    if(!hostService||typeof hostService.startHost!=='function'||typeof hostService.getStatus!=='function'||
       typeof hostService.readOutput!=='function'||typeof hostService.terminateJob!=='function'||
       !isolatedService||typeof isolatedService.startIsolated!=='function'||typeof isolatedService.getStatus!=='function'||
       typeof isolatedService.readOutput!=='function'||typeof isolatedService.terminateJob!=='function')
      fail('BUSINESS_PROCESS_SERVICE_CONFIG_INVALID');
    this.hostService=hostService;this.isolatedService=isolatedService;
  }
  startHost(args){return this.hostService.startHost(args);}
  startIsolated(args){return this.isolatedService.startIsolated(args);}
  #service(processId){
    if(HOST.test(processId??''))return this.hostService;
    if(ISOLATED.test(processId??''))return this.isolatedService;
    fail('BUSINESS_PROCESS_NOT_OWNED');
  }
  getStatus(args={}){return this.#service(args.processId).getStatus(args);}
  readOutput(args={}){return this.#service(args.processId).readOutput(args);}
  terminateJob(args={}){return this.#service(args.processId).terminateJob(args);}
}
