import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
const source=await readFile(new URL('../../dist/cloud.js',import.meta.url),'utf8');
const {createCloud}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
const requests=[];let memberRole='admin';let noMember=false;
const data={optical_stores:[{id:'store',name:'Ótica'}],optical_customers:[{id:'c',name:'Cliente'}],optical_products:[{id:'p',name:'Armação',price:'100.00',stock:5,active:true},{id:'pending',name:'Produto sem preço',material:'1.67',price:null,stock:0,active:true}],optical_sales:[{id:'s',customer_id:'c',created_at:'2026-11-16',total:'200',sale_date:'2026-11-16',payment_method:'Pix',status:'Pendente'}],optical_sale_items:[{id:'i',sale_id:'s',product_id:'p',product_name:'Armação antiga',quantity:2,line_total:'200'}],optical_financial_entries:[{id:'e',value:'20',entry_date:'2026-11-16'}]};
let failure=null;
const client={from(table){const req={table,filters:[],op:'read'};requests.push(req);let query={select(){return query},eq(k,v){req.filters.push([k,v]);return query},order(){return query},range(){return query},insert(p){req.op='insert';req.payload=p;return query},update(p){req.op='update';req.payload=p;return query},delete(){req.op='delete';return query},then(resolve,reject){if(failure)return Promise.resolve({error:failure}).then(resolve,reject);let rows=table==='optical_members'?(noMember?[]:[{store_id:'store',role:memberRole}]):data[table]||[];return Promise.resolve({data:req.op==='read'?rows:[{id:'new'}],error:null}).then(resolve,reject)}};return query},rpc(name,args){requests.push({rpc:name,args});return Promise.resolve({data:name==='optical_list_members'?[]:'s',error:null})}};
const cloud=createCloud(client);await cloud.authorize('user');assert.equal(cloud.role,'admin');
let db=await cloud.load();assert.equal(db.products[1].price,null);assert.equal(db.products[1].material,'1.67');assert.equal(db.sales[0].productLabel,'Armação antiga');assert.equal(db.sales[0].value,200);assert.equal(db.sales[0].quantity,2);assert.equal(db.entries[0].date,'2026-11-16');
await cloud.save('clients',{name:'Teste',phone:'1',email:''},null,'req');assert.deepEqual(requests.at(-1).payload,{name:'TESTE',phone:'1',email:'',store_id:'store'});
await cloud.save('products',{name:'P',category:'Lente',price:10,stock:999},'p');assert(!('stock' in requests.at(-1).payload));assert(requests.at(-1).filters.some(([k,v])=>k==='store_id'&&v==='store'));
await cloud.save('sales',{client:'c',product:'p',quantity:2,value:200,date:'2026-11-16',payment:'Pix',status:'Pendente'},null,'request');assert.equal(requests.at(-1).rpc,'optical_create_sale');assert.equal(requests.at(-1).args.p_request_id,'request');
await cloud.remove('products','p');assert.deepEqual(requests.at(-1).payload,{active:false});
memberRole='seller';await cloud.authorize('user');requests.length=0;db=await cloud.load();assert.equal(db.entries.length,0);assert(!requests.some(r=>r.table==='optical_financial_entries'));
noMember=true;await assert.rejects(()=>cloud.authorize('user'),/vinculado/);noMember=false;failure={message:'Falha simulada'};await assert.rejects(()=>cloud.load());failure=null;
const elements=new Map();const el=s=>{if(!elements.has(s))elements.set(s,{textContent:'',style:{},dataset:{},value:'',innerHTML:'',hidden:false,firstChild:{textContent:''},addEventListener(){}});return elements.get(s)};
const context={console,Date,Number,String,JSON,Math,Set,Object,Array,crypto:globalThis.crypto,location:{hash:'#inicio'},document:{querySelector:el,querySelectorAll:()=>[]},window:{sicilianoCloud:{role:'admin',user:'user',store:{name:'Ótica'},authorize:async()=>{},load:async()=>({clients:[],products:[],sales:[],entries:[],users:[],usersReady:true})}},setTimeout};vm.createContext(context);for(const file of ['dashboard.js','reports.js','app.js'])vm.runInContext(await readFile(new URL('../../dist/'+file,import.meta.url),'utf8'),context);await context.window.sicilianoRefresh();
for(const page of ['inicio','clients','products','sales','entries','reports','settings','users']){context.location.hash='#'+page;context.window.onhashchange();assert(el('#view').innerHTML.length>50,page)}
context.window.sicilianoCloud.role='team';context.location.hash='#entries';context.window.onhashchange();assert.equal(el('#title').textContent,'Clientes');assert(!el('nav').innerHTML.includes('#users'));assert(!el('nav').innerHTML.includes('#inicio'));context.window.sicilianoCloud.role='manager';context.location.hash='#users';context.window.onhashchange();assert.equal(el('#title').textContent,'Usuários');assert(el('nav').innerHTML.includes('#reports'));
assert(!await readFile(new URL('../../dist/app.js',import.meta.url),'utf8').then(s=>s.includes('function persist')||s.includes('const seed=')));
console.log('OK: adaptador nuvem, associação de loja, mapeamento, RPC de venda, permissões da interface, propagação de erros e 8 telas.');

