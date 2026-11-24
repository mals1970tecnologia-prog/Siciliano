const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync('dist/auth.js','utf8').replace("import {createCloud} from './cloud.js';",'').split("form.addEventListener('submit'")[0];
async function run(){let refreshes=0,reloads=0,closed=0,notice=0,error=null,denied=false;const user={id:'u'},session={user};const el={};for(const k of ['#auth-screen','#app-shell','#login-form','#auth-message','#login-submit'])el[k]={hidden:k==='#auth-screen',disabled:false,textContent:''};
const cloud={role:'admin',async authorize(){if(denied)throw Error('Seu usuário ainda não está vinculado a uma loja ativa.');}};
const c=vm.createContext({window:{sicilianoCloud:cloud,sicilianoRefresh:async()=>{refreshes++},sicilianoNotice:()=>notice++},document:{querySelector:k=>el[k],querySelectorAll:()=>[{close(){closed++}}]},location:{reload(){reloads++}},createCloud:()=>cloud});vm.runInContext(source+';globalThis.validateSession=validate;globalThis.prepare=()=>{loaded=true;currentUser="u";client={auth:{getUser:async()=>({data:{user},error:globalThis.failure})}}};',c);c.user=user;c.prepare();
await c.validateSession(session,true);assert.equal(el['#app-shell'].hidden,false);assert.equal(closed,0);assert.equal(refreshes,0);assert.equal(reloads,0);
c.failure=Object.assign(Error('offline'),{name:'AuthRetryableFetchError'});await c.validateSession(session,true);assert.equal(el['#app-shell'].hidden,false);assert.equal(notice,1);
c.failure=null;denied=true;await c.validateSession(session,true);assert.equal(el['#app-shell'].hidden,true);assert.match(el['#auth-message'].textContent,/Seu usuário/);
denied=false;el['#app-shell'].hidden=false;await c.validateSession(null,true);assert.equal(el['#app-shell'].hidden,true);assert.equal(reloads,1);
el['#app-shell'].hidden=false;c.user={id:'other'};c.prepare();await c.validateSession({user:c.user},true);assert.equal(el['#app-shell'].hidden,true);assert.equal(reloads,2);
console.log('OK: retorno de aba preserva tela e diálogos, falha temporária mantém tela, acesso revogado e saída bloqueiam, troca de usuário recarrega.');}
run().catch(e=>{console.error(e);process.exitCode=1});
