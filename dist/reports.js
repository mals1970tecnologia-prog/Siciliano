const ReportData = (() => {
  const cents = rows => rows.reduce((n, s) => n + Math.round(Number(s.value || 0) * 100), 0);
  const normalized = text => String(text || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR');
  function monthly(rows, start, end) {
    const groups = new Map();
    const [sy,sm]=start.split('-').map(Number),[ey,em]=end.split('-').map(Number);
    for(let index=sy*12+sm-1;index<=ey*12+em-1;index++) {
      const month=`${String(Math.floor(index/12)).padStart(4,'0')}-${String(index%12+1).padStart(2,'0')}`;
      groups.set(month,{month,count:0,cents:0});
    }
    for(const s of rows) {const m=groups.get(s.date.slice(0,7));if(m){m.count++;m.cents+=Math.round(Number(s.value||0)*100);}}
    return [...groups.values()].map(m=>({month:m.month,count:m.count,total:m.cents/100}));
  }
  function products(rows, catalog=[]) {
    const known=new Map(catalog.map(p=>[p.id,p])),groups=new Map();
    for(const s of rows) {
      const items=s.items?.length?s.items:[{product_id:s.product,product_name:s.productLabel,quantity:s.quantity||1,line_total:s.value}];
      for(const item of items) {
        const p=known.get(item.product_id),name=p?[p.name,p.material].filter(Boolean).join(' — '):item.product_name||'Produto não identificado';
        const key=item.product_id||name;
        if(!groups.has(key))groups.set(key,{id:item.product_id||'',name,category:p?.category||'Não informado',quantity:0,cents:0,saleIds:new Set()});
        const group=groups.get(key);group.quantity+=Number(item.quantity||0);group.cents+=Math.round(Number(item.line_total||0)*100);group.saleIds.add(s.id);
      }
    }
    return [...groups.values()].map(p=>({...p,total:p.cents/100,sales:p.saleIds.size})).sort((a,b)=>b.total-a.total||b.quantity-a.quantity||a.name.localeCompare(b.name,'pt-BR'));
  }
  function trend(months) {
    const n=months.length;
    if(n<2)return {available:false,points:[],slope:0,direction:'insufficient',high:[],low:[]};
    const meanX=(n-1)/2,meanY=months.reduce((sum,m)=>sum+m.total,0)/n;
    let numerator=0,denominator=0;
    months.forEach((m,i)=>{numerator+=(i-meanX)*(m.total-meanY);denominator+=(i-meanX)**2;});
    const slope=numerator/denominator,max=Math.max(...months.map(m=>m.total)),min=Math.min(...months.map(m=>m.total));
    return {available:true,slope,points:months.map((_,i)=>meanY+slope*(i-meanX)),direction:Math.abs(slope)<0.005?'stable':slope>0?'up':'down',high:months.filter(m=>m.total===max),low:months.filter(m=>m.total===min),tied:max===min};
  }
  function sales(db, start, end, status = '', search = '') {
    const clients = new Map(db.clients.map(c => [c.id, c]));
    const rows = db.sales.filter(s => s.date >= start && s.date <= end && (!status || s.status === status) && normalized(`${clients.get(s.client)?.name || ''} ${s.productLabel || ''} ${s.payment || ''}`).includes(normalized(search))).slice().sort((a,b) => b.date.localeCompare(a.date));
    const months=monthly(rows,start,end),allProducts=products(rows,db.products||[]);
    return { rows, total: cents(rows) / 100, paid: cents(rows.filter(s => s.status === 'Pago')) / 100, pending: cents(rows.filter(s => s.status === 'Pendente')) / 100, average: rows.length ? cents(rows) / 100 / rows.length : 0, clients: new Set(rows.map(s => s.client)).size, months,trend:trend(months),products:allProducts,topProducts:allProducts.slice(0,10) };
  }
  function closedSales(db,start,end,status='',search='',today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())) {
    const lastDay=month=>{const [y,m]=month.split('-').map(Number);return new Date(Date.UTC(y,m,0)).toISOString().slice(0,10);};
    const beforeMonth=month=>{const [y,m]=month.split('-').map(Number);return new Date(Date.UTC(y,m-1,0)).toISOString().slice(0,10);};
    const [y,m]=start.split('-').map(Number);
    const closedStart=start.endsWith('-01')?start:new Date(Date.UTC(y,m,1)).toISOString().slice(0,10);
    const lastClosed=beforeMonth(today.slice(0,7));
    const cutoff=end<lastClosed?end:lastClosed;
    const closedEnd=cutoff===lastDay(cutoff.slice(0,7))?cutoff:beforeMonth(cutoff.slice(0,7));
    return {...sales(db,closedStart,closedEnd,status,search),closedStart,closedEnd};
  }
  function inactive(db, reference, search = '') {
    const last = new Map(), totals = new Map();
    // Ignore purchases after the reference date when reviewing a past date.
    for (const s of db.sales) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(s.date) || s.date > reference) continue;
      if (!last.has(s.client) || s.date > last.get(s.client)) last.set(s.client, s.date);
      totals.set(s.client, (totals.get(s.client) || 0) + Math.round(Number(s.value || 0) * 100));
    }
    return db.clients.flatMap(client => {
      const date = last.get(client.id); if (!date) return [];
      const [y,m,d] = date.split('-').map(Number), year = y + 2;
      const due = `${year}-${String(m).padStart(2,'0')}-${String(Math.min(d,new Date(Date.UTC(year,m,0)).getUTCDate())).padStart(2,'0')}`;
      if (due > reference || !normalized(`${client.name} ${client.phone} ${client.email}`).includes(normalized(search))) return [];
      return [{ client, lastPurchase: date, due, days: Math.floor((Date.parse(reference+'T00:00:00Z') - Date.parse(date+'T00:00:00Z')) / 86400000), total: totals.get(client.id) / 100 }];
    }).sort((a,b) => a.lastPurchase.localeCompare(b.lastPurchase) || a.client.name.localeCompare(b.client.name,'pt-BR'));
  }
  function exportRows(mode,result,reference) {
    return mode==='sales'
      ? [['Produto','Código','Categoria','Quantidade vendida','Número de vendas','Valor vendido'],...result.products.map(p=>[p.name,p.id,p.category,p.quantity,p.sales,p.total])]
      : [['Cliente','Telefone','E-mail','Última compra','Completa dois anos','Dias sem comprar','Vendas históricas','Data de referência'],...result.map(r=>[r.client.name,r.client.phone,r.client.email,r.lastPurchase,r.due,r.days,r.total,reference])];
  }
  function detail(db,month,date,mode='day') {
    const monthRows=db.sales.filter(s=>s.date?.slice(0,7)===month).slice().sort((a,b)=>b.date.localeCompare(a.date)||String(b.created_at||'').localeCompare(String(a.created_at||''))||String(a.id).localeCompare(String(b.id)));
    const rows=mode==='month'?monthRows:monthRows.filter(s=>s.date===date);
    const firstPurchases=new Map();
    for(const s of db.sales)if(s.client&&/^\d{4}-\d{2}-\d{2}$/.test(s.date)&&(!firstPurchases.has(s.client)||s.date<firstPurchases.get(s.client)))firstPurchases.set(s.client,s.date);
    const newClients=new Set(rows.filter(s=>mode==='month'?firstPurchases.get(s.client)?.slice(0,7)===month:firstPurchases.get(s.client)===date).map(s=>s.client));
    return {month,date,mode,rows,monthRows,firstPurchases,newClients,clients:new Set(rows.map(s=>s.client)).size,total:cents(rows)/100};
  }
  function detailExport(db,d) {
    const clients=new Map(db.clients.map(c=>[c.id,c])),products=new Map((db.products||[]).map(p=>[p.id,p]));
    return [['Código da venda','Cliente','Produto','Quantidade','Data da venda','Valor total','Situação','Pagamento','Primeira compra registrada','Cliente novo no mês'],...d.monthRows.map(s=>[s.id,clients.get(s.client)?.name||'Cliente removido',s.productLabel||products.get(s.product)?.name||'Produto não informado',s.quantity??(s.items||[]).reduce((n,i)=>n+Number(i.quantity||0),0),s.date,s.value,s.status,s.payment,d.firstPurchases.get(s.client)||'',d.firstPurchases.get(s.client)?.slice(0,7)===d.month?'Sim':'Não'])];
  }
  function history(db,eligible,reference) {
    const ids=new Set(eligible.map(r=>r.client.id)),byClient=new Map(),byMonth=new Map();
    const rows=db.sales.filter(s=>ids.has(s.client)&&/^\d{4}-\d{2}-\d{2}$/.test(s.date)&&s.date<=reference).slice().sort((a,b)=>b.date.localeCompare(a.date)||String(a.id).localeCompare(String(b.id)));
    const clients=new Map(db.clients.map(c=>[c.id,c]));
    for(const s of rows) {
      if(!byClient.has(s.client))byClient.set(s.client,{client:clients.get(s.client),count:0,cents:0,first:s.date,last:s.date});
      const c=byClient.get(s.client);c.count++;c.cents+=Math.round(Number(s.value||0)*100);if(s.date<c.first)c.first=s.date;if(s.date>c.last)c.last=s.date;
      const month=s.date.slice(0,7);if(!byMonth.has(month))byMonth.set(month,{month,count:0,cents:0,clients:new Set()});
      const m=byMonth.get(month);m.count++;m.cents+=Math.round(Number(s.value||0)*100);m.clients.add(s.client);
    }
    const ranking=products(rows,db.products||[]).sort((a,b)=>b.quantity-a.quantity||b.total-a.total||a.name.localeCompare(b.name,'pt-BR'));
    return {rows,total:cents(rows)/100,clientCount:byClient.size,first:rows.at(-1)?.date||'',last:rows[0]?.date||'',products:ranking,
      topProducts:ranking.length?ranking.filter(p=>p.quantity===ranking[0].quantity):[],
      clients:[...byClient.values()].map(c=>({...c,total:c.cents/100})).sort((a,b)=>b.total-a.total||a.client.name.localeCompare(b.client.name,'pt-BR')),
      months:[...byMonth.values()].sort((a,b)=>b.month.localeCompare(a.month)).map(m=>({month:m.month,count:m.count,total:m.cents/100,clients:m.clients.size}))};
  }
  function historyExport(db,h) {
    const names=new Map(db.clients.map(c=>[c.id,c.name]));
    return [['Código da venda','Cliente','Data da venda','Produto(s)','Quantidade','Valor total da venda','Situação','Pagamento'],...h.rows.map(s=>[s.id,names.get(s.client)||'Cliente removido',s.date,s.productLabel||(s.items||[]).map(i=>i.product_name).filter(Boolean).join(', ')||(db.products||[]).find(p=>p.id===s.product)?.name||'Produto não informado',s.quantity??(s.items||[]).reduce((n,i)=>n+Number(i.quantity||0),0),s.value,s.status,s.payment])];
  }
  return { sales, closedSales, inactive, exportRows, detail, detailExport, history, historyExport };
})();

