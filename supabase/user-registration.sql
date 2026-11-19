begin;
alter table public.optical_members add column full_name text not null default '' check(length(full_name)<=120);
update public.optical_members m set full_name=left(trim(coalesce(u.raw_user_meta_data->>'full_name',u.raw_user_meta_data->>'name','')),120) from auth.users u where u.id=m.user_id;
alter table public.optical_member_audit add column previous_name text,add column new_name text;
drop function public.optical_list_members(uuid);
drop function public.optical_set_member(uuid,text,text,boolean);
create function public.optical_list_members(p_store uuid)
returns table(user_id uuid,email text,role text,active boolean,created_at timestamptz,full_name text)
language plpgsql security definer set search_path='' as $$
begin
  if not siciliano_private.has_role(p_store,array['admin','manager']) then
    raise exception 'Sem permissão para consultar usuários' using errcode='42501'; end if;
  return query select m.user_id,u.email::text,m.role,m.active,m.created_at,m.full_name
    from public.optical_members m join auth.users u on u.id=m.user_id
    where m.store_id=p_store order by m.created_at,m.user_id;
end $$;


create function public.optical_set_member(p_store uuid,p_email text,p_role text,p_active boolean,p_full_name text default null)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_actor_role text; v_target uuid; v_old public.optical_members%rowtype; v_name text;
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
  v_name:=coalesce(nullif(trim(regexp_replace(p_full_name,'[[:space:]]+',' ','g')),''),nullif(v_old.full_name,''));
  if v_name is null or length(v_name)>120 then raise exception 'Informe o nome completo (até 120 caracteres)'; end if;
  if v_actor_role='manager' and (p_role<>'team' or (v_old.role is not null and v_old.role<>'team')) then
    raise exception 'O perfil Gerencial só pode cadastrar e gerenciar contas de Equipe' using errcode='42501'; end if;
  if v_old.role='admin' and v_old.active and (p_role<>'admin' or not p_active)
    and not exists(select 1 from public.optical_members where store_id=p_store and role='admin' and active and user_id<>v_target) then
    raise exception 'Mantenha pelo menos um administrador ativo na loja'; end if;
  insert into public.optical_members(store_id,user_id,role,active,full_name) values(p_store,v_target,p_role,p_active,v_name)
    on conflict(store_id,user_id) do update set role=excluded.role,active=excluded.active,full_name=excluded.full_name;
  insert into public.optical_member_audit(store_id,user_id,changed_by,previous_role,previous_active,new_role,new_active,previous_name,new_name)
    values(p_store,v_target,auth.uid(),v_old.role,v_old.active,p_role,p_active,v_old.full_name,v_name);
  return v_target;
end $$;

revoke all on function public.optical_list_members(uuid) from public,anon,authenticated;
revoke all on function public.optical_set_member(uuid,text,text,boolean,text) from public,anon,authenticated;
grant execute on function public.optical_list_members(uuid) to authenticated;
grant execute on function public.optical_set_member(uuid,text,text,boolean,text) to authenticated;
notify pgrst,'reload schema';
commit;