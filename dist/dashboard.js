const DashboardData=(()=>{
 const dateInStore=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 function anniversary(date){
  const [y,m,d]=date.split('-').map(Number),year=y+1;
  const last=new Date(Date.UTC(year,m,0)).getUTCDate();
  return `${year}-${String(m).padStart(2,'0')}-${String(Math.min(d,last)).padStart(2,'0')}`;
 }
 function build(db,today=dateInStore(),month=today.slice(0,7)){
  const years=new Map(),lastPurchase=new Map(),clients=new Map(db.clients.map(c=>[c.id,c]));
  const days=Array.from({length:7},(_,i)=>{const d=new Date(today+'T12:00:00Z');d.setUTCDate(d.getUTCDate()-6+i);return {date:d.toISOString().slice(0,10),count:0,cents:0};});
  const byDay=new Map(days.map(d=>[d.date,d]));let totalCents=0;
  for(const s of db.sales){
   if(!/^\d{4}-\d{2}-\d{2}$/.test(s.date))continue;
   const cents=Math.round(Number(s.value||0)*100),year=s.date.slice(0,4);
   if(!years.has(year))years.set(year,{year,count:0,cents:0});
   years.get(year).count++;years.get(year).cents+=cents;totalCents+=cents;
   const d=byDay.get(s.date);if(d){d.count++;d.cents+=cents;}
   if(!lastPurchase.has(s.client)||s.date>lastPurchase.get(s.client))lastPurchase.set(s.client,s.date);
  }
  const anniversaries=[];
  for(const [id,date] of lastPurchase){const target=anniversary(date);const client=clients.get(id);if(client&&target.startsWith(month+'-'))anniversaries.push({client,lastPurchase:date,anniversary:target,state:target===today?'Hoje':target<today?'Já completou':'A completar'});}
  anniversaries.sort((a,b)=>a.anniversary.localeCompare(b.anniversary)||a.client.name.localeCompare(b.client.name,'pt-BR'));
  return {clientCount:db.clients.length,years:[...years.values()].sort((a,b)=>b.year.localeCompare(a.year)),days,total:totalCents/100,
   thisYear:years.get(today.slice(0,4))||{count:0,cents:0},anniversaries,
   latest:db.sales.slice().sort((a,b)=>b.date.localeCompare(a.date)||String(b.created_at||'').localeCompare(String(a.created_at||''))||String(b.id).localeCompare(String(a.id))).slice(0,10)};
 }
 function whatsappLink(client,date,today=dateInStore(),years=1){
  let phone=String(client.phone||'').replace(/\D/g,'');
  if((phone.length===12||phone.length===13)&&phone.startsWith('55'))phone=phone.slice(2);
  if(!/^[1-9]\d(?:[2-5]\d{7}|9\d{8})$/.test(phone))return null;
  const name=String(client.name||'').trim().split(/\s+/)[0]||'cliente';
  const formatted=date.split('-').reverse().join('/');
  const interval=years===2?'dois anos':'um ano';
  const anniversary=date<today?`Sua última compra conosco completou ${interval} em ${formatted}!`:`Sua última compra conosco completa ${interval} em ${formatted}!`;
  const message=`Olá, ${name}! Aqui é da Ótica Siciliano. ${anniversary} Agradecemos pela confiança e convidamos você a nos visitar novamente. Será um prazer receber você! \u{1F499}\u{1F49A}`;
  return `https://wa.me/55${phone}?text=${encodeURIComponent(message)}`;
 }
 return {build,dateInStore,whatsappLink};
})();
let dashboardMonth='';
function dashboardView(){
 const today=DashboardData.dateInStore(),month=dashboardMonth||today.slice(0,7),d=DashboardData.build(db,today,month);
 const max=Math.max(1,...d.days.map(x=>x.cents));
 const annualRows=d.years.map(y=>`<tr><td><b>${y.year}</b></td><td>${y.count.toLocaleString('pt-BR')}</td><td><b>${money(y.cents/100)}</b></td></tr>`);
 const anniversaryRows=d.anniversaries.map(x=>{const link=DashboardData.whatsappLink(x.client,x.anniversary,today);return `<tr><td>${person(x.client.name)}</td><td>${esc(x.client.phone||'Não informado')}</td><td>${fmt(x.lastPurchase)}</td><td>${fmt(x.anniversary)}</td><td><span class="badge ${x.state==='Hoje'?'anniversary-today':''}">${x.state}</span></td><td>${link?`<a class="whatsapp-link" href="${esc(link)}" target="_blank" rel="noopener noreferrer" aria-label="Abrir WhatsApp de ${esc(x.client.name)}">WhatsApp ↗</a>`:'<span class="badge">Telefone inválido</span>'}</td></tr>`;});
 const quick=[['clients','♙','Cadastrar cliente','Comece um novo relacionamento'],['sales','↗','Registrar venda','Um novo olhar, uma nova venda'],['entries','⇄','Lançar movimentação','Mantenha o financeiro em dia']].filter(([k])=>allowedPage(k));
 return `<div class="welcome"><div><small>SEU NEGÓCIO, EM FOCO</small><h2>Bem-vindo à Siciliano.</h2><p>Seus clientes, suas vendas e os próximos reencontros.</p></div><div class="glasses" aria-hidden="true">◯—◯</div></div>
 <div class="stats dashboard-stats">${stat('Total de clientes',d.clientCount.toLocaleString('pt-BR'),'Clientes cadastrados na ótica','♙')}${stat('Vendas em '+today.slice(0,4),money(d.thisYear.cents/100),d.thisYear.count.toLocaleString('pt-BR')+' vendas no ano','↗')}${stat('Total de vendas',money(d.total),db.sales.length.toLocaleString('pt-BR')+' vendas em todo o histórico','✓')}${stat('1 ano da última compra',d.anniversaries.length.toLocaleString('pt-BR'),'Clientes no mês selecionado abaixo','◷')}</div>
 <div class="dashboard-grid"><section class="panel"><div class="panel-head"><div><h2>Vendas por ano</h2><p>Quantidade e valor total pela data da venda</p></div><span class="badge">Todo o histórico</span></div>${table(['ANO','VENDAS','VALOR TOTAL'],annualRows)}</section>
 <section class="panel"><div class="panel-head"><div><h2>Vendas por dia</h2><p>Últimos 7 dias, incluindo hoje</p></div><span class="badge">${d.days.reduce((n,x)=>n+x.count,0)} vendas</span></div><div class="chart daily-chart" aria-hidden="true">${d.days.map(x=>`<div class="bar-group" title="${fmt(x.date)}: ${x.count} vendas, ${money(x.cents/100)}"><div class="bar" style="height:${x.cents/max*100}%;min-height:${x.cents?2:0}px"></div></div>`).join('')}</div><div class="chart-labels" aria-hidden="true">${d.days.map(x=>`<span>${fmt(x.date).slice(0,5)}</span>`).join('')}</div><details class="daily-data"><summary>Consultar valores por dia</summary>${table(['DATA','VENDAS','TOTAL'],d.days.map(x=>`<tr><td>${fmt(x.date)}</td><td>${x.count}</td><td>${money(x.cents/100)}</td></tr>`))}</details><p class="note">Total nos 7 dias: <b>${money(d.days.reduce((n,x)=>n+x.cents,0)/100)}</b></p></section></div>
 <section class="panel"><div class="panel-head"><div><h2>Últimas vendas</h2><p>As 10 vendas mais recentes pela data do atendimento</p></div><a href="#sales" class="text-btn">Ver todas as vendas →</a></div>${table(['CLIENTE','PRODUTO','DATA','VALOR','SITUAÇÃO','PAGAMENTO'],saleRows(d.latest))}</section>
 <section class="panel"><div class="panel-head"><div><h2>Atalhos do dia a dia</h2><p>Comece um atendimento ou registre uma movimentação</p></div></div><div class="quick dashboard-quick">${quick.map(([k,i,t,s])=>`<button data-new="${k}"><span class="qicon">${i}</span><span><b>${t}</b><small>${s}</small></span><span class="arrow">↗</span></button>`).join('')}</div></section>
 <section class="panel"><div class="panel-head anniversary-head"><div><h2>Clientes completando 1 ano da última compra</h2><p>Calculado pela última venda registrada no histórico disponível. Em 29/02, o aniversário é considerado em 28/02 no ano seguinte.</p></div><label>Mês de acompanhamento<input id="anniversary-month" type="month" value="${esc(month)}" required></label></div><p class="note">${d.anniversaries.length} cliente(s) completam exatamente um ano no mês selecionado. Use WhatsApp para abrir a mensagem personalizada, revisar e enviar.</p><div class="anniversary-list">${table(['CLIENTE','TELEFONE','ÚLTIMA COMPRA','COMPLETA 1 ANO','ACOMPANHAMENTO','CONTATO'],anniversaryRows)}</div></section>`;
}
