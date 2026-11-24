-- Controle compartilhado de confirmação manual de WhatsApp no aniversário de um ano.
-- Aplicar uma vez, depois da migração inicial e de roles-policy.sql.
begin;
create table public.optical_anniversary_contacts (
  store_id uuid not null references public.optical_stores(id),
  customer_id uuid not null,
  last_purchase_date date not null,
  sent_at timestamptz not null default now(),
  sent_by uuid not null default auth.uid() references auth.users(id),
  primary key (store_id,customer_id,last_purchase_date),
  foreign key (store_id,customer_id) references public.optical_customers(store_id,id)
);
create index optical_anniversary_contacts_actor_idx on public.optical_anniversary_contacts(sent_by);
alter table public.optical_anniversary_contacts enable row level security;
revoke all on public.optical_anniversary_contacts from public,anon,authenticated;
grant select on public.optical_anniversary_contacts to authenticated;
grant insert(store_id,customer_id,last_purchase_date) on public.optical_anniversary_contacts to authenticated;
create policy optical_anniversary_contacts_read on public.optical_anniversary_contacts
  for select to authenticated using(siciliano_private.has_role(store_id,array['admin','manager']));
create policy optical_anniversary_contacts_add on public.optical_anniversary_contacts
  for insert to authenticated with check (
    siciliano_private.has_role(store_id,array['admin','manager'])
    and sent_by=(select auth.uid())
    and last_purchase_date=(select max(s.sale_date) from public.optical_sales s
      where s.store_id=optical_anniversary_contacts.store_id and s.customer_id=optical_anniversary_contacts.customer_id)
  );
comment on table public.optical_anniversary_contacts is
  'Confirmação manual de envio, uma por cliente/última compra. Abrir WhatsApp não confirma envio nem entrega.';
commit;