const reportState = { mode: 'sales', start: '', end: '', reference: '', search: '', status: '', nominal: false, history:false, detailMode:'day',detailMonth:'',detailDate:'' };
function reportDefaults() {
  const today = DashboardData.dateInStore();
  reportState.start ||= today.slice(0,4)+'-01-01'; reportState.end ||= today; reportState.reference ||= today;
  reportState.detailMonth ||= today.slice(0,7);reportState.detailDate ||= today;
}
function reportMetric(label, value, note, color, icon, action) {
  return `<article class="report-metric ${color}"><span class="report-metric-icon" aria-hidden="true">${icon}</span><span>${label}</span><strong>${value}</strong><small>${note}</small>${action?`<button id="${action.id}" type="button" class="report-metric-action" aria-expanded="${action.expanded}" aria-controls="report-history">${action.expanded?'Fechar detalhamento':'Detalhar valor histórico'}</button>`:''}</article>`;
}
function reportResult() {
  return reportState.mode === 'sales' ? ReportData.sales(db,reportState.start,reportState.end,reportState.status,reportState.search) : ReportData.inactive(db,reportState.reference,reportState.search);
}
function reportMonth(month) { return month.slice(5)+'/'+month.slice(0,4); }
function reportTrendComment(d) {
  if(!d.rows.length)return 'Não há vendas com os filtros selecionados. Ajuste o período ou a situação para analisar o movimento.';
  const t=d.trend;
  if(!t.available)return 'Selecione pelo menos dois meses completos e encerrados para calcular a linha de tendência. O mês em andamento fica fora da análise.';
  const list=items=>items.slice(0,3).map(m=>reportMonth(m.month)).join(', ')+(items.length>3?` e mais ${items.length-3} mês(es)`:'');
  const direction=t.direction==='stable'?'A tendência é estável':`A tendência é de ${t.direction==='up'?'alta':'queda'}, com variação média estimada de ${money(Math.abs(t.slope))} por mês`;
  const extremes=t.tied?'Todos os meses apresentam o mesmo valor vendido.':`Maior valor: ${list(t.high)} (${money(t.high[0].total)}). Menor valor: ${list(t.low)} (${money(t.low[0].total)}).`;
  return `${direction}. ${extremes} A linha resume somente meses completos e encerrados e não é uma previsão. Meses sem vendas entram como zero. O mês em andamento e meses cortados pelas datas do filtro ficam fora da análise.`;
}
function reportMonthlyChart(d) {
  if(!d.months.length)return '<p class="report-empty">Nenhum mês completo e encerrado neste período. Amplie as datas para incluir meses fechados.</p>';
  if(!d.rows.length)return '<p class="report-empty">Nenhuma venda encontrada. Ajuste o período ou os filtros.</p>';
  const months=d.months,t=d.trend,width=Math.max(760,months.length*72+110),height=310,left=78,right=24,top=24,bottom=60,plot=height-top-bottom;
  const lo=Math.min(0,...t.points),hi=Math.max(1,...months.map(m=>m.total),...t.points),range=hi-lo;
  const y=value=>top+(hi-value)/range*plot,zero=y(0),step=(width-left-right)/months.length,x=i=>left+step*(i+.5),barWidth=Math.min(40,step*.6);
  const maximum=Math.max(...months.map(m=>m.total)),minimum=Math.min(...months.map(m=>m.total));
  const grid=Array.from({length:5},(_,i)=>{const value=hi-range*i/4;return `<g><line x1="${left}" x2="${width-right}" y1="${y(value)}" y2="${y(value)}" stroke="#dde8f0"/><text x="${left-10}" y="${y(value)+4}" text-anchor="end" fill="#526c7c" font-size="11">${esc(new Intl.NumberFormat('pt-BR',{notation:'compact',maximumFractionDigits:1}).format(value))}</text></g>`;}).join('');
  const bars=months.map((m,i)=>{const high=maximum!==minimum&&m.total===maximum,low=maximum!==minimum&&m.total===minimum,color=high?'#23834a':low?'#d65e10':'#138bc1';return `<g><title>${reportMonth(m.month)}: ${money(m.total)}, ${m.count} vendas${high?' · Maior valor':low?' · Menor valor':''}</title><rect x="${x(i)-barWidth/2}" y="${m.total?y(m.total):zero-2}" width="${barWidth}" height="${Math.max(2,zero-y(m.total))}" rx="4" fill="${color}"/><text x="${x(i)}" y="${height-bottom+24}" text-anchor="middle" fill="#385365" font-size="11">${reportMonth(m.month)}</text></g>`;}).join('');
  const line=t.available?`<polyline points="${t.points.map((value,i)=>`${x(i)},${y(value)}`).join(' ')}" fill="none" stroke="#8337ca" stroke-width="3" stroke-dasharray="8 5"/>`:'';
  return `<div class="report-chart-scroll" role="region" aria-label="Gráfico de vendas por mês" tabindex="0"><svg class="report-month-chart" viewBox="0 0 ${width} ${height}" style="min-width:${width}px" role="img" aria-labelledby="monthly-chart-title monthly-chart-description"><title id="monthly-chart-title">Valor vendido mês a mês em reais</title><desc id="monthly-chart-description">${esc(reportTrendComment(d))} Os valores exatos estão na tabela mensal abaixo.</desc>${grid}<line x1="${left}" x2="${width-right}" y1="${zero}" y2="${zero}" stroke="#718a9b"/>${bars}${line}</svg></div><div class="report-chart-legend"><span><i class="normal"></i>Valor vendido</span><span><i class="high"></i>Maior valor</span><span><i class="low"></i>Menor valor</span><span><i class="trend"></i>Tendência linear</span></div><div class="report-analysis"><h3>O que os números mostram</h3><p>${esc(reportTrendComment(d))}</p></div><details class="report-month-values"><summary>Consultar valores e quantidades por mês</summary>${table(['MÊS','QUANTIDADE DE VENDAS','VALOR VENDIDO','DESTAQUE'],months.map(m=>`<tr><td>${reportMonth(m.month)}</td><td>${m.count.toLocaleString('pt-BR')}</td><td class="report-number">${money(m.total)}</td><td>${maximum===minimum?'Mesmo valor':m.total===maximum?'Maior valor':m.total===minimum?'Menor valor':'—'}</td></tr>`))}</details>`;
}
function reportProducts(d) {
  const max=Math.max(1,...d.topProducts.map(p=>p.total));
  return `<section class="panel report-product-panel"><div class="panel-head"><div><span class="report-kicker">PRODUTOS EM DESTAQUE</span><h2>Os 10 produtos com maior valor vendido</h2><p>Classificados pelo valor total vendido, do maior para o menor.</p></div><span class="report-tag">${d.products.length.toLocaleString('pt-BR')} produto(s) vendidos no período</span></div>${d.topProducts.length?`<div class="report-product-ranking">${d.topProducts.map(p=>`<div class="report-product-row"><div><b>${esc(p.name)}</b><small>${esc(p.category)}</small></div><div class="report-product-track"><span style="width:${p.total/max*100}%"></span></div><strong>${p.quantity.toLocaleString('pt-BR')} <small>un.</small></strong><span class="report-number">${money(p.total)}</span></div>`).join('')}</div>`:'<p class="report-empty">Nenhum produto vendido com estes filtros.</p>'}<p class="report-footnote">A tela mostra até 10 produtos. O CSV de produtos inclui todos os produtos vendidos com os filtros selecionados, sem limite de quantidade. Produtos sem vendas ficam fora do relatório.</p><button id="report-products-export" class="primary" type="button">Exportar todos os produtos (${d.products.length})</button></section>`;
}
function reportSalesDetail() {
  const d=ReportData.detail(db,reportState.detailMonth,reportState.detailDate,reportState.detailMode),daily=reportState.detailMode==='day';
  const [year,month]=reportState.detailMonth.split('-').map(Number),lastDay=new Date(Date.UTC(year,month,0)).getUTCDate();
  const label=daily?fmt(reportState.detailDate):reportMonth(reportState.detailMonth);
  return `<section id="report-sales-detail" class="panel report-detail report-daily-detail"><div class="panel-head"><div><span class="report-kicker">CADA ATENDIMENTO CONTA</span><h2>Detalhamento das vendas</h2><p>Escolha um dia ou consulte o mês completo.</p></div><span class="report-tag">${daily?'Vendas do dia':'Vendas do mês'} · ${label}</span></div>
    <div class="report-detail-controls"><div class="report-tabs" role="group" aria-label="Exibição do detalhamento"><button data-detail-mode="day" type="button" aria-pressed="${daily}">Por dia</button><button data-detail-mode="month" type="button" aria-pressed="${!daily}">Por mês</button></div><label>Mês e ano<input id="report-detail-month" type="month" value="${reportState.detailMonth}" required></label>${daily?`<label>Dia do mês<select id="report-detail-day">${Array.from({length:lastDay},(_,i)=>i+1).map(day=>`<option value="${String(day).padStart(2,'0')}" ${Number(reportState.detailDate.slice(8))===day?'selected':''}>${String(day).padStart(2,'0')}</option>`).join('')}</select></label>`:''}<button id="report-detail-today" type="button">Hoje</button><button id="report-detail-export" type="button" class="primary">Exportar vendas de ${reportMonth(d.month)} (${d.monthRows.length})</button></div>
    <div class="report-metrics report-detail-metrics">${reportMetric('Clientes novos',d.newClients.size.toLocaleString('pt-BR'),daily?'Primeira compra registrada neste dia':'Primeira compra registrada neste mês','violet','♙')}${reportMetric('Clientes atendidos',d.clients.toLocaleString('pt-BR'),'Clientes únicos na seleção','green','◈')}${reportMetric(daily?'Vendas do dia':'Vendas do mês',d.rows.length.toLocaleString('pt-BR'),label,'blue','✓')}${reportMetric('Valor vendido',money(d.total),'Total das vendas exibidas','orange','◷')}</div>
    <p class="report-detail-context">Seleção do detalhamento: ${label}. Esta seção usa seu próprio mês e dia. Clientes novos são contados uma única vez pela primeira compra em todo o histórico disponível.</p>
    ${table(['CLIENTE','PRODUTO','DATA','VALOR','SITUAÇÃO','PAGAMENTO'],d.rows.map(s=>`<tr><td>${person(name(s.client))}${d.newClients.has(s.client)?`<span class="report-new-client">${daily?'Novo no dia':'Novo no mês'}</span>`:''}</td><td>${esc(s.productLabel||product(s.product))}</td><td>${fmt(s.date)}</td><td class="report-number">${money(s.value)}</td><td>${pill(s.status)}</td><td>${esc(s.payment||'Não informado')}</td></tr>`))}
    <div class="report-table-total"><span>${d.rows.length} venda(s) · ${label}</span><strong>${money(d.total)}</strong></div><p class="report-footnote">A exportação inclui todas as ${d.monthRows.length} vendas de ${reportMonth(d.month)}, de todos os dias, clientes e situações, mesmo na visualização por dia. Os filtros gerais de período, situação e pesquisa não limitam este detalhamento nem seu CSV mensal.</p></section>`;
}
function reportHistory(eligible) {
  const h=ReportData.history(db,eligible,reportState.reference),mostValue=h.products.slice().sort((a,b)=>b.total-a.total||b.quantity-a.quantity);
  const names=h.topProducts.map(p=>p.name).join(' · ');
  const valueLeaders=mostValue.length?mostValue.filter(p=>p.total===mostValue[0].total):[];
  return `<section id="report-history" class="panel report-history"><div class="panel-head"><div><span class="report-kicker">A HISTÓRIA POR TRÁS DO VALOR</span><h2>Detalhamento das vendas históricas</h2><p>Compras dos clientes para reativar selecionados, até ${fmt(reportState.reference)}.</p></div><button id="report-history-export" type="button" class="primary">Exportar histórico completo (${h.rows.length} vendas)</button></div>
    <div class="report-history-period"><b>${h.first?`${fmt(h.first)} a ${fmt(h.last)}`:'Sem vendas no histórico selecionado'}</b><span>Período em que essas vendas ocorreram</span></div>
    <div class="report-metrics">${reportMetric('Valor histórico total',money(h.total),'Mesmo valor do indicador de vendas históricas','blue','◈')}${reportMetric('Clientes que compõem o valor',h.clientCount.toLocaleString('pt-BR'),'Cada cliente contado uma única vez','violet','♙')}${reportMetric('Vendas realizadas',h.rows.length.toLocaleString('pt-BR'),'Todas as situações de pagamento','green','✓')}${reportMetric('Produtos vendidos',h.products.length.toLocaleString('pt-BR'),'Produtos distintos no histórico','orange','◷')}</div>
    <div class="report-history-leaders"><article><span class="report-kicker">MAIS VENDIDO EM UNIDADES${h.topProducts.length>1?' · EMPATE':''}</span><h3>${h.products.length?esc(names):'Nenhum produto encontrado'}</h3><p>${h.products.length?`${h.topProducts[0].quantity.toLocaleString('pt-BR')} unidade(s) ${h.topProducts.length>1?'por produto empatado':''}`:'Não há itens de venda para analisar.'}</p></article><article><span class="report-kicker">MAIOR VALOR VENDIDO${valueLeaders.length>1?' · EMPATE':''}</span><h3>${valueLeaders.length?esc(valueLeaders.map(p=>p.name).join(' · ')):'Nenhum produto encontrado'}</h3><p>${valueLeaders.length?`${money(valueLeaders[0].total)} ${valueLeaders.length>1?'por produto empatado':''}`:'Não há itens de venda para analisar.'}</p></article></div>
    <div class="report-history-grid"><section><h3>Quando o valor foi vendido</h3><p>Quantidade, clientes únicos e valor por mês.</p>${table(['MÊS','VENDAS','CLIENTES','VALOR'],h.months.map(m=>`<tr><td>${reportMonth(m.month)}</td><td>${m.count}</td><td>${m.clients}</td><td class="report-number">${money(m.total)}</td></tr>`))}</section><section><h3>Quem compõe esse valor</h3><p>Participação de cada cliente no histórico selecionado.</p>${table(['CLIENTE','VENDAS','PRIMEIRA / ÚLTIMA COMPRA','VALOR'],h.clients.map(c=>`<tr><td>${person(c.client.name)}</td><td>${c.count}</td><td>${fmt(c.first)}<br>${fmt(c.last)}</td><td class="report-number">${money(c.total)}</td></tr>`))}</section></div>
    <section class="report-history-products"><h3>Produtos vendidos no histórico</h3><p>Ordem por quantidade vendida; valor total de cada produto ao lado.</p>${table(['PRODUTO','CATEGORIA','UNIDADES','VENDAS','VALOR VENDIDO'],h.products.map(p=>`<tr><td><b>${esc(p.name)}</b></td><td>${esc(p.category)}</td><td>${p.quantity.toLocaleString('pt-BR')}</td><td>${p.sales}</td><td class="report-number">${money(p.total)}</td></tr>`))}</section>
    <section class="report-history-transactions"><h3>Vendas que formam o total</h3><p>${h.rows.length} vendas · Data, cliente, produto e valor de cada atendimento.</p>${table(['DATA','CLIENTE','PRODUTO(S)','VALOR DA VENDA','SITUAÇÃO','PAGAMENTO'],h.rows.map(s=>`<tr><td>${fmt(s.date)}</td><td>${person(name(s.client))}</td><td>${esc(s.productLabel||(s.items||[]).map(i=>i.product_name).filter(Boolean).join(', ')||product(s.product))}</td><td class="report-number">${money(s.value)}</td><td>${pill(s.status)}</td><td>${esc(s.payment||'Não informado')}</td></tr>`))}</section>
    <div class="report-table-total"><span>${h.clientCount} clientes · ${h.rows.length} vendas no histórico</span><strong>${money(h.total)}</strong></div><p class="report-footnote">O histórico reúne todas as compras registradas dos clientes elegíveis à reativação de dois anos, respeitando a pesquisa e a data de referência. Valores representam vendas, incluindo pagas e pendentes. Clientes que compraram em meses diferentes aparecem em cada mês, mas são contados uma única vez no indicador geral. Não representa previsão de novas vendas.</p></section>`;
}
function reportsView() {
  reportDefaults(); const sales = reportState.mode === 'sales', invalid = sales && reportState.start > reportState.end;
  const result = invalid ? null : reportResult();
  const period = sales ? `${fmt(reportState.start)} a ${fmt(reportState.end)}` : `Posição em ${fmt(reportState.reference)}`;
  let content = '';
  if (invalid) content = '<section class="panel report-empty" role="alert"><h2>Vamos ajustar o período?</h2><p>A data inicial deve ser anterior ou igual à data final.</p></section>';
  else if (sales) {
    const d = result, chart=ReportData.closedSales(db,reportState.start,reportState.end,reportState.status,reportState.search,DashboardData.dateInStore());
    content = `<div class="report-metrics">${reportMetric('Vendas no período',money(d.total),`${d.rows.length.toLocaleString('pt-BR')} vendas registradas`,'blue','↗')}${reportMetric('Ticket médio',money(d.average),'Valor médio por venda','violet','◈')}${reportMetric('Vendas pagas',money(d.paid),'Pela data da venda','green','✓')}${reportMetric('A receber',money(d.pending),'Vendas com situação pendente','orange','◷')}</div>
      <section class="panel report-summary"><div class="panel-head"><div><span class="report-kicker">RITMO DO NEGÓCIO</span><h2>Vendas mensais e linha de tendência</h2><p>Somente meses completos e encerrados${chart.months.length?` · ${reportMonth(chart.closedStart.slice(0,7))} a ${reportMonth(chart.closedEnd.slice(0,7))}`:''} · Comparação pelo valor vendido em reais</p></div><span class="report-tag">${chart.months.length} mês(es) fechado(s)</span></div>${reportMonthlyChart(chart)}</section>${reportProducts(d)}
      ${reportSalesDetail()}`;
  } else {
    const rows = result, contactable = rows.filter(r=>DashboardData.whatsappLink(r.client,r.due,reportState.reference,2));
    content = `<div class="report-metrics">${reportMetric('Clientes para reativar',rows.length.toLocaleString('pt-BR'),'Dois anos ou mais sem comprar','violet','♙')}${reportMetric('Com WhatsApp válido',contactable.length.toLocaleString('pt-BR'),'Contato disponível na lista','green','↗')}${reportMetric('Maior tempo sem comprar',rows.length?rows[0].days.toLocaleString('pt-BR')+' dias':'—','Desde a última compra','orange','◷')}${reportMetric('Vendas históricas',money(rows.reduce((n,r)=>n+Math.round(r.total*100),0)/100),'Dos clientes listados, até a referência','blue','◈',{id:'report-history-toggle',expanded:reportState.history})}</div>
      ${reportState.history?reportHistory(rows):''}<section class="report-callout"><span aria-hidden="true">✦</span><div><h2>Um bom momento para reencontrar seus clientes</h2><p>Quem completou dois anos sem comprar continua nesta lista até fazer uma nova compra. Clientes sem vendas registradas não entram no cálculo.</p></div></section>
      <section class="panel report-retention-overview"><div><span class="report-kicker">OPORTUNIDADES DE REENCONTRO</span><h2>${rows.length.toLocaleString('pt-BR')} clientes para reativar</h2><p>Clientes que completaram dois anos ou mais sem comprar até ${fmt(reportState.reference)}. Abra o relatório nominal para consultar nomes, contatos e a última compra.</p></div><div class="report-retention-actions"><button id="report-nominal-toggle" class="primary" type="button" aria-expanded="${reportState.nominal}" aria-controls="report-nominal">${reportState.nominal?'Fechar relatório nominal':'Abrir relatório nominal'}</button><button id="report-clients-export" type="button">Exportar todos os clientes (${rows.length})</button></div></section>
      ${reportState.nominal?`<section id="report-nominal" class="panel report-detail"><div class="panel-head"><div><span class="report-kicker">RELATÓRIO NOMINAL</span><h2>Clientes sem comprar há dois anos ou mais</h2><p>${period} · Ordem da compra mais antiga para a mais recente</p></div><span class="report-tag">${rows.length} cliente(s)</span></div>${table(['CLIENTE','TELEFONE','ÚLTIMA COMPRA','SEM COMPRAR','VENDAS HISTÓRICAS','CONTATO'],rows.map(r=>{const link=DashboardData.whatsappLink(r.client,r.due,reportState.reference,2);return `<tr><td>${person(r.client.name)}</td><td>${esc(r.client.phone||'Não informado')}</td><td>${fmt(r.lastPurchase)}</td><td><span class="report-days">${r.days.toLocaleString('pt-BR')} dias</span></td><td class="report-number">${money(r.total)}</td><td>${link?`<a class="whatsapp-link" href="${esc(link)}" target="_blank" rel="noopener noreferrer" aria-label="Abrir WhatsApp de ${esc(r.client.name)}">WhatsApp ↗</a>`:'<span class="badge">Sem WhatsApp válido</span>'}</td></tr>`;}))}<p class="report-footnote">Critério: dois anos de calendário após a última compra até a data de referência. Para compras em 29/02, utiliza-se 28/02 no ano de referência. A mensagem do WhatsApp abre para revisão; o envio é manual.</p></section>`:''}`;

  }
  return `<div class="reports-workspace"><section class="report-hero ${sales?'':'retention'}"><div><span class="report-kicker">SICILIANO · INTELIGÊNCIA DO NEGÓCIO</span><h2>${sales?'Cada venda revela um novo caminho.':'O próximo encontro começa aqui.'}</h2><p>${sales?'Acompanhe resultados, entenda seu movimento e planeje os próximos passos.':'Encontre quem está há dois anos ou mais sem comprar e aproxime-se novamente.'}</p><span class="report-period">${period}</span></div><div class="report-hero-mark" aria-hidden="true">${sales?'↗':'◎'}</div></section>
    <div class="report-controls"><div class="report-tabs" role="group" aria-label="Selecionar relatório"><button data-report-mode="sales" aria-pressed="${sales}">Vendas no período</button><button data-report-mode="inactive" aria-pressed="${!sales}">Clientes para reativar</button></div><div class="report-actions"><button id="report-export" ${invalid?'disabled':''}>${sales?'Exportar todos os produtos':'Exportar todos os clientes'}</button><button id="report-print" class="primary" ${invalid?'disabled':''}>${sales?'Imprimir / PDF':reportState.history?'Imprimir histórico / PDF':reportState.nominal?'Imprimir nominal / PDF':'Imprimir resumo / PDF'}</button>${sales?`<button id="report-sales-export">Exportar vendas de ${reportMonth(reportState.detailMonth)}</button>`:''}</div></div>
    <section class="panel report-filters" aria-label="Filtros do relatório">${sales?`<label>Data inicial<input id="report-start" type="date" value="${reportState.start}" required></label><label>Data final<input id="report-end" type="date" value="${reportState.end}" required></label><label>Situação<select id="report-status"><option value="">Todas as situações</option><option ${reportState.status==='Pago'?'selected':''}>Pago</option><option ${reportState.status==='Pendente'?'selected':''}>Pendente</option></select></label>`:`<label>Data de referência<input id="report-reference" type="date" value="${reportState.reference}" required></label>`}<label class="report-search">${sales?'Pesquisar cliente, produto ou pagamento':'Pesquisar cliente, telefone ou e-mail'}<input id="report-search" type="search" value="${esc(reportState.search)}" placeholder="Digite para filtrar…"></label><button id="report-reset">Limpar filtros</button></section>
    <p class="report-context">${esc(cloud.store.name)} · ${sales?'Valores pela data da venda; vendas pagas não representam recebimentos ocorridos no período.':'A data de referência considera somente compras realizadas até esse dia.'}</p>${content}<div class="report-print-footer">Ótica Siciliano · ${period} · Emitido em ${fmt(DashboardData.dateInStore())}</div></div>`;
}
function bindReports() {
  document.querySelectorAll('[data-detail-mode]').forEach(b=>b.onclick=()=>{reportState.detailMode=b.dataset.detailMode;render();});
  if($('#report-detail-month'))$('#report-detail-month').onchange=e=>{
    if(!/^\d{4}-\d{2}$/.test(e.target.value))return;
    const [y,m]=e.target.value.split('-').map(Number),lastDay=new Date(Date.UTC(y,m,0)).getUTCDate();
    reportState.detailMonth=e.target.value;
    reportState.detailDate=e.target.value+'-'+String(Math.min(Number(reportState.detailDate.slice(8))||1,lastDay)).padStart(2,'0');render();
  };
  if($('#report-detail-day'))$('#report-detail-day').onchange=e=>{reportState.detailDate=reportState.detailMonth+'-'+e.target.value;render();};
  if($('#report-detail-today'))$('#report-detail-today').onclick=()=>{const today=DashboardData.dateInStore();Object.assign(reportState,{detailMode:'day',detailMonth:today.slice(0,7),detailDate:today});render();};
  document.querySelectorAll('[data-report-mode]').forEach(b=>b.onclick=()=>{reportState.mode=b.dataset.reportMode;reportState.search='';render();});
  for(const key of ['start','end','reference','status']) { const el=$('#report-'+key); if(el)el.onchange=()=>{if(key!=='status'&&!/^\d{4}-\d{2}-\d{2}$/.test(el.value))return;reportState[key]=el.value;render();}; }
  $('#report-search').oninput=e=>{const pos=e.target.selectionStart;reportState.search=e.target.value;render();$('#report-search').focus();$('#report-search').setSelectionRange(pos,pos);};
  $('#report-reset').onclick=()=>{Object.assign(reportState,{start:'',end:'',reference:'',search:'',status:'',nominal:false,history:false,detailMode:'day',detailMonth:'',detailDate:''});render();};
  if($('#report-nominal-toggle'))$('#report-nominal-toggle').onclick=()=>{reportState.nominal=!reportState.nominal;render();};
  if($('#report-history-toggle'))$('#report-history-toggle').onclick=()=>{reportState.history=!reportState.history;render();};
  $('#report-print').onclick=()=>window.print();
  const saveCSV=(rows,file)=>{const csv='\ufeff'+rows.map(row=>row.map(v=>'"'+String(/^[=+@\-]/.test(String(v??''))?"'"+v:v??'').replaceAll('"','""')+'"').join(';')).join('\r\n');download(csv,'text/csv;charset=utf-8',file);toast('Relatório completo exportado.');};
  if($('#report-history-export'))$('#report-history-export').onclick=()=>{const h=ReportData.history(db,ReportData.inactive(db,reportState.reference,reportState.search),reportState.reference);saveCSV(ReportData.historyExport(db,h),`siciliano-vendas-historicas-${reportState.reference}.csv`);};
  const exportReport=(detail=false)=>{
    if(!detail&&reportState.mode==='sales'&&reportState.start>reportState.end)return;
    const sales=reportState.mode==='sales',d=reportResult();
    const rows=detail?ReportData.detailExport(db,ReportData.detail(db,reportState.detailMonth,reportState.detailDate,reportState.detailMode)):ReportData.exportRows(reportState.mode,d,reportState.reference);
    const csv='\ufeff'+rows.map(row=>row.map(v=>'"'+String(/^[=+@\-]/.test(String(v??''))?"'"+v:v??'').replaceAll('"','""')+'"').join(';')).join('\r\n');
    download(csv,'text/csv;charset=utf-8',`siciliano-${sales?(detail?'vendas-mes-'+reportState.detailMonth:'produtos-periodo'):'clientes-reativar'}-${DashboardData.dateInStore()}.csv`);toast('Relatório completo exportado.');
  };
  $('#report-export').onclick=()=>exportReport();
  for(const id of ['report-products-export','report-clients-export'])if($('#'+id))$('#'+id).onclick=()=>exportReport();
  if($('#report-sales-export'))$('#report-sales-export').onclick=()=>exportReport(true);
  if($('#report-detail-export'))$('#report-detail-export').onclick=()=>exportReport(true);
}