context.location.hash='#reports';context.window.onhashchange();assert(el('#view').innerHTML.includes('Ticket médio'));
vm.runInContext("reportState.mode='inactive';render();",context);assert(el('#view').innerHTML.includes('Abrir relatório nominal'));el('#report-nominal-toggle').onclick();assert(el('#view').innerHTML.includes('Clientes sem comprar há dois anos ou mais'));
vm.runInContext("download=(data,type,file)=>{globalThis.reportDownload={data,type,file};};",context);
el('#report-export').onclick();assert(context.reportDownload.data.includes('Última compra'));assert(context.reportDownload.file.includes('clientes-reativar'));
vm.runInContext("reportState.mode='sales';reportState.start='2026-01-01';reportState.end='2026-12-31';render();",context);
el('#report-export').onclick();assert(context.reportDownload.data.includes('Quantidade vendida'));assert(context.reportDownload.file.includes('produtos-periodo'));el('#report-sales-export').onclick();assert(context.reportDownload.data.includes('Data da venda'));assert(context.reportDownload.file.includes('vendas-mes-'));
vm.runInContext("reportState.start='2027-01-01';render();",context);assert(el('#view').innerHTML.includes('Vamos ajustar o período?'));
console.log('OK: relatórios integrados, alternância, CSV por relatório e validação do período.');

vm.runInContext("reportState.start='2026-01-01';reportState.end='2026-12-31';reportState.detailDate='2026-01-31';reportState.detailMonth='2026-01';render();",context);
el('#report-detail-month').onchange({target:{value:'2026-02'}});assert.equal(vm.runInContext('reportState.detailDate',context),'2026-02-28');
el('#report-detail-month').onchange({target:{value:'2024-02'}});assert.equal(vm.runInContext('reportState.detailMonth',context),'2024-02');
el('#report-detail-day').onchange({target:{value:'29'}});assert.equal(vm.runInContext('reportState.detailDate',context),'2024-02-29');
vm.runInContext("reportState.search='sem resultado';reportState.status='Pendente';render();",context);
el('#report-detail-export').onclick();assert(context.reportDownload.file.includes('2024-02'));assert(context.reportDownload.data.includes('Cliente novo no mês'));
el('#report-detail-today').onclick();assert.equal(vm.runInContext('reportState.detailDate',context),vm.runInContext('DashboardData.dateInStore()',context));assert.equal(vm.runInContext('reportState.detailMode',context),'day');
console.log('OK: seletores do detalhe, fevereiro/ano bissexto, botão Hoje e nome/conteúdo do CSV mensal.');

