'use strict';
const {onRequest}=require('firebase-functions/v2/https');
const {onDocumentCreated}=require('firebase-functions/v2/firestore');
const {initializeApp,getApps}=require('firebase-admin/app');
const {getAuth}=require('firebase-admin/auth');
const {getFirestore,FieldValue}=require('firebase-admin/firestore');
const {createRouter}=require('./router.cjs');
// Configure public identifiers and require account verification before loading APIs.
require('./config.cjs').configure();
if(!getApps().length)initializeApp({projectId:process.env.FIREBASE_PROJECT_ID});
const db=getFirestore(),access=require('./access.cjs').createAccess({auth:getAuth(),db});
const apps=require('./apps.cjs').createApps({db,B:require('./app/lib/build-contract'),A:require('./app/lib/assemble'),V:require('./app/lib/verify'),branding:require('./app/lib/branding')});
const load=name=>name==='publish'?apps.handler:require('./app/api/'+name+'.js');
const jobs=require('./jobs.cjs').createJobs({db,load,access,deleteField:()=>FieldValue.delete()});
const shared={region:'asia-east1',memory:'512MiB',minInstances:0,maxInstances:2,concurrency:8,serviceAccount:'startupos-runtime@startupos-6b8d4.iam.gserviceaccount.com'};
exports.startupApi=onRequest({...shared,timeoutSeconds:60,secrets:['OPENAI_API_KEY']},createRouter(load,{access,jobs}));
exports.startupWeb=onRequest({...shared,timeoutSeconds:60},require('./web.cjs').createWeb({access,root:require('node:path').join(__dirname,'web'),apps}));
exports.startupJob=onDocumentCreated({...shared,concurrency:1,timeoutSeconds:540,retry:true,secrets:['OPENAI_API_KEY'],document:'startupJobs/{jobId}'},event=>jobs.run(event.params.jobId));
