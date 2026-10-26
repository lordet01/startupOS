'use strict';
// Run only by the operator in the authenticated deployment environment.
const runtimeRequire=require('node:module').createRequire(require('node:path').resolve(__dirname,'../.firebase-build/functions/package.json'));
const {initializeApp,applicationDefault}=runtimeRequire('firebase-admin/app');
const {getFirestore}=runtimeRequire('firebase-admin/firestore');
const config=require('./runtime/web-config.json');
const email=String(process.argv[2]||'').trim().toLowerCase();
if(!/^[^\s/@]+@[^\s/@]+\.[^\s/@]+$/.test(email)){console.error('Pass the verified Google/email sign-in address that may access StartupOS.');process.exit(1);}
initializeApp({credential:applicationDefault(),projectId:config.projectId});
getFirestore().collection('startuposAccess').doc(email).set({enabled:true,updatedAt:new Date()},{merge:true}).then(()=>console.log('Private operator access configured for '+email)).catch(e=>{console.error('Operator setup failed: '+e.code);process.exitCode=1;});
