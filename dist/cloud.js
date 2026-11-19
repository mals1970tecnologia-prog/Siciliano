export function createCloud(client) {
  const uppercase = value => String(value ?? '').trim().toLocaleUpperCase('pt-BR');
  const tables = {clients:'optical_customers', products:'optical_products', entries:'optical_financial_entries'};
  let store, role, user;
  const checked = async request => { const result = await request; if (result.error) throw result.error; return result.data; };
  async function all(table) {
    let rows=[];
    for(let offset=0;;offset+=500){
      const batch=await checked(client.from(table).select('*').eq('store_id',store.id).order('id').range(offset,offset+499));
      rows.push(...batch); if(batch.length<500) return rows;
    }
  }
  return {
    get store(){return store}, get role(){return role},
    async authorize(id){
      user=id;
      const members=await checked(client.from('optical_members').select('store_id,role').eq('user_id',id).eq('active',true));
      if(!members.length) throw Error('Seu usuário ainda não está vinculado a uma loja ativa. Solicite o vínculo ao administrador.');
      if(members.length!==1) throw Error('Seu usuário está vinculado a várias lojas. Solicite ao administrador um único vínculo para este aplicativo.');
      const stores=await checked(client.from('optical_stores').select('id,name').eq('id',members[0].store_id));
      if(stores.length!==1) throw Error('Não foi possível localizar sua loja.');
      store=stores[0];role=({seller:'team',finance:'team'}[members[0].role]||members[0].role);
      if(!['admin','manager','team'].includes(role))throw Error('Seu usuário possui um perfil inválido. Solicite a revisão ao administrador.');
    },
    async load(){
      const [clients,products,sales,items,entries,memberResult]=await Promise.all([
        all('optical_customers'),all('optical_products'),all('optical_sales'),all('optical_sale_items'),
        role==='team'?Promise.resolve([]):all('optical_financial_entries'),
        role==='team'?Promise.resolve({data:[],error:null}):client.rpc('optical_list_members',{p_store:store.id})]);
      return {clients,products:products.map(p=>({...p,price:p.price==null?null:Number(p.price)})),
        sales:sales.sort((a,b)=>a.created_at.localeCompare(b.created_at)).map(s=>{
          const lines=items.filter(i=>i.sale_id===s.id);
          return {...s,client:s.customer_id,product:lines[0]?.product_id,quantity:lines.reduce((n,i)=>n+i.quantity,0),
            value:Number(s.total),date:s.sale_date,payment:s.payment_method,
            productLabel:lines.map(i=>i.product_name+(lines.length>1?` (${i.quantity})`:'')).join(', '),items:lines};
        }),entries:entries.map(e=>({...e,value:Number(e.value),date:e.entry_date})),
        users:memberResult.error?[]:memberResult.data,
        usersError:memberResult.error?.message||'',usersReady:role!=='team'&&!memberResult.error};
    },
    async save(kind,data,id,requestId){
      if(kind==='sales')return checked(client.rpc(data.details?'optical_create_sale_complete':'optical_create_sale',{
        p_store:store.id,p_customer:data.client,p_date:data.date,p_payment:data.payment,p_paid:data.status==='Pago',
        p_items:[{product_id:data.product,quantity:data.quantity,line_total:data.value}],p_request_id:requestId,
        ...(data.details?{p_details:data.details}:{})}));
      const payload=kind==='clients'?{name:uppercase(data.name),phone:data.phone,email:data.email}:
        kind==='products'?{name:uppercase(data.name),material:uppercase(data.material),category:data.category,price:data.price}:
        {description:data.description,type:data.type,value:data.value,entry_date:data.date};
      const request=id?client.from(tables[kind]).update(payload).eq('store_id',store.id).eq('id',id):
        client.from(tables[kind]).insert({...payload,store_id:store.id});
      const rows=await checked(request.select('id'));
      if(rows.length!==1)throw Error('Registro não alterado. Confira sua permissão e atualize a página.');
      return rows[0].id;
    },
    async remove(kind,id){
      const request=kind==='products'?client.from(tables[kind]).update({active:false}):client.from(tables[kind]).delete();
      const rows=await checked(request.eq('store_id',store.id).eq('id',id).select('id'));
      if(rows.length!==1)throw Error('Registro não alterado. Confira sua permissão.');
    },
    receive(id){return checked(client.rpc('optical_receive_sale',{p_store:store.id,p_sale:id}));},
    adjust(id,delta,reason){return checked(client.rpc('optical_adjust_stock',{p_store:store.id,p_product:id,p_delta:delta,p_reason:reason}));},
    setMember(email,role,active,fullName){return checked(client.rpc('optical_set_member',{p_store:store.id,p_email:email,p_role:role,p_active:active,p_full_name:fullName}));},
    async createUser(data){
      const result=await client.functions.invoke('optical-register-user',{body:{...data,store_id:store.id}});
      if(result.error){let message='Não foi possível cadastrar o usuário.';try{message=(await result.error.context.json()).error||message;}catch{}throw Error(message);}
      if(result.data?.error)throw Error(result.data.error);return result.data;
    },
    get user(){return user}
  };
}
