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
  const contacts=new Map((db.contacts||[]).map(c=>[c.customer_id+'|'+c.last_purchase_date,c]));
  const anniversaries=[];
  for(const [id,date] of lastPurchase){const target=anniversary(date);const client=clients.get(id);if(client&&target.startsWith(month+'-'))anniversaries.push({client,lastPurchase:date,anniversary:target,contact:contacts.get(id+'|'+date)||null,state:target===today?'Hoje':target<today?'Já completou':'A completar'});}
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
function rememberAnniversaryContact(record){
 db.contacts=(db.contacts||[]).filter(c=>!(c.customer_id===record.customer_id&&c.last_purchase_date===record.last_purchase_date));
 db.contacts.push(record);
}
function bindAnniversaryMessages(){
 document.querySelectorAll('[data-anniversary-open]').forEach(link=>link.onclick=async event=>{
  event.preventDefault();if(!db.contactsReady)return toast('Não foi possível verificar o controle de envio. Atualize os dados.');
  const popup=window.open('','_blank');if(popup)popup.opener=null;
  try{
   const existing=await cloud.contactStatus(link.dataset.anniversaryOpen,link.dataset.lastPurchase);
   if(existing){popup?.close();rememberAnniversaryContact(existing);render();toast('Esta mensagem já foi marcada como enviada. Reenvio bloqueado.');return;}
   if(!popup){toast('Permita a abertura de janelas para abrir o WhatsApp.');return;}
   popup.location.href=link.href;
  }catch(error){popup?.close();db.contactsReady=false;render();toast('Não foi possível conferir o envio. Atualize os dados antes de tentar novamente.');}
 });
 document.querySelectorAll('[data-anniversary-sent]').forEach(button=>button.onclick=async()=>{
  if(!db.contactsReady)return toast('Controle indisponível. Atualize os dados.');
  const customer=button.dataset.anniversarySent,client=db.clients.find(c=>c.id===customer);
  if(!confirm(`Você confirma que enviou manualmente a mensagem para ${client?.name||'este cliente'}? A confirmação ficará registrada e bloqueará a abertura pelo acompanhamento desta compra.`))return;
  button.disabled=true;
  try{
   const record=await cloud.markContactSent(customer,button.dataset.lastPurchase);
   rememberAnniversaryContact(record);render();toast('Mensagem marcada como enviada. Registro salvo na nuvem.');
  }catch(error){toast('Não foi possível registrar o envio. Atualize os dados antes de tentar novamente.');button.disabled=false;}
 });
}
function dashboardView(){
 const today=DashboardData.dateInStore(),d=DashboardData.build(db,today);
 const max=Math.max(1,...d.days.map(x=>x.cents));
 const annualRows=d.years.map(y=>`<tr><td><b>${y.year}</b></td><td>${y.count.toLocaleString('pt-BR')}</td><td><b>${money(y.cents/100)}</b></td></tr>`);

 const quick=[['clients','♙','Cadastrar cliente','Comece um novo relacionamento'],['sales','↗','Registrar venda','Um novo olhar, uma nova venda'],['entries','⇄','Lançar movimentação','Mantenha o financeiro em dia']].filter(([k])=>allowedPage(k));
 return `<div class="welcome"><div><small>SEU NEGÓCIO, EM FOCO</small><h2>Bem-vindo à Siciliano.</h2><p>Seus clientes, suas vendas e os próximos reencontros.</p></div><div class="glasses" aria-hidden="true">◯—◯</div></div>
 <div class="stats dashboard-stats">${stat('Total de clientes',d.clientCount.toLocaleString('pt-BR'),'Clientes cadastrados na ótica','♙')}${stat('Vendas em '+today.slice(0,4),money(d.thisYear.cents/100),d.thisYear.count.toLocaleString('pt-BR')+' vendas no ano','↗')}${stat('Total de vendas',money(d.total),db.sales.length.toLocaleString('pt-BR')+' vendas em todo o histórico','✓')}${stat('1 ano da última compra',d.anniversaries.length.toLocaleString('pt-BR'),'Clientes no mês atual · consulte em Clientes','◷')}</div>
 <div class="dashboard-grid"><section class="panel"><div class="panel-head"><div><h2>Vendas por ano</h2><p>Quantidade e valor total pela data da venda</p></div><span class="badge">Todo o histórico</span></div>${table(['ANO','VENDAS','VALOR TOTAL'],annualRows)}</section>
 <section class="panel"><div class="panel-head"><div><h2>Vendas por dia</h2><p>Últimos 7 dias, incluindo hoje</p></div><span class="badge">${d.days.reduce((n,x)=>n+x.count,0)} vendas</span></div><div class="chart daily-chart" aria-hidden="true">${d.days.map(x=>`<div class="bar-group" title="${fmt(x.date)}: ${x.count} vendas, ${money(x.cents/100)}"><div class="bar" style="height:${x.cents/max*100}%;min-height:${x.cents?2:0}px"></div></div>`).join('')}</div><div class="chart-labels" aria-hidden="true">${d.days.map(x=>`<span>${fmt(x.date).slice(0,5)}</span>`).join('')}</div><details class="daily-data"><summary>Consultar valores por dia</summary>${table(['DATA','VENDAS','TOTAL'],d.days.map(x=>`<tr><td>${fmt(x.date)}</td><td>${x.count}</td><td>${money(x.cents/100)}</td></tr>`))}</details><p class="note">Total nos 7 dias: <b>${money(d.days.reduce((n,x)=>n+x.cents,0)/100)}</b></p></section></div>
 <section class="panel"><div class="panel-head"><div><h2>Últimas vendas</h2><p>As 10 vendas mais recentes pela data do atendimento</p></div><a href="#sales" class="text-btn">Ver todas as vendas →</a></div>${table(['CLIENTE','PRODUTO','DATA','VALOR','SITUAÇÃO','PAGAMENTO'],saleRows(d.latest))}</section>
 <section class="panel"><div class="panel-head"><div><h2>Atalhos do dia a dia</h2><p>Comece um atendimento ou registre uma movimentação</p></div></div><div class="quick dashboard-quick">${quick.map(([k,i,t,s])=>`<button data-new="${k}"><span class="qicon">${i}</span><span><b>${t}</b><small>${s}</small></span><span class="arrow">↗</span></button>`).join('')}</div></section>
`;
}

