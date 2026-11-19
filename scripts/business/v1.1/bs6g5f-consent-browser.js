/* Candidate browser-only consent client, NOT enabled by preview server.
   All scripts self-hosted from a pinned dependency; no signup or third-party CDN. */
(async()=>{
  'use strict';
  const $=id=>document.getElementById(id);
  const show=(message)=>{$('message').textContent=message;};
  const cfg=await (await fetch('/assets/config.json',{cache:'no-store'})).json();
  if(cfg.mode!=='PREVIEW_ONLY'){
    show('Consent is unavailable until the authorized staging release gate.');
    return;
  }
  $('message').textContent='Preview only — OAuth and account login are disabled.';
  $('client').textContent='Client ID must be registered and reviewed before activation.';
  $('redirect').textContent='Exact ChatGPT callback URI has not been approved.';
  $('scopes').textContent='openid, email, profile (proposed)';
  $('login').disabled=true;
  $('approve').disabled=true;
  $('deny').disabled=true;
})();
