-- Estoque informativo: vendas não validam nem movimentam saldo.
begin;
create or replace function public.optical_create_sale(p_store uuid,p_customer uuid,p_date date,
  p_payment text,p_paid boolean,p_items jsonb,p_request_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_sale uuid; v_existing public.optical_sales%rowtype;
  v_product public.optical_products%rowtype; v_item record; v_total numeric:=0;
begin
  if not siciliano_private.has_role(p_store,array['admin','manager','team']) then
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
    if not v_product.active then raise exception 'Produto inativo'; end if;
    v_total:=v_total+v_item.line_total;
  end loop;
  if v_total>=10000000000 then raise exception 'Total excede limite'; end if;
  insert into public.optical_sales(id,store_id,customer_id,sale_date,status,payment_method,total,paid_at,created_by)
    values(p_request_id,p_store,p_customer,p_date,case when p_paid then 'Pago' else 'Pendente' end,p_payment,
      v_total,case when p_paid then now() else null end,auth.uid()) returning id into v_sale;
  for v_item in select * from jsonb_to_recordset(p_items) as i(product_id uuid,quantity integer,line_total numeric)
    order by product_id loop
    insert into public.optical_sale_items(store_id,sale_id,product_id,product_name,quantity,line_total)
      select p_store,v_sale,p.id,p.name,v_item.quantity,v_item.line_total
      from public.optical_products p where p.store_id=p_store and p.id=v_item.product_id;
  end loop;
  return v_sale;
end;
$$;

commit;

