-- Executar uma vez no projeto Supabase, como administrador (SQL Editor/migrations).
-- Não importa dados fictícios e não concede acesso a usuários automaticamente.
begin;

create schema if not exists siciliano_private;
revoke all on schema siciliano_private from public, anon, authenticated;
grant usage on schema siciliano_private to authenticated;

create table public.optical_stores (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 120),
  created_at timestamptz not null default now()
);
create table public.optical_members (
  store_id uuid not null references public.optical_stores(id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete restrict,
  role text not null check (role in ('admin','seller','finance')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (store_id,user_id)
);
create index optical_members_user_idx on public.optical_members(user_id,store_id) where active;

-- Helper fora do schema público: consulta membros sem recursão de RLS.
create function siciliano_private.has_role(p_store uuid, p_roles text[])
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists(select 1 from public.optical_members m
    where m.store_id=p_store and m.user_id=(select auth.uid())
      and m.active and m.role=any(p_roles));
$$;
revoke all on function siciliano_private.has_role(uuid,text[]) from public,anon,authenticated;
grant execute on function siciliano_private.has_role(uuid,text[]) to authenticated;

create table public.optical_customers (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.optical_stores(id) on delete restrict,
  name text not null check (length(trim(name)) between 1 and 120),
  phone text not null default '' check (length(phone)<=30),
  email text not null default '' check (length(email)<=254),
  created_at timestamptz not null default now(),
  unique(store_id,id)
);
create table public.optical_products (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.optical_stores(id) on delete restrict,
  name text not null check (length(trim(name)) between 1 and 150),
  category text not null check (category in ('Armação','Lente','Solar','Acessório')),
  price numeric(12,2) not null check (price>0 and price<10000000000),
  stock integer not null default 0 check (stock>=0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique(store_id,id)
);
create table public.optical_sales (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.optical_stores(id) on delete restrict,
  customer_id uuid not null,
  sale_date date not null default (now() at time zone 'America/Sao_Paulo')::date,
  status text not null default 'Pendente' check (status in ('Pago','Pendente')),
  payment_method text not null check (payment_method in ('Pix','Cartão','Dinheiro','Boleto')),
  total numeric(12,2) not null check(total>0 and total<10000000000),
  paid_at timestamptz,
  created_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique(store_id,id),
  foreign key(store_id,customer_id) references public.optical_customers(store_id,id) on delete restrict,
  check ((status='Pago' and paid_at is not null) or (status='Pendente' and paid_at is null))
);
create table public.optical_sale_items (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null,
  sale_id uuid not null,
  product_id uuid not null,
  product_name text not null,
  quantity integer not null check(quantity>0),
  line_total numeric(12,2) not null check(line_total>0 and line_total<10000000000),
  foreign key(store_id,sale_id) references public.optical_sales(store_id,id) on delete restrict,
  foreign key(store_id,product_id) references public.optical_products(store_id,id) on delete restrict,
  unique(sale_id,product_id)
);
create table public.optical_financial_entries (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.optical_stores(id) on delete restrict,
  description text not null check(length(trim(description)) between 1 and 200),
  type text not null check(type in ('Entrada','Saída')),
  value numeric(12,2) not null check(value>0 and value<10000000000),
  entry_date date not null default (now() at time zone 'America/Sao_Paulo')::date,
  created_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);
comment on table public.optical_financial_entries is 'Outras receitas e despesas. Vendas pagas são somadas separadamente, sem duplicação.';
create table public.optical_stock_movements (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null,
  product_id uuid not null,
  sale_id uuid,
  delta integer not null check(delta<>0),
  reason text not null check(length(trim(reason)) between 1 and 200),
  created_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  foreign key(store_id,product_id) references public.optical_products(store_id,id) on delete restrict,
  foreign key(store_id,sale_id) references public.optical_sales(store_id,id) on delete restrict
);
create index optical_customers_store_idx on public.optical_customers(store_id);
create index optical_products_store_idx on public.optical_products(store_id);
create index optical_sales_period_idx on public.optical_sales(store_id,sale_date,status);
create index optical_sales_customer_idx on public.optical_sales(store_id,customer_id);
create index optical_items_sale_idx on public.optical_sale_items(store_id,sale_id);
create index optical_items_product_idx on public.optical_sale_items(store_id,product_id);
create index optical_entries_period_idx on public.optical_financial_entries(store_id,entry_date);
create index optical_stock_product_idx on public.optical_stock_movements(store_id,product_id,created_at);
create index optical_stock_sale_idx on public.optical_stock_movements(store_id,sale_id);

alter table public.optical_stores enable row level security;
alter table public.optical_members enable row level security;
alter table public.optical_customers enable row level security;
alter table public.optical_products enable row level security;
alter table public.optical_sales enable row level security;
alter table public.optical_sale_items enable row level security;
alter table public.optical_financial_entries enable row level security;
alter table public.optical_stock_movements enable row level security;

-- Grants explícitos: cadastro no Auth não concede acesso à loja.
revoke all on public.optical_stores,public.optical_members,public.optical_customers,
  public.optical_products,public.optical_sales,public.optical_sale_items,
  public.optical_financial_entries,public.optical_stock_movements from public,anon,authenticated;
grant select on public.optical_stores,public.optical_members,public.optical_customers,
  public.optical_products,public.optical_sales,public.optical_sale_items,
  public.optical_financial_entries,public.optical_stock_movements to authenticated;
grant update(name) on public.optical_stores to authenticated;
grant insert(store_id,name,phone,email),update(name,phone,email),delete on public.optical_customers to authenticated;
grant insert(store_id,name,category,price,active),update(name,category,price,active) on public.optical_products to authenticated;
grant insert(store_id,description,type,value,entry_date),update(description,type,value,entry_date),delete
  on public.optical_financial_entries to authenticated;

create policy optical_stores_read on public.optical_stores for select to authenticated
  using(siciliano_private.has_role(id,array['admin','seller','finance']));
create policy optical_stores_edit on public.optical_stores for update to authenticated
  using(siciliano_private.has_role(id,array['admin'])) with check(siciliano_private.has_role(id,array['admin']));
create policy optical_members_read on public.optical_members for select to authenticated
  using(user_id=(select auth.uid()) or siciliano_private.has_role(store_id,array['admin']));
create policy optical_customers_read on public.optical_customers for select to authenticated
  using(siciliano_private.has_role(store_id,array['admin','seller','finance']));
create policy optical_customers_add on public.optical_customers for insert to authenticated
  with check(siciliano_private.has_role(store_id,array['admin','seller']));
create policy optical_customers_edit on public.optical_customers for update to authenticated
  using(siciliano_private.has_role(store_id,array['admin','seller']))
  with check(siciliano_private.has_role(store_id,array['admin','seller']));
create policy optical_customers_remove on public.optical_customers for delete to authenticated
  using(siciliano_private.has_role(store_id,array['admin']));
create policy optical_products_read on public.optical_products for select to authenticated
  using(siciliano_private.has_role(store_id,array['admin','seller','finance']));
create policy optical_products_add on public.optical_products for insert to authenticated
  with check(siciliano_private.has_role(store_id,array['admin']));
create policy optical_products_edit on public.optical_products for update to authenticated
  using(siciliano_private.has_role(store_id,array['admin'])) with check(siciliano_private.has_role(store_id,array['admin']));
create policy optical_sales_read on public.optical_sales for select to authenticated
  using(siciliano_private.has_role(store_id,array['admin','seller','finance']));
create policy optical_items_read on public.optical_sale_items for select to authenticated
  using(siciliano_private.has_role(store_id,array['admin','seller','finance']));
create policy optical_entries_read on public.optical_financial_entries for select to authenticated
  using(siciliano_private.has_role(store_id,array['admin','finance']));
create policy optical_entries_add on public.optical_financial_entries for insert to authenticated
  with check(siciliano_private.has_role(store_id,array['admin','finance']));
create policy optical_entries_edit on public.optical_financial_entries for update to authenticated
  using(siciliano_private.has_role(store_id,array['admin','finance']))
  with check(siciliano_private.has_role(store_id,array['admin','finance']));
create policy optical_entries_remove on public.optical_financial_entries for delete to authenticated
  using(siciliano_private.has_role(store_id,array['admin']));
create policy optical_stock_read on public.optical_stock_movements for select to authenticated
  using(siciliano_private.has_role(store_id,array['admin','seller','finance']));

-- Venda e estoque atômicos. Ordem estável de bloqueios evita deadlock entre produtos.
-- p_items: [{"product_id":"UUID", "quantity":1, "line_total":389.00}]
-- p_request_id deve ser um UUID gerado UMA vez por tentativa lógica de venda.
create function public.optical_create_sale(p_store uuid,p_customer uuid,p_date date,
  p_payment text,p_paid boolean,p_items jsonb,p_request_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_sale uuid; v_existing public.optical_sales%rowtype;
  v_product public.optical_products%rowtype; v_item record; v_total numeric:=0;
begin
  if not siciliano_private.has_role(p_store,array['admin','seller']) then
    raise exception 'Sem permissão para registrar vendas' using errcode='42501';
  end if;
  if p_request_id is null or p_date is null or p_paid is null or p_payment is null
     or p_payment not in ('Pix','Cartão','Dinheiro','Boleto') then raise exception 'Dados da venda inválidos'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_request_id::text,0));
  select * into v_existing from public.optical_sales where id=p_request_id;
  if found then
    if v_existing.store_id=p_store and v_existing.created_by=auth.uid() then return v_existing.id; end if;
    raise exception 'Identificador de venda indisponível';
  end if;
  if not exists(select 1 from public.optical_customers where store_id=p_store and id=p_customer) then
    raise exception 'Cliente não pertence à loja'; end if;
  if p_items is null or jsonb_typeof(p_items)<>'array' then raise exception 'Itens inválidos'; end if;
  if jsonb_array_length(p_items) not between 1 and 100 then raise exception 'Informe de 1 a 100 itens'; end if;
  if exists(select 1 from jsonb_to_recordset(p_items) as i(product_id uuid,quantity numeric,line_total numeric)
    where product_id is null or quantity is null or quantity<1 or quantity>1000000
      or quantity<>trunc(quantity) or line_total is null or line_total<=0
      or line_total>=10000000000 or line_total<>round(line_total,2)) then raise exception 'Item inválido'; end if;
  if (select count(*)<>count(distinct i.product_id) from jsonb_to_recordset(p_items) as i(product_id uuid)) then
    raise exception 'Agrupe o mesmo produto em um único item'; end if;
  for v_item in select * from jsonb_to_recordset(p_items) as i(product_id uuid,quantity integer,line_total numeric)
    order by product_id loop
    select * into v_product from public.optical_products where store_id=p_store and id=v_item.product_id for update;
    if not found then raise exception 'Produto não pertence à loja'; end if;
    if not v_product.active or v_product.stock<v_item.quantity then raise exception 'Produto inativo ou estoque insuficiente'; end if;
    v_total:=v_total+v_item.line_total;
  end loop;
  if v_total>=10000000000 then raise exception 'Total excede limite'; end if;
  insert into public.optical_sales(id,store_id,customer_id,sale_date,status,payment_method,total,paid_at,created_by)
    values(p_request_id,p_store,p_customer,p_date,case when p_paid then 'Pago' else 'Pendente' end,p_payment,
      v_total,case when p_paid then now() else null end,auth.uid()) returning id into v_sale;
  for v_item in select * from jsonb_to_recordset(p_items) as i(product_id uuid,quantity integer,line_total numeric)
    order by product_id loop
    update public.optical_products set stock=stock-v_item.quantity where store_id=p_store and id=v_item.product_id;
    insert into public.optical_sale_items(store_id,sale_id,product_id,product_name,quantity,line_total)
      select p_store,v_sale,p.id,p.name,v_item.quantity,v_item.line_total
      from public.optical_products p where p.store_id=p_store and p.id=v_item.product_id;
    insert into public.optical_stock_movements(store_id,product_id,sale_id,delta,reason,created_by)
      values(p_store,v_item.product_id,v_sale,-v_item.quantity,'Venda',auth.uid());
  end loop;
  return v_sale;
end;
$$;

create function public.optical_receive_sale(p_store uuid,p_sale uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not siciliano_private.has_role(p_store,array['admin','finance']) then
    raise exception 'Sem permissão para confirmar recebimento' using errcode='42501'; end if;
  perform 1 from public.optical_sales where store_id=p_store and id=p_sale for update;
  if not found then raise exception 'Venda não encontrada'; end if;
  update public.optical_sales set status='Pago',paid_at=now() where store_id=p_store and id=p_sale and status='Pendente';
end;
$$;

create function public.optical_adjust_stock(p_store uuid,p_product uuid,p_delta integer,p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_stock integer;
begin
  if not siciliano_private.has_role(p_store,array['admin']) then
    raise exception 'Sem permissão para ajustar estoque' using errcode='42501'; end if;
  if p_delta is null or p_delta=0 or p_reason is null or length(trim(p_reason)) not between 1 and 200 then
    raise exception 'Informe quantidade e motivo válidos'; end if;
  select stock into v_stock from public.optical_products where store_id=p_store and id=p_product for update;
  if not found then raise exception 'Produto não encontrado'; end if;
  if v_stock::bigint+p_delta<0 or v_stock::bigint+p_delta>2147483647 then raise exception 'Estoque fora do limite'; end if;
  update public.optical_products set stock=stock+p_delta where store_id=p_store and id=p_product;
  insert into public.optical_stock_movements(store_id,product_id,delta,reason,created_by)
    values(p_store,p_product,p_delta,trim(p_reason),auth.uid());
end;
$$;

revoke all on function public.optical_create_sale(uuid,uuid,date,text,boolean,jsonb,uuid) from public,anon,authenticated;
revoke all on function public.optical_receive_sale(uuid,uuid) from public,anon,authenticated;
revoke all on function public.optical_adjust_stock(uuid,uuid,integer,text) from public,anon,authenticated;
grant execute on function public.optical_create_sale(uuid,uuid,date,text,boolean,jsonb,uuid) to authenticated;
grant execute on function public.optical_receive_sale(uuid,uuid) to authenticated;
grant execute on function public.optical_adjust_stock(uuid,uuid,integer,text) to authenticated;

-- Não há escrita de membros via API: apenas administrador do projeto no SQL Editor.
-- Não há exclusão/edição direta de vendas, itens ou histórico de estoque pela API.
commit;
