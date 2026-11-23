import vm from 'node:vm';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const scripts=await Promise.all(['dashboard.js','reports.js','app.js'].map(file=>readFile(new URL('../../dist/'+file,import.meta.url),'utf8')));
async function scenario(role,hash){
 const elements=new Map();const el=key=>{if(!elements.has(key))elements.set(key,{textContent:'',innerHTML:'',value:'',style:{},dataset:{},firstChild:{textContent:''},addEventListener(){}});return elements.get(key)};
 const cloud={role,user:'qa',store:{name:'Teste'},authorize:async()=>{},load:async()=>({clients:[],products:[],sales:[],entries:[],users:[],usersReady:true})};
 const context={Date,Intl,Number,String,JSON,Math,Set,Map,Object,Array,crypto:globalThis.crypto,location:{hash},document:{querySelector:el,querySelectorAll:()=>[]},window:{sicilianoCloud:cloud},setTimeout};context.history={replaceState(_state,_title,url){context.location.hash=url;}};vm.createContext(context);scripts.forEach(source=>vm.runInContext(source,context));await context.window.sicilianoRefresh();return {context,el,cloud};
}
for(const [role,title,hash]of [['admin','Visão geral','#inicio'],['manager','Visão geral','#inicio'],['team','Vendas','#sales']]){
 const s=await scenario(role,'#clients');assert.equal(s.el('#title').textContent,title);assert.equal(s.context.location.hash,hash);assert.equal(s.el('.brand').href,hash);
 s.context.location.hash='#products';s.context.window.onhashchange();assert.equal(s.el('#title').textContent,'Produtos');await s.context.window.sicilianoRefresh();assert.equal(s.el('#title').textContent,'Produtos');
 s.context.location.hash='#nao-existe';s.context.window.onhashchange();assert.equal(s.context.location.hash,hash);
 if(role==='team'){s.context.location.hash='#reports';s.context.window.onhashchange();assert.equal(s.el('#title').textContent,'Vendas');assert(!s.el('nav').innerHTML.includes('#reports'));}
}
const changed=await scenario('admin','#reports');changed.context.location.hash='#users';changed.context.window.onhashchange();changed.cloud.role='team';await changed.context.window.sicilianoRefresh();assert.equal(changed.el('#title').textContent,'Vendas');assert.equal(changed.context.location.hash,'#sales');
changed.cloud.role='manager';await changed.context.window.sicilianoRefresh();assert.equal(changed.el('#title').textContent,'Visão geral');assert.equal(changed.context.location.hash,'#inicio');
console.log('OK: início por perfil, endereço antigo ignorado na entrada, logo, rotas inválidas/proibidas, atualização sem perder navegação e mudança de perfil.');
