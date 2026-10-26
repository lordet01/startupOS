'use strict';
// Public Web app identifiers, supplied by the project owner; no server secrets.
const webConfig=require('./web-config.json');
function configure(environment=process.env){
 for(const key of ['GCLOUD_PROJECT','GOOGLE_CLOUD_PROJECT','FIREBASE_PROJECT_ID']){
  if(environment[key]&&environment[key]!==webConfig.projectId)throw new Error('Firebase runtime project does not match the configured StartupOS Web app.');
 }
 for(const [key,value] of Object.entries({
  FIREBASE_API_KEY:webConfig.apiKey,
  FIREBASE_AUTH_DOMAIN:webConfig.authDomain,
  FIREBASE_PROJECT_ID:webConfig.projectId,
  FIREBASE_APP_ID:webConfig.appId,
  STARTUPOS_AUTH_REQUIRED:'true'
 }))environment[key]=value;
 return webConfig;
}
module.exports={configure};
