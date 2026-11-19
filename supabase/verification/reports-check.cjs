const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const clients=[{id:'a',name:'Ana <Silva>',phone:'11999999999'},{id:'b',name:'José',phone:'11999999999'},{id:'leap',name:'Bia',phone:''},{id:'none',name:'Sem compra'}];
const sale=(id,client,date,value,status='Pago')=>({id,client,date,value,status,productLabel:'Armação azul',payment:'Pix'});
const sales=[sale('1','a','2024-01-10',100),sale('2','a','2025-11-18',200),sale('3','b','2025-11-18',0.1),sale('4','b','2026-11-01',0.2,'Pendente'),sale('5','leap','2024-02-29',50)];
const ctx=vm.createContext({Intl,Date,Map,Set,Number,String,Math,console});
vm.runInContext(fs.readFileSync('dist/reports.js','utf8')+';globalThis.data=ReportData;',ctx);
let d=ctx.data.sales({clients,sales},'2026-11-01','2026-11-18');assert.equal(d.total,0.2);assert.equal(d.pending,0.2);assert.equal(d.paid,0);assert.equal(d.average,0.2);
d=ctx.data.sales({clients,sales},'2025-11-18','2026-11-18','','jose');assert.equal(d.rows.length,2);assert.equal(d.total,0.3);assert.equal(d.clients,1);assert.equal(d.months.length,13);assert.equal(d.months[1].total,0);
assert.equal(ctx.data.sales({clients,sales},'2026-11-01','2026-11-18','Pago').rows.length,0);
let rows=ctx.data.inactive({clients,sales},'2027-11-18');assert.equal(rows.length,2);assert.equal(rows.find(x=>x.client.id==='a').lastPurchase,'2025-11-18');assert(!rows.some(x=>x.client.id==='b'||x.client.id==='none'));
assert.equal(ctx.data.inactive({clients,sales},'2027-11-17').length,1);
assert(ctx.data.inactive({clients,sales},'2026-02-28').some(x=>x.client.id==='leap'));
assert.equal(ctx.data.inactive({clients,sales},'2026-02-27').length,0);
assert.equal(ctx.data.inactive({clients,sales:[...sales,sale('new','a','2027-11-18',80)]},'2027-11-18').length,1);
assert.equal(ctx.data.inactive({clients,sales:[sale('old','a','2023-01-10',10),sale('future','a','2026-01-10',10)]},'2025-10-31').find(x=>x.client.id==='a').lastPurchase,'2023-01-10');
assert.equal(ctx.data.inactive({clients,sales},'2027-11-18','ana').length,1);
assert.equal(ctx.data.inactive({clients,sales},'2026-11-18','ana').length,0);
assert.equal(ctx.data.exportRows('inactive',rows,'2027-11-18')[0][4],'Completa dois anos');
assert.equal(ctx.data.sales({clients:[],sales:[]},'2026-01-01','2026-01-31').average,0);
console.log('OK: datas inclusivas, centavos, ticket, situação, busca sem acento, dois anos exatos, clientes antigos, recompra, ano bissexto, referência histórica e vazio.');


