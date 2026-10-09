window.STARTUP_OS_CONFIG = {
  runtimeUrl: "/api/runtime",
  runtimeProvider: "Vercel + OpenAI Responses API",
  functionalBuildVersion: "3.1.0"
};
(function(){
  function destination(stage){
    var id="";
    try {
      var pack=JSON.parse(localStorage.getItem("startupOS.sessions.v1")||"null");
      if(pack&&pack.activeId)id="?sessionId="+encodeURIComponent(pack.activeId);
    } catch(e){}
    var section=stage==="deploy"?"#deploy-stage":stage==="phone"?"#phone-stage":"#scope-stage";
    return "/builder/"+id+section;
  }
  document.addEventListener("click",function(event){
    var button=event.target.closest("button");
    if(!button)return;
    var stage=button.dataset.view;
    if(["build","deploy","phone"].includes(stage)||["generateMvp","publishMvp","openPrototype","testPublishAuth"].includes(button.id)){
      event.preventDefault();
      event.stopImmediatePropagation();
      location.assign(destination(stage||"build"));
    }
  },true);
})();
