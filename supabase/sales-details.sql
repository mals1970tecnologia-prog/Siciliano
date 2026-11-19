begin;
alter table public.optical_sales
 add column esferico_longe_o_d numeric(7,2), add column esferico_longe_o_e numeric(7,2),
 add column esferico_perto_o_d numeric(7,2), add column esferico_perto_o_e numeric(7,2),
 add column cilindrico_longe_o_d numeric(7,2), add column cilindrico_longe_o_e numeric(7,2),
 add column cilindrico_perto_o_d numeric(7,2), add column cilindrico_perto_o_e numeric(7,2),
 add column eixo_longe_o_d integer check(eixo_longe_o_d between 0 and 180),
 add column eixo_longe_o_e integer check(eixo_longe_o_e between 0 and 180),
 add column eixo_perto_o_d integer check(eixo_perto_o_d between 0 and 180),
 add column eixo_perto_o_e integer check(eixo_perto_o_e between 0 and 180),
 add column dnp_o_d numeric(7,2) check(dnp_o_d>0), add column dnp_o_e numeric(7,2) check(dnp_o_e>0),
 add column adicao numeric(7,2) check(adicao>=0),
 add column valor_armacao numeric(12,2) check(valor_armacao>=0 and valor_armacao<10000000000),
 add column valor_lente numeric(12,2) check(valor_lente>=0 and valor_lente<10000000000),
 add column obs text check(length(obs)<=4000), add column categoria text check(length(categoria)<=120),
 add column receita_propia boolean, add column data_input date,
 add column cpf text check(cpf ~ '^[0-9]{11}$'), add column cep text check(cep ~ '^[0-9]{8}$'),
 add column dt_nascimento date check(dt_nascimento<=current_date);
comment on column public.optical_sales.total is 'VALOR_TOTAL: fonte única do total da venda.';
comment on column public.optical_sales.created_at is 'DATA_INCLUSAO: data e hora registradas automaticamente no servidor.';

create function public.optical_create_sale_complete(p_store uuid,p_customer uuid,p_date date,
 p_payment text,p_paid boolean,p_items jsonb,p_request_id uuid,p_details jsonb)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_sale uuid; v_existing public.optical_sales%rowtype; v_details public.optical_sales%rowtype;
begin
 if not siciliano_private.has_role(p_store,array['admin','manager','team']) then
  raise exception 'Sem permissão para registrar vendas' using errcode='42501'; end if;
 if p_request_id is null then raise exception 'Identificador da venda obrigatório'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_request_id::text,0));
 select * into v_existing from public.optical_sales where id=p_request_id;
 if found then
  if v_existing.store_id=p_store and v_existing.created_by=auth.uid() then return v_existing.id; end if;
  raise exception 'Identificador de venda indisponível';
 end if;
 if p_details is null or jsonb_typeof(p_details)<>'object' then raise exception 'Detalhes inválidos'; end if;
 if exists(select 1 from jsonb_object_keys(p_details) as keys(key) where key not in (
  'esferico_longe_o_d','esferico_longe_o_e','esferico_perto_o_d','esferico_perto_o_e',
  'cilindrico_longe_o_d','cilindrico_longe_o_e','cilindrico_perto_o_d','cilindrico_perto_o_e',
  'eixo_longe_o_d','eixo_longe_o_e','eixo_perto_o_d','eixo_perto_o_e',
  'dnp_o_d','dnp_o_e','adicao','valor_armacao','valor_lente','obs','categoria',
  'receita_propia','data_input','cpf','cep','dt_nascimento')) then raise exception 'Campo não permitido nos detalhes'; end if;
 if exists(select 1 from jsonb_each(p_details) e where (e.key like 'esferico_%' or e.key like 'cilindrico_%'
  or e.key like 'eixo_%' or e.key like 'dnp_%' or e.key in ('adicao','valor_armacao','valor_lente'))
  and jsonb_typeof(e.value) not in ('number','null')) then raise exception 'Medidas e valores devem ser números'; end if;
 if exists(select 1 from jsonb_each_text(p_details) e where e.key like 'eixo_%' and e.value is not null
  and e.value !~ '^[0-9]{1,3}$') then raise exception 'O eixo deve ser um número inteiro entre 0 e 180'; end if;
 select * into v_details from jsonb_populate_record(null::public.optical_sales,p_details);
 v_sale:=public.optical_create_sale(p_store,p_customer,p_date,p_payment,p_paid,p_items,p_request_id);
 select * into v_existing from public.optical_sales where id=v_sale;
 if v_details.valor_armacao is not null or v_details.valor_lente is not null then
  if coalesce(v_details.valor_armacao,0)+coalesce(v_details.valor_lente,0)<>v_existing.total then
   raise exception 'Valor total deve ser igual à soma da armação e da lente'; end if;
 end if;
 update public.optical_sales set
 esferico_longe_o_d=v_details.esferico_longe_o_d,esferico_longe_o_e=v_details.esferico_longe_o_e,
 esferico_perto_o_d=v_details.esferico_perto_o_d,esferico_perto_o_e=v_details.esferico_perto_o_e,
 cilindrico_longe_o_d=v_details.cilindrico_longe_o_d,cilindrico_longe_o_e=v_details.cilindrico_longe_o_e,
 cilindrico_perto_o_d=v_details.cilindrico_perto_o_d,cilindrico_perto_o_e=v_details.cilindrico_perto_o_e,
 eixo_longe_o_d=v_details.eixo_longe_o_d,eixo_longe_o_e=v_details.eixo_longe_o_e,
 eixo_perto_o_d=v_details.eixo_perto_o_d,eixo_perto_o_e=v_details.eixo_perto_o_e,
 dnp_o_d=v_details.dnp_o_d,dnp_o_e=v_details.dnp_o_e,adicao=v_details.adicao,
 valor_armacao=v_details.valor_armacao,valor_lente=v_details.valor_lente,
 obs=v_details.obs,categoria=v_details.categoria,receita_propia=v_details.receita_propia,
 data_input=v_details.data_input,cpf=v_details.cpf,cep=v_details.cep,dt_nascimento=v_details.dt_nascimento
 where id=v_sale and store_id=p_store;
 return v_sale;
end $$;
revoke all on function public.optical_create_sale_complete(uuid,uuid,date,text,boolean,jsonb,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.optical_create_sale_complete(uuid,uuid,date,text,boolean,jsonb,uuid,jsonb) to authenticated;
notify pgrst,'reload schema';
commit;