const catalog=Array.from({length:12},(_,i)=>({id:'p'+i,name:'Produto '+i,category:'Armação'}));
const productSales=catalog.map((p,i)=>({id:'v'+i,client:'a',date:'2026-01-15',value:(i+1)*10,status:'Pago',items:[{product_id:p.id,product_name:p.name,quantity:i+1,line_total:(i+1)*10}]}));
productSales.push({id:'multi',client:'a',date:'2026-03-15',value:30,status:'Pago',items:[{product_id:'p0',product_name:'Nome antigo',quantity:1,line_total:10},{product_id:'p1',product_name:'Produto 1',quantity:1,line_total:20}]});
d=ctx.data.sales({clients,products:catalog,sales:productSales},'2026-01-01','2026-03-31');
assert.equal(d.products.length,12);assert.equal(d.topProducts.length,10);assert.equal(d.topProducts[0].total,120);assert.equal(d.topProducts.at(-1).total,40);
assert.equal(d.products.find(p=>p.id==='p0').quantity,2);assert.equal(d.products.find(p=>p.id==='p0').name,'Produto 0');assert.equal(d.products.find(p=>p.id==='p0').sales,2);
assert.equal(d.products.reduce((n,p)=>n+Math.round(p.total*100),0),Math.round(d.total*100));
assert.equal(ctx.data.exportRows('sales',d).length,13);assert.equal(ctx.data.exportRows('sales',d)[0][0],'Produto');
assert.equal(d.months[1].total,0);assert.equal(d.trend.high[0].month,'2026-01');assert.equal(d.trend.low[0].month,'2026-02');assert.equal(d.trend.direction,'down');
const monthlySales=[1,2,3].map((n,i)=>sale('t'+i,'a','2026-0'+n+'-15',n*100));
d=ctx.data.sales({clients,sales:monthlySales},'2026-01-01','2026-03-31');assert.equal(d.trend.slope,100);assert.equal(d.trend.direction,'up');assert.equal(d.trend.points[1],200);
assert.equal(ctx.data.sales({clients,sales:monthlySales},'2026-01-01','2026-01-31').trend.available,false);
d=ctx.data.sales({clients,sales:monthlySales.map(s=>({...s,value:100}))},'2026-01-01','2026-03-31');assert.equal(d.trend.direction,'stable');assert.equal(d.trend.tied,true);
const manyClients=Array.from({length:25},(_,i)=>({id:'r'+i,name:'Cliente '+i}));const manySales=manyClients.map(c=>sale(c.id,c.id,'2024-01-01',10));
rows=ctx.data.inactive({clients:manyClients,sales:manySales},'2026-11-18');assert.equal(rows.length,25);assert.equal(ctx.data.exportRows('inactive',rows,'2026-11-18').length,26);
console.log('OK: top 10 por valor decrescente, CSV com 12 produtos e 25 clientes, itens de vendas compostas, reconciliação de valores, meses zero, extremos, tendência alta/queda/estável e mês único.');

const detailDb={clients:[...clients,{id:'new',name:'Cliente novo'}],products:[],sales:[
 sale('past','a','2025-12-31',100),sale('return','a','2026-11-19',10),sale('otherday','b','2026-11-01',20),
 sale('new1','new','2026-11-19',0.1),sale('new2','new','2026-11-19',0.2,'Pendente'),sale('later','new','2026-11-20',30),sale('outside','new','2026-12-01',50)]};
let detail=ctx.data.detail(detailDb,'2026-11','2026-11-19','day');assert.equal(detail.rows.length,3);assert.equal(detail.monthRows.length,5);assert.equal(detail.newClients.size,1);assert(detail.newClients.has('new'));assert.equal(detail.clients,2);assert.equal(detail.total,10.3);
let exported=ctx.data.detailExport(detailDb,detail);assert.equal(exported.length,6);assert(exported.some(row=>row.includes('2026-11-01')));assert(exported.some(row=>row.includes('2026-11-20')));assert(!exported.some(row=>row.includes('2026-12-01')));
detail=ctx.data.detail(detailDb,'2026-11','2026-11-20','day');assert.equal(detail.newClients.size,0);assert.equal(detail.rows.length,1);
detail=ctx.data.detail(detailDb,'2026-11','2026-11-19','month');assert.equal(detail.rows.length,5);assert.equal(detail.newClients.size,2);assert(!detail.newClients.has('a'));
detail=ctx.data.detail(detailDb,'2026-11','2026-11-30','day');assert.equal(detail.rows.length,0);assert.equal(detail.newClients.size,0);assert.equal(detail.total,0);assert.equal(ctx.data.detailExport(detailDb,detail).length,6);
assert.equal(ctx.data.detail({clients,sales:[sale('year','a','2025-11-19',100),sale('now','a','2026-11-19',100)]},'2026-11','2026-11-19','day').newClients.size,0);
console.log('OK: detalhe dia/mês, clientes novos únicos pelo histórico, recompra, ano distinto, vazio, centavos e CSV mensal completo mesmo no modo diário.');

const valueRankDb={clients,products:[{id:'bulk',name:'Muitas unidades'},{id:'premium',name:'Maior faturamento'}],sales:[{id:'bulk-sale',client:'a',date:'2026-01-01',value:100,items:[{product_id:'bulk',quantity:100,line_total:100}]},{id:'premium-sale',client:'a',date:'2026-01-01',value:900,items:[{product_id:'premium',quantity:1,line_total:900}]}]};
const ranked=ctx.data.sales(valueRankDb,'2026-01-01','2026-01-31');assert.equal(ranked.topProducts[0].id,'premium');assert.equal(ctx.data.exportRows('sales',ranked)[1][1],'premium');
console.log('OK: valor vendido prevalece sobre quantidade no ranking e no CSV.');

