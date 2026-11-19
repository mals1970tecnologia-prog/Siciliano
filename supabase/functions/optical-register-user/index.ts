import {createHandler} from './handler.mjs';
// Cada requisição verifica o JWT no Supabase Auth e o perfil ativo no banco.
Deno.serve(createHandler({env:(key:string)=>Deno.env.get(key),fetch}));
