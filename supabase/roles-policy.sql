-- Complemento da migração inicial. Executar no SQL Editor como administrador.
-- Transação única; preserva os dados operacionais. Não cria contas nem envia e-mails.
begin;
alter table public.optical_members drop constraint optical_members_role_check;
update public.optical_members set role='team' where role in ('seller','finance');
alter table public.optical_members add constraint optical_members_role_check check(role in ('admin','manager','team'));

create table public.optical_member_audit (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.optical_stores(id),
  user_id uuid not null references auth.users(id),
  changed_by uuid not null references auth.users(id),
  previous_role text, previous_active boolean,
  new_role text not null, new_active boolean not null,
  created_at timestamptz not null default now()
);
create index optical_member_audit_store_idx on public.optical_member_audit(store_id,created_at);
create index optical_member_audit_user_idx on public.optical_member_audit(user_id);
create index optical_member_audit_actor_idx on public.optical_member_audit(changed_by);
alter table public.optical_member_audit enable row level security;
revoke all on public.optical_member_audit from public,anon,authenticated;
grant select on public.optical_member_audit to authenticated;
create policy optical_member_audit_read on public.optical_member_audit for select to authenticated
  using(siciliano_private.has_role(store_id,array['admin','manager']));

-- Substitui somente políticas pertencentes a este aplicativo.
do $$ declare p record; v_roles text;
begin
  for p in select schemaname,tablename,policyname from pg_policies where schemaname='public'
    and tablename in ('optical_stores','optical_members','optical_customers','optical_products',
      'optical_sales','optical_sale_items','optical_financial_entries','optical_stock_movements')
    and policyname like 'optical_%' loop
    execute format('drop policy %I on %I.%I',p.policyname,p.schemaname,p.tablename);
  end loop;
  for p in select unnest(array['optical_stores','optical_customers','optical_products','optical_sales','optical_sale_items','optical_stock_movements','optical_financial_entries']) as tablename loop
    v_roles:=case when p.tablename in ('optical_stores','optical_financial_entries')
      then 'array[''admin'',''manager'']' else 'array[''admin'',''manager'',''team'']' end;
    if p.tablename='optical_stores' then
      -- Equipe precisa ler apenas o nome/ID da própria loja para iniciar a sessão.
      execute 'create policy optical_stores_read on public.optical_stores for select to authenticated using(siciliano_private.has_role(id,array[''admin'',''manager'',''team'']))';
    else
      execute format('create policy %I on public.%I for select to authenticated using(siciliano_private.has_role(store_id,%s))',p.tablename||'_read',p.tablename,v_roles);
    end if;
  end loop;
  for p in select unnest(array['optical_customers','optical_products','optical_financial_entries']) as tablename loop
    v_roles:=case when p.tablename='optical_financial_entries' then 'array[''admin'',''manager'']' else 'array[''admin'',''manager'',''team'']' end;
    execute format('create policy %I on public.%I for insert to authenticated with check(siciliano_private.has_role(store_id,%s))',p.tablename||'_add',p.tablename,v_roles);
    execute format('create policy %I on public.%I for update to authenticated using(siciliano_private.has_role(store_id,%s)) with check(siciliano_private.has_role(store_id,%s))',p.tablename||'_edit',p.tablename,v_roles,v_roles);
  end loop;
end $$;
create policy optical_stores_edit on public.optical_stores for update to authenticated
  using(siciliano_private.has_role(id,array['admin','manager'])) with check(siciliano_private.has_role(id,array['admin','manager']));
create policy optical_members_read on public.optical_members for select to authenticated
  using(user_id=(select auth.uid()) or siciliano_private.has_role(store_id,array['admin','manager']));
create policy optical_customers_remove on public.optical_customers for delete to authenticated
  using(siciliano_private.has_role(store_id,array['admin','manager','team']));
create policy optical_entries_remove on public.optical_financial_entries for delete to authenticated
  using(siciliano_private.has_role(store_id,array['admin','manager']));

create function public.optical_list_members(p_store uuid)
returns table(user_id uuid,email text,role text,active boolean,created_at timestamptz)
language plpgsql security definer set search_path='' as $$
begin
  if not siciliano_private.has_role(p_store,array['admin','manager']) then
    raise exception 'Sem permissão para consultar usuários' using errcode='42501'; end if;
  return query select m.user_id,u.email::text,m.role,m.active,m.created_at
    from public.optical_members m join auth.users u on u.id=m.user_id
    where m.store_id=p_store order by m.created_at,m.user_id;
end $$;

create function public.optical_set_member(p_store uuid,p_email text,p_role text,p_active boolean)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_actor_role text; v_target uuid; v_old public.optical_members%rowtype;
begin
  -- Todas as mudanças de membros da loja compartilham este bloqueio.
  perform 1 from public.optical_stores where id=p_store for update;
  select role into v_actor_role from public.optical_members
    where store_id=p_store and user_id=auth.uid() and active;
  if v_actor_role is null or v_actor_role not in ('admin','manager') then
    raise exception 'Sem permissão para gerenciar usuários' using errcode='42501'; end if;
  if p_role is null or p_role not in ('admin','manager','team') or p_active is null then
    raise exception 'Perfil ou situação inválidos'; end if;
  select id into v_target from auth.users where lower(email)=lower(trim(p_email)) and email_confirmed_at is not null;
  if v_target is null then raise exception 'Cadastre e confirme este e-mail em Authentication > Users no Supabase antes de vinculá-lo.'; end if;
  select * into v_old from public.optical_members where store_id=p_store and user_id=v_target;
  if v_actor_role='manager' and (p_role='admin' or v_old.role='admin') then
    raise exception 'Somente um administrador pode gerenciar contas de administrador' using errcode='42501'; end if;
  if v_old.role='admin' and v_old.active and (p_role<>'admin' or not p_active)
    and not exists(select 1 from public.optical_members where store_id=p_store and role='admin' and active and user_id<>v_target) then
    raise exception 'Mantenha pelo menos um administrador ativo na loja'; end if;
  insert into public.optical_members(store_id,user_id,role,active) values(p_store,v_target,p_role,p_active)
    on conflict(store_id,user_id) do update set role=excluded.role,active=excluded.active;
  insert into public.optical_member_audit(store_id,user_id,changed_by,previous_role,previous_active,new_role,new_active)
    values(p_store,v_target,auth.uid(),v_old.role,v_old.active,p_role,p_active);
  return v_target;
end $$;
revoke all on function public.optical_list_members(uuid) from public,anon,authenticated;
revoke all on function public.optical_set_member(uuid,text,text,boolean) from public,anon,authenticated;
grant execute on function public.optical_list_members(uuid) to authenticated;
grant execute on function public.optical_set_member(uuid,text,text,boolean) to authenticated;

-- As três funções transacionais existentes recebem a nova matriz de perfis.
do $$ declare p record; v_definition text;
begin
  for p in select oid,proname from pg_proc where pronamespace='public'::regnamespace
    and proname in ('optical_create_sale','optical_receive_sale','optical_adjust_stock') loop
    v_definition:=pg_get_functiondef(p.oid);
    v_definition:=replace(v_definition,'array[''admin'',''seller'']','array[''admin'',''manager'',''team'']');
    v_definition:=replace(v_definition,'array[''admin'',''finance'']','array[''admin'',''manager'',''team'']');
    v_definition:=replace(v_definition,'array[''admin'']','array[''admin'',''manager'',''team'']');
    execute v_definition;
  end loop;
end $$;
-- Permissões de execução anteriores são preservadas pelo CREATE OR REPLACE.
notify pgrst,'reload schema';
commit;