const closedDb={clients,sales:[sale('jan','a','2026-01-15',100),sale('feb','a','2026-02-15',200),sale('oct','a','2026-10-31',300),sale('open','a','2026-11-01',999999)]};
let closed=ctx.data.closedSales(closedDb,'2026-01-01','2026-11-19','','','2026-11-19');assert.equal(closed.months.length,10);assert.equal(closed.closedEnd,'2026-10-31');assert.equal(closed.total,600);assert.equal(closed.trend.high[0].month,'2026-10');assert(!closed.rows.some(s=>s.id==='open'));
closed=ctx.data.closedSales(closedDb,'2026-01-15','2026-10-15','','','2026-11-19');assert.equal(closed.closedStart,'2026-02-01');assert.equal(closed.closedEnd,'2026-09-30');assert.equal(closed.months.length,8);
closed=ctx.data.closedSales(closedDb,'2026-11-01','2026-11-30','','','2026-11-30');assert.equal(closed.months.length,0);assert.equal(closed.trend.available,false);
closed=ctx.data.closedSales(closedDb,'2025-12-01','2026-12-31','','','2026-01-01');assert.equal(closed.closedEnd,'2025-12-31');assert.equal(closed.months.length,1);
closed=ctx.data.closedSales(closedDb,'2024-02-01','2024-02-29','','','2026-11-19');assert.equal(closed.months.length,1);assert.equal(closed.closedEnd,'2024-02-29');
assert.equal(ctx.data.sales(closedDb,'2026-01-01','2026-11-19').total,1000599);
console.log('OK: mês aberto excluído, limites parciais, virada de ano, fevereiro bissexto e indicadores gerais preservados.');
const historyDb={clients:[{id:'ha',name:'Ana'},{id:'hb',name:'Bruno'},{id:'hr',name:'Recente'}],products:[{id:'bulk',name:'Lente básica'},{id:'premium',name:'Armação premium'}],sales:[
{id:'ha1',client:'ha',date:'2022-01-10',value:100,status:'Pago',items:[{product_id:'bulk',quantity:2,line_total:100}]},
{id:'ha2',client:'ha',date:'2024-11-19',value:200,status:'Pendente',items:[{product_id:'bulk',quantity:10,line_total:100},{product_id:'premium',quantity:1,line_total:100}]},
{id:'hb1',client:'hb',date:'2023-06-05',value:300,status:'Pago',items:[{product_id:'premium',quantity:1,line_total:300}]},
{id:'hr1',client:'hr',date:'2025-01-01',value:999,items:[{product_id:'bulk',quantity:50,line_total:999}]},
{id:'future',client:'ha',date:'2027-01-01',value:777,items:[{product_id:'bulk',quantity:1,line_total:777}]}]};
const eligible=ctx.data.inactive(historyDb,'2026-11-19'),history=ctx.data.history(historyDb,eligible,'2026-11-19');
assert.equal(history.total,600);assert.equal(history.clientCount,2);assert.equal(history.rows.length,3);assert.equal(history.first,'2022-01-10');assert.equal(history.last,'2024-11-19');assert.equal(history.topProducts[0].id,'bulk');assert.equal(history.topProducts[0].quantity,12);assert.equal(history.products.find(p=>p.id==='premium').total,400);
assert.equal(history.clients.reduce((n,c)=>n+c.total,0),history.total);assert.equal(history.months.reduce((n,m)=>n+m.total,0),history.total);assert.equal(history.products.reduce((n,p)=>n+p.total,0),history.total);assert.equal(eligible.reduce((n,c)=>n+c.total,0),history.total);assert.equal(ctx.data.historyExport(historyDb,history).length,4);
const filtered=ctx.data.history(historyDb,ctx.data.inactive(historyDb,'2026-11-19','Ana'),'2026-11-19');assert.equal(filtered.total,300);assert.equal(filtered.clientCount,1);
assert.equal(ctx.data.history(historyDb,[],'2026-11-19').total,0);
console.log('OK: histórico concilia total, clientes, meses e produtos; inclui pendências, exclui outros clientes/compras futuras e exporta todas as vendas.');
