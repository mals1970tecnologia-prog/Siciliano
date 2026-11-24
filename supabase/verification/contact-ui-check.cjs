const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
let stored=null,readError=false,confirmed=true,opens=0,closed=0,rendered=0;
const link={dataset:{anniversaryOpen:'c',lastPurchase:'2025-11-24'},href:'https://wa.me/5511999999999'};
const button={dataset:{anniversarySent:'c',lastPurchase:'2025-11-24'},disabled:false};
const cloud={async contactStatus(){if(readError)throw Error('offline');return stored;},async markContactSent(c,date){stored||={customer_id:c,last_purchase_date:date,sent_at:'2026-11-24T12:00:00Z',sent_by:'u'};return stored;}};
const db={clients:[{id:'c',name:'Cliente teste',phone:'11999999999'}],sales:[{id:'s',client:'c',date:'2025-11-24',value:100}],contacts:[],contactsReady:true,products:[],entries:[],users:[]};
const popups=[];const ctx=vm.createContext({Date,Intl,Map,Set,Number,String,Math,db,cloud,confirm:()=>confirmed,toast(){},render(){rendered++},document:{querySelectorAll:s=>s==='[data-anniversary-open]'?[link]:s==='[data-anniversary-sent]'?[button]:[]},window:{open(){opens++;const p={opener:null,location:{href:''},close(){closed++}};popups.push(p);return p;}}});
vm.runInContext(fs.readFileSync('dist/dashboard.js','utf8')+';globalThis.build=DashboardData.build;',ctx);vm.runInContext('bindAnniversaryMessages();',ctx);
(async()=>{
 let prevented=false;await link.onclick({preventDefault(){prevented=true}});assert(prevented);assert.equal(stored,null);assert.equal(popups[0].location.href,link.href);
 confirmed=false;await button.onclick();assert.equal(stored,null);
 confirmed=true;await button.onclick();assert.ok(stored);assert.equal(db.contacts.length,1);assert.equal(ctx.build(db,'2026-11-24').anniversaries[0].contact.sent_by,'u');
 const firstStamp=stored.sent_at;await button.onclick();assert.equal(db.contacts.length,1);assert.equal(stored.sent_at,firstStamp);
 await link.onclick({preventDefault(){}});assert.equal(closed,1);assert.equal(popups.at(-1).location.href,'');
 db.sales.push({id:'new',client:'c',date:'2026-11-24',value:150});assert.equal(ctx.build(db,'2027-11-24').anniversaries[0].contact,null);
 readError=true;await link.onclick({preventDefault(){}});assert.equal(db.contactsReady,false);const oldOpens=opens;await link.onclick({preventDefault(){}});assert.equal(opens,oldOpens);
 assert.ok(rendered>=3);console.log('OK: abrir não marca envio, confirmação/cancelamento, registro persistido, reabertura bloqueada, nova compra e falha de consulta segura.');
})().catch(e=>{console.error(e);process.exitCode=1});
