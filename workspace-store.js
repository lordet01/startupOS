(function(){
 'use strict';
 window.StartupOSStore=window.StartupOSWorkspace.storage(localStorage);
 window.addEventListener('storage',e=>{
  if(e.key===window.StartupOSStore.key())window.dispatchEvent(new CustomEvent('startupos:workspace-storage'));
 });
})();