vm.runInContext(`db={clients:[{id:'c',name:'Cliente'}],products:[],entries:[],sales:[{id:'month-before',client:'c',date:'2026-11-18',value:10,status:'Pago',payment:'Pix'},{id:'day-only',client:'c',date:'2026-11-19',value:20,status:'Pago',payment:'Pix'},{id:'month-after',client:'c',date:'2026-11-30',value:30,status:'Pago',payment:'Pix'},{id:'out-month',client:'c',date:'2026-12-01',value:40,status:'Pago',payment:'Pix'}]};Object.assign(reportState,{detailMode:'day',detailMonth:'2026-11',detailDate:'2026-11-19',status:'Pendente',search:'sem resultado'});render();`,context);
el('#report-detail-export').onclick();assert.equal(context.reportDownload.data.split('\r\n').length,4);assert(context.reportDownload.data.includes('month-before'));assert(context.reportDownload.data.includes('day-only'));assert(context.reportDownload.data.includes('month-after'));assert(!context.reportDownload.data.includes('out-month'));
console.log('OK: exportação integrada inclui o mês completo e ignora pesquisa/situação dos filtros gerais.');
vm.runInContext("reportState.mode='inactive';reportState.reference='2026-11-19';reportState.search='';render();",context);
assert(el('#view').innerHTML.includes('Detalhar valor histórico'));el('#report-history-toggle').onclick();assert(el('#view').innerHTML.includes('Detalhamento das vendas históricas'));assert(el('#view').innerHTML.includes('Quem compõe esse valor'));el('#report-history-export').onclick();assert(context.reportDownload.data.includes('Valor total da venda'));assert(context.reportDownload.file.includes('vendas-historicas'));el('#report-history-toggle').onclick();assert(!el('#view').innerHTML.includes('A HISTÓRIA POR TRÁS DO VALOR'));
console.log('OK: abertura/fechamento do histórico e CSV dedicado.');

memberRole='admin';await cloud.authorize('user');
await cloud.save('clients',{name:'  José da Conceição  ',phone:'(11) 99999-9999',email:'Jose.Exemplo@example.com'});assert.equal(requests.at(-1).payload.name,'JOSÉ DA CONCEIÇÃO');assert.equal(requests.at(-1).payload.email,'Jose.Exemplo@example.com');assert.equal(requests.at(-1).payload.phone,'(11) 99999-9999');
await cloud.save('products',{name:' armação clássica ',material:' acetato azul ',category:'Armação',price:249.9},'p');assert.equal(requests.at(-1).payload.name,'ARMAÇÃO CLÁSSICA');assert.equal(requests.at(-1).payload.material,'ACETATO AZUL');assert.equal(requests.at(-1).payload.category,'Armação');assert.equal(requests.at(-1).payload.price,249.9);
await cloud.save('products',{name:'lente 1.67',material:'',category:'Lente',price:null});assert.equal(requests.at(-1).payload.name,'LENTE 1.67');assert.equal(requests.at(-1).payload.material,'');assert.equal(requests.at(-1).payload.price,null);
const field={value:'João silva',selectionStart:4,selectionEnd:4,hasAttribute:key=>key==='data-uppercase',setSelectionRange(start,end){this.selectionStart=start;this.selectionEnd=end;}};context.registrationField=field;vm.runInContext('uppercaseRegistrationInput({target:registrationField});',context);assert.equal(field.value,'JOÃO SILVA');assert.equal(field.selectionStart,4);
field.value='Jose.Email@example.com';field.hasAttribute=()=>false;vm.runInContext('uppercaseRegistrationInput({target:registrationField});',context);assert.equal(field.value,'Jose.Email@example.com');
assert(vm.runInContext("input('new_client_name','Nome','text','maría ç')",context).includes('MARÍA Ç'));assert(vm.runInContext("input('material','Material','text','titânio')",context).includes('TITÂNIO'));assert(!vm.runInContext("input('email','E-mail','email','Jose@example.com')",context).includes('data-uppercase'));
console.log('OK: caixa alta em inserção/edição, acentos, material, cadastro na venda, cursor e preservação de e-mail/telefone/preço/categoria.');
