import {createCloud} from './cloud.js';
const screen = document.querySelector('#auth-screen');
const shell = document.querySelector('#app-shell');
const form = document.querySelector('#login-form');
const message = document.querySelector('#auth-message');
const submit = document.querySelector('#login-submit');
let client, currentUser, generation = 0;
let loaded = false;
let appLoading;

function lock(text) {
  shell.hidden = true;
  screen.hidden = false;
  document.querySelectorAll('dialog[open]').forEach(dialog=>dialog.close());
  message.textContent = text;
}
window.sicilianoLock=lock;

function temporaryConnectionError(error){return error?.name==='AuthRetryableFetchError'||error?.name==='TypeError'||error?.status===0||error?.status>=500||/failed to fetch|fetch failed|network|timeout/i.test(error?.message||'');}
function connectionNotice(){window.sicilianoNotice?.('Não foi possível atualizar a conexão. Sua tela foi mantida; tente novamente quando a rede voltar.');}
async function validate(session, background = false) {
  const version = ++generation;
  background = background && loaded && !shell.hidden && session?.user?.id === currentUser;
  if (!background) lock('Verificando acesso…');
  if (!session) {
    if (loaded) { location.reload(); return; }
    message.textContent = 'Informe seu e-mail e senha.';
    submit.disabled = false;
    return;
  }
  try {
    const { data, error } = await client.auth.getUser();
    if (version !== generation) return;
    if (error) throw error;
    if (!data.user || data.user.is_anonymous) throw Error('Sessão inválida');
    if (loaded && currentUser !== data.user.id) { location.reload(); return; }
    currentUser = data.user.id;
    window.sicilianoCloud ||= createCloud(client);
    const previousRole=window.sicilianoCloud.role;
    await window.sicilianoCloud.authorize(currentUser);
    if (version !== generation) return;
    if (!loaded) {
      appLoading ||= new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = 'app.js';
        script.onload = resolve;
        script.onerror = reject;
        document.body.append(script);
      });
      await appLoading;
      loaded = true;
    }
    if (version !== generation) return;
    if (!background || previousRole !== window.sicilianoCloud.role) await window.sicilianoRefresh();
    if (version !== generation) return;
    screen.hidden = true;
    shell.hidden = false;
  } catch (error) {
    if (version !== generation) return;
    if (background && temporaryConnectionError(error)) { connectionNotice(); return; }
    lock(error.message?.startsWith('Seu usuário') ? error.message : 'Não foi possível carregar sua loja. Confira o vínculo do usuário, as tabelas e a conexão.');
    submit.disabled = false;
  }
}

form.addEventListener('submit', async event => {
  event.preventDefault();
  submit.disabled = true;
  message.textContent = 'Entrando…';
  try {
    const { data, error } = await client.auth.signInWithPassword({
      email: document.querySelector('#login-email').value.trim(),
      password: document.querySelector('#login-password').value
    });
    if (error) throw error;
    document.querySelector('#login-password').value = '';
    await validate(data.session);
  } catch {
    lock('Não foi possível entrar. Confira suas credenciais e a conexão.');
  } finally { submit.disabled = false; }
});

document.querySelector('#logout').addEventListener('click', async () => {
  ++generation;
  lock('Encerrando sessão…');
  submit.disabled = true;
  try {
    const { error } = await client.auth.signOut({ scope: 'local' });
    if (error) throw error;
    location.reload();
  } catch {
    message.textContent = 'Não foi possível sair. Tente novamente.';
    const retry = document.createElement('button');
    retry.type = 'button';
    retry.textContent = 'Tentar sair novamente';
    retry.onclick = () => document.querySelector('#logout').click();
    message.append(retry);
  }
});

try {
  const config = window.SICILIANO_SUPABASE;
  if (!config?.url || !config?.publishableKey) throw Error('config');
  if (!config.publishableKey.startsWith('sb_publishable_')) throw Error('config');
  const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2.49.8');
  client = createClient(config.url, config.publishableKey, {auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
  client.auth.onAuthStateChange((_event, session) => {
    // Keep Supabase calls outside the synchronous auth callback.
    setTimeout(() => validate(session, true), 0);
  });
  const { data, error } = await client.auth.getSession();
  if (error) throw error;
  await validate(data.session);
  window.addEventListener('hashchange', () => { if (shell.hidden) screen.hidden = false; });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) client.auth.getSession().then(({ data, error }) => {if(error)throw error;return validate(data.session,true);}).catch(error => {if(loaded&&temporaryConnectionError(error))connectionNotice();else lock('Não foi possível verificar a sessão. Recarregue para tentar novamente.');});
  });
} catch (error) {
  lock(error.message === 'config'
    ? 'Acesso indisponível: configure o projeto Supabase para habilitar o login.'
    : 'Não foi possível conectar ao serviço de acesso. Recarregue para tentar novamente.');
}
