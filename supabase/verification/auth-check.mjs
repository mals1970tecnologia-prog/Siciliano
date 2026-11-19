import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const source = (await readFile(new URL('../../dist/auth.js', import.meta.url), 'utf8')).replace("await import('https://esm.sh/@supabase/supabase-js@2.49.8')", '({ createClient: () => mockClient })');
async function scenario({configured=true, session=null, valid=true}={}) {
 const elements = new Map(); let scripts=0, reloads=0;
 const el = key => {if(!elements.has(key)) elements.set(key,{hidden:key==='#app-shell',disabled:true,value:'',textContent:'',handlers:{},addEventListener(e,fn){this.handlers[e]=fn},close(){},append(){}});return elements.get(key)};
 const context={window:{SICILIANO_SUPABASE:configured?{url:'https://example.supabase.co',publishableKey:'sb_publishable_test'}:{},addEventListener(){}},document:{querySelector:el,createElement(){return {}},body:{append(s){scripts++;s.onload()}},addEventListener(){}},location:{reload(){reloads++}},setTimeout, mockClient:{auth:{onAuthStateChange(){},async getSession(){return {data:{session}}},async getUser(){return {data:{user:valid?{id:'user-1'}:null},error:!valid}},async signOut(){return {} }}}};
 await vm.runInNewContext(`(async()=>{${source}\n})()`, context);
 return {el,context,scripts,get reloads(){return reloads}};
}
let s=await scenario({configured:false});assert.equal(s.scripts,0);assert.equal(s.el('#app-shell').hidden,true);assert.match(s.el('#auth-message').textContent,/configure/);
s=await scenario();assert.equal(s.scripts,0);assert.equal(s.el('#login-submit').disabled,false);assert.equal(s.el('#app-shell').hidden,true);
s=await scenario({session:{},valid:false});assert.equal(s.scripts,0);assert.equal(s.el('#app-shell').hidden,true);
s=await scenario({session:{}});assert.equal(s.scripts,1);assert.equal(s.el('#app-shell').hidden,false);assert.equal(s.context.window.sicilianoStorageKey,'siciliano-v1:user-1');
await s.el('#logout').handlers.click();assert.equal(s.el('#app-shell').hidden,true);assert.equal(s.reloads,1);
console.log('Passed: missing config, signed out, rejected session, validated access, per-user storage, logout.');