let clientSegment='all';
function clientMatches(client){return `${client.name} ${client.phone||''} ${client.email||''}`.toLowerCase().includes(query.toLowerCase());}
function clientAnniversaries(){const today=DashboardData.dateInStore();return DashboardData.build(db,today,dashboardMonth||today.slice(0,7)).anniversaries.filter(x=>clientMatches(x.client));}
function clientsView(){
 const anniversary=fullAccess()&&clientSegment==='anniversary';
 const segments=`<div class="client-segments" role="group" aria-label="Segmentação de clientes"><button type="button" data-client-segment="all" aria-pressed="${!anniversary}" class="${!anniversary?'active':''}">Clientes geral</button>${fullAccess()?`<button type="button" data-client-segment="anniversary" aria-pressed="${anniversary}" class="${anniversary?'active':''}">Clientes com compra há um ano</button>`:''}</div>`;
 if(!anniversary)return segments+`<section class="panel"><div class="panel-head"><div><h2>Clientes geral</h2><p>Todos os clientes cadastrados na ótica.</p></div><span class="badge">${db.clients.filter(clientMatches).length} clientes</span></div>${toolbar()}${table(['CLIENTE','TELEFONE','E-MAIL','AÇÕES'],db.clients.filter(clientMatches).map(x=>`<tr><td>${person(x.name)}</td><td>${esc(x.phone)}</td><td>${esc(x.email)}</td><td><button class="text-btn" data-edit="${x.id}">Editar</button> <button class="text-btn" data-delete="${x.id}">Excluir</button></td></tr>`))}</section>`;
 const today=DashboardData.dateInStore(),month=dashboardMonth||today.slice(0,7);
 const anniversaryRows=clientAnniversaries().map(x=>{const link=DashboardData.whatsappLink(x.client,x.anniversary,today),ready=db.contactsReady===true;const record=x.contact;const stamp=record?new Date(record.sent_at).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'}):'';const actor=record?(db.users||[]).find(u=>u.user_id===record.sent_by)?.full_name:'';return `<tr><td>${person(x.client.name)}</td><td>${esc(x.client.phone||'Não informado')}</td><td>${fmt(x.lastPurchase)}</td><td>${fmt(x.anniversary)}</td><td><span class="badge ${x.state==='Hoje'?'anniversary-today':''}">${x.state}</span></td><td>${!ready?'<span class="badge">Controle indisponível</span>':record?`<span class="message-status sent">Enviada</span><small class="message-date">${esc(stamp)}${actor?'<br>'+esc(actor):''}</small>`:'<span class="message-status unsent">Não enviada</span>'}</td><td>${!ready?'<span class="badge">Atualize os dados</span>':record?'<span class="message-locked">Envio já registrado</span>':`${link?`<a class="whatsapp-link" href="${esc(link)}" target="_blank" rel="noopener noreferrer" data-anniversary-open="${esc(x.client.id)}" data-last-purchase="${x.lastPurchase}" aria-label="Abrir WhatsApp de ${esc(x.client.name)}">Abrir WhatsApp</a>`:'<span class="badge">Telefone inválido</span>'}<button type="button" class="text-btn message-confirm" data-anniversary-sent="${esc(x.client.id)}" data-last-purchase="${x.lastPurchase}">Marcar como enviada</button>`}</td></tr>`;});
 return segments+` <section class="panel"><div class="panel-head anniversary-head"><div><h2>Clientes completando 1 ano da última compra</h2><p>Calculado pela última venda registrada no histórico disponível. Em 29/02, o aniversário é considerado em 28/02 no ano seguinte.</p></div><label>Mês de acompanhamento<input id="anniversary-month" type="month" value="${esc(month)}" required></label></div><p class="note">${clientAnniversaries().length} cliente(s) completam exatamente um ano no mês selecionado. Abra o WhatsApp, envie a mensagem e depois confirme em Marcar como enviada. Abrir a conversa não marca o envio automaticamente. Não enviada significa que ainda não há confirmação registrada neste controle. ${db.contactsReady?'As mensagens confirmadas ficam bloqueadas para evitar reenvio.':'O controle de mensagens está indisponível; atualize os dados ou contate o administrador.'}</p>${toolbar()}<div class="anniversary-list">${table(['CLIENTE','TELEFONE','ÚLTIMA COMPRA','COMPLETA 1 ANO','ACOMPANHAMENTO','MENSAGEM','CONTROLE DE ENVIO'],anniversaryRows)}</div></section>`;
}
