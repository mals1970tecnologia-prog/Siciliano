-- Executar SOMENTE depois da migração, no SQL Editor como administrador do projeto.
-- Primeiro crie/confirme seu usuário no Supabase Auth.
-- E-mail do administrador informado pelo proprietário da ótica.
begin;
do $$
declare v_email text := 'admin@example.com';
  v_user uuid; v_store uuid;
begin
  select id into v_user from auth.users where lower(email)=lower(v_email) and email_confirmed_at is not null;
  if v_user is null then raise exception 'Usuário com e-mail confirmado não encontrado. Confira o e-mail e o Supabase Auth.'; end if;
  if exists(select 1 from public.optical_stores) then
    raise exception 'Já existe uma loja. Confira os registros e use o store_id existente; não crie outra loja automaticamente.';
  end if;
  insert into public.optical_stores(name) values('Ótica Siciliano') returning id into v_store;
  insert into public.optical_members(store_id,user_id,role) values(v_store,v_user,'admin');
  raise notice 'Loja criada: %. Administrador vinculado: %',v_store,v_email;
end;
$$;
commit;
