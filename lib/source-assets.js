'use strict';
const fs=require('node:fs'),path=require('node:path');
const at=name=>fs.readFileSync(path.join(__dirname,'..',name));
// Literal paths let Vercel's Node File Trace package assets used dynamically by Build/Preview.
const ASSETS={
 'capabilities/data.js':fs.readFileSync(path.join(__dirname,'../capabilities/data.js')),
 'capabilities/app.css':fs.readFileSync(path.join(__dirname,'../capabilities/app.css')),
 'capabilities/receipt.js':fs.readFileSync(path.join(__dirname,'../capabilities/receipt.js')),
 'capabilities/travel.js':fs.readFileSync(path.join(__dirname,'../capabilities/travel.js')),
 'capabilities/skin.js':fs.readFileSync(path.join(__dirname,'../capabilities/skin.js')),
 'capabilities/skin-photo-repair.js':fs.readFileSync(path.join(__dirname,'../capabilities/skin-photo-repair.js')),
 'lib/receipt-service.js':fs.readFileSync(path.join(__dirname,'receipt-service.js')),
 'lib/skin-service.js':fs.readFileSync(path.join(__dirname,'skin-service.js')),
 'lib/build-contract.js':fs.readFileSync(path.join(__dirname,'build-contract.js')),
 'lib/assemble.js':fs.readFileSync(path.join(__dirname,'assemble.js')),
 'lib/verify.js':fs.readFileSync(path.join(__dirname,'verify.js')),
 'lib/repair.js':fs.readFileSync(path.join(__dirname,'repair.js')),
 'lib/smoke-fixtures.js':fs.readFileSync(path.join(__dirname,'smoke-fixtures.js')),
 'fixtures/skin-face.jpg':fs.readFileSync(path.join(__dirname,'../fixtures/skin-face.jpg'))
};
function asset(name){if(!Object.prototype.hasOwnProperty.call(ASSETS,name))throw new Error('Asset not registered: '+name);return ASSETS[name]}
function text(name){return asset(name).toString('utf8')}
function diagnose(){return {count:Object.keys(ASSETS).length,paths:Object.fromEntries(Object.entries(ASSETS).map(([name,bytes])=>[name,bytes.length]))};}
module.exports={asset,text,diagnose};
