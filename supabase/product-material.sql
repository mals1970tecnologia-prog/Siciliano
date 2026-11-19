begin;
alter table public.optical_products add column material text not null default '' check(length(material)<=200);
alter table public.optical_products alter column price drop not null;
alter table public.optical_products drop constraint optical_products_category_check;
alter table public.optical_products add constraint optical_products_category_check
 check(category in ('Armação','Lente','Solar','Acessório','Não informado'));
grant insert(material),update(material) on public.optical_products to authenticated;
comment on column public.optical_products.price is 'Preço de venda. Nulo significa preço ainda não informado; não equivale a gratuito.';
comment on column public.optical_products.material is 'Material ou variante informada no catálogo do produto.';
notify pgrst,'reload schema';
commit;
