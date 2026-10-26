window.STARTUP_OS_CONFIG = {
  runtimeUrl: "/api/runtime",
  runtimeProvider: "Firebase + OpenAI Responses API",
  functionalBuildVersion: "3.1.0"
};
(function(){
  function destination(stage){
    var id="";
    try {
      var pack=window.StartupOSStore.read();
      var selected=window.StartupOSDashboard?.getSession()?._sessionId||pack?.activeId;
      if(selected)id="?sessionId="+encodeURIComponent(selected);
    } catch(e){}
    var section=stage==="iterate"?"#refineHost":stage==="deploy"?"#deploy-stage":stage==="phone"?"#phone-stage":"#autobuildHost";
    return "/builder/"+id+section;
  }
  document.addEventListener("click",function(event){
    var button=event.target.closest("button");
    if(!button)return;
    var stage=button.dataset.view;
    if(["build","deploy","phone","iterate"].includes(stage)||["generateMvp","publishMvp","openPrototype","testPublishAuth"].includes(button.id)){
      event.preventDefault();
      event.stopImmediatePropagation();
      location.assign(destination(stage||"build"));
    }
  },true);
})();
