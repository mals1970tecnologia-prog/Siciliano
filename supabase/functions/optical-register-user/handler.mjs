export function createHandler({env,fetch:request}){
 const allowed=['https://siciliano.malstec.com.br','https://otica-siciliano-gestao.mar40-sp.chatgpt.site'];
 return async req=>{
  const origin=req.headers.get('origin');const cors={'Access-Control-Allow-Origin':allowed.includes(origin)?origin:allowed[0],'Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type','Access-Control-Allow-Methods':'POST, OPTIONS','Vary':'Origin','Content-Type':'application/json'};
  const respond=(status,body)=>new Response(JSON.stringify(body),{status,headers:cors});
  if(origin&&!allowed.includes(origin))return respond(403,{error:'Origem não autorizada.'});
  if(req.method==='OPTIONS')return new Response(null,{status:204,headers:cors});
  if(req.method!=='POST')return respond(405,{error:'Método não permitido.'});
  const authorization=req.headers.get('authorization')||'';
  if(!/^Bearer\s+\S+$/i.test(authorization))return respond(401,{error:'Entre novamente para cadastrar usuários.'});
  const base=env('SUPABASE_URL'),secret=env('SUPABASE_SERVICE_ROLE_KEY');
  if(!base||!secret)return respond(503,{error:'Serviço de cadastro indisponível.'});
  const service={apikey:secret,Authorization:`Bearer ${secret}`,'Content-Type':'application/json'};
  try{
   const identity=await request(base+'/auth/v1/user',{headers:{...service,Authorization:authorization}});
   if(!identity.ok)return respond(401,{error:'Sessão inválida. Entre novamente.'});
   const user=await identity.json();if(!user.id||user.is_anonymous)return respond(401,{error:'Sessão inválida.'});
   const raw=await req.text();if(raw.length>6000)return respond(400,{error:'Dados excedem o limite.'});
   let input;try{input=JSON.parse(raw);}catch{return respond(400,{error:'Dados inválidos.'});}
   const {store_id,role,active}=input;
   const full_name=String(input.full_name||'').trim().replace(/\s+/g,' '),email=String(input.email||'').trim().toLowerCase(),password=input.password;
   if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(store_id||'')||!full_name||full_name.length>120||!['admin','manager','team'].includes(role)||typeof active!=='boolean'||!/^\S+@\S+\.\S+$/.test(email)||email.length>254||typeof password!=='string'||password.length<12||password.length>128)return respond(400,{error:'Informe nome completo, e-mail, perfil e senha de 12 a 128 caracteres.'});
   const check=await request(base+`/rest/v1/optical_members?store_id=eq.${store_id}&user_id=eq.${encodeURIComponent(user.id)}&active=eq.true&select=role`,{headers:service});
   if(!check.ok)return respond(503,{error:'Não foi possível validar as permissões.'});
   const members=await check.json(),actor=members[0]?.role;
   if(!['admin','manager'].includes(actor)||actor==='manager'&&role!=='team')return respond(403,{error:'Gerencial pode cadastrar apenas Equipe. Equipe não pode cadastrar usuários.'});
   const created=await request(base+'/auth/v1/admin/users',{method:'POST',headers:service,body:JSON.stringify({email,password,email_confirm:true,user_metadata:{full_name}})});
   if(!created.ok)return respond(409,{error:'Não foi possível criar a conta. Confira a senha e o e-mail; se já existir, use Vincular conta existente.'});
   const newUser=await created.json();
   // O vínculo revalida a permissão na transação do banco, usando o JWT do solicitante.
   let linked;
   try{linked=await request(base+'/rest/v1/rpc/optical_set_member',{method:'POST',headers:{...service,Authorization:authorization},body:JSON.stringify({p_store:store_id,p_email:email,p_role:role,p_active:active,p_full_name:full_name})});}
   catch{return respond(503,{error:'A conta foi criada, mas não foi possível confirmar o vínculo. Atualize a lista; se necessário, use Vincular conta existente.'});}
   if(!linked.ok)return respond(409,{error:'A conta foi criada sem concluir o vínculo com a loja. Use Vincular conta existente ou contate o administrador.'});
   return respond(201,{user_id:newUser.id,message:'Usuário cadastrado. O acesso é pelo e-mail e senha informados.'});
  }catch{return respond(503,{error:'Não foi possível concluir o cadastro. Atualize a lista antes de tentar novamente.'});}
 };
}
