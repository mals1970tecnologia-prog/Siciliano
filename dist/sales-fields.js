window.SaleFields=(()=>{
 const prescription=[];
 for(const kind of ['esferico','cilindrico','eixo'])for(const distance of ['longe','perto'])for(const eye of ['d','e'])prescription.push(`${kind}_${distance}_o_${eye}`);
 const numeric=[...prescription,'dnp_o_d','dnp_o_e','adicao','valor_armacao','valor_lente'];
 const keys=[...numeric,'obs','categoria','receita_propia','data_input','cpf','cep','dt_nascimento'];
 const labels=Object.fromEntries(keys.map(k=>[k,k.toUpperCase()]));
 const escape=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 function html(input,select,values={},today){
  let result='';
  for(const distance of ['longe','perto']){
   result+=`<fieldset class="sale-section"><legend>Receita de ${distance}</legend><div class="prescription-grid"><span>Medida</span><b>Olho direito (OD)</b><b>Olho esquerdo (OE)</b>`;
   for(const [kind,label]of [['esferico','Esférico'],['cilindrico','Cilíndrico'],['eixo','Eixo']]){
    result+=`<span>${label}</span>`;
    for(const eye of ['d','e']){const key=`${kind}_${distance}_o_${eye}`;result+=`<label class="prescription-input"><span class="sr-only">${label} ${distance} O${eye.toUpperCase()}</span><input name="${key}" aria-label="${label} ${distance} O${eye.toUpperCase()}" type="number" value="${escape(values[key])}" step="${kind==='eixo'?'1':'0.01'}" ${kind==='eixo'?'min="0" max="180"':''}></label>`;}
   }
   result+='</div></fieldset>';
  }
  result+=`<fieldset class="sale-section sale-row"><legend>Medidas complementares</legend>${input('dnp_o_d','DNP OD (mm)','number',values.dnp_o_d,'min="0.01" step="0.01"')}${input('dnp_o_e','DNP OE (mm)','number',values.dnp_o_e,'min="0.01" step="0.01"')}${input('adicao','Adição','number',values.adicao,'min="0" step="0.01"')}</fieldset>`;
  result+=`<fieldset class="sale-section sale-row"><legend>Valores da venda</legend>${input('valor_armacao','Valor da armação (R$)','number',values.valor_armacao??'','min="0" max="9999999999.99" step="0.01"')}${input('valor_lente','Valor da lente (R$)','number',values.valor_lente??'','min="0" max="9999999999.99" step="0.01"')}${input('value','Valor total (R$)','number',values.value??'','readonly required min="0.01" step="0.01"')}</fieldset>`;
  result+=`<fieldset class="sale-section sale-row"><legend>Dados complementares</legend>${input('categoria','Categoria','text',values.categoria,'maxlength="120"')}${select('receita_propia','Receita própria',[['','Não informado'],['true','Sim'],['false','Não']],values.receita_propia==null?'':String(values.receita_propia))}${input('data_input','Data de entrada','date',values.data_input??today,'')}${input('cpf','CPF','text',values.cpf,'inputmode="numeric" maxlength="14" placeholder="000.000.000-00"')}${input('cep','CEP','text',values.cep,'inputmode="numeric" maxlength="9" placeholder="00000-000"')}${input('dt_nascimento','Data de nascimento','date',values.dt_nascimento,`max="${today}"`)}<label>Data de inclusão<input readonly value="${escape(values.created_at?new Date(values.created_at).toLocaleString('pt-BR'):'Registrada automaticamente ao salvar')}"></label><label class="sale-wide">Observações<textarea name="obs" rows="3" maxlength="4000">${escape(values.obs)}</textarea></label></fieldset>`;
  return result;
 }
 function read(form){const values=Object.fromEntries(new FormData(form));const details={};for(const key of keys){let v=values[key]??'';if(numeric.includes(key)){v=v===''?null:Number(v);if(v!==null&&!Number.isFinite(v))throw Error('Informe números válidos na receita.');}else if(key==='receita_propia')v=v===''?null:v==='true';else if(['cpf','cep'].includes(key)){if(v&&!/^[\d.\-\s]+$/.test(v))throw Error('CPF e CEP devem conter apenas dígitos e pontuação.');v=v.replace(/\D/g,'')||null;if(v&&v.length!==(key==='cpf'?11:8))throw Error(key==='cpf'?'CPF deve ter 11 dígitos.':'CEP deve ter 8 dígitos.');}else v=v.trim()||null;details[key]=v;}
  const cents=n=>Math.round(Number(n||0)*100);const total=(cents(details.valor_armacao)+cents(details.valor_lente))/100;
  if(total<=0)throw Error('Informe valor da armação ou da lente maior que zero.');
  return {...values,quantity:Number(values.quantity),value:total,details};
 }
 return {keys,numeric,labels,html,read};
})();
