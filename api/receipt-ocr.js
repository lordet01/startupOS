'use strict';
module.exports=async(req,res)=>{try{await require('../lib/account-auth').requireAccount(req);return require('../lib/receipt-service').handler(req,res);}catch(e){return require('../lib/account-auth').reject(res,e);}};
