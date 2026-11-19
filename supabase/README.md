# Banco relacional da Ótica Siciliano

Estado: migração preparada e testada localmente. Aplicação no Supabase remoto depende da conexão administrativa. A chave publishable não permite executar DDL. O aplicativo publicado permanece usando localStorage até uma integração posterior com Auth/API.

## Arquivos e execução

1. Aplicar `migrations/202611140001_siciliano.sql` uma única vez como administrador no Supabase. É uma transação: qualquer falha reverte a migração inteira. Nomes prefixados `optical_` evitam colisões comuns; inspecionar o banco remoto antes de executar. Não executar novamente se já aplicada. Não remove tabelas existentes.
2. Criar/conferir o usuário administrador no Supabase Auth e confirmar seu e-mail.
3. Substituir o e-mail em `02_primeiro_administrador.sql` e executar pelo SQL Editor. Não pressupõe que o primeiro cadastro público seja o dono da loja.
4. Vincular outros usuários já existentes no Auth a `optical_members`, usando o `store_id` correto e `role` igual a `seller`, `finance` ou `admin`. Esta operação é administrativa, fora da API pública. `active=false` revoga o acesso aos dados da loja nas requisições seguintes.

## Relacionamentos

Loja → membros (usuários Supabase Auth), clientes, produtos, vendas, financeiro e histórico de estoque.
Cliente → vendas → itens → produtos. Cada vínculo usa a combinação loja + identificador, impedindo referências a cliente/produto/venda de outra loja.
Produto → histórico de estoque. Exclusão de cliente vinculado a venda é bloqueada; produtos são desativados com `active=false`, preservando histórico. Vendas guardam nome do produto no momento do registro.

## Regras

| Operação | Administrador | Vendedor | Financeiro | Anônimo / sem vínculo |
|---|---|---|---|---|
| Consultar clientes, produtos e vendas da própria loja | Sim | Sim | Sim | Não |
| Criar/editar clientes | Sim | Sim | Não | Não |
| Excluir cliente sem venda vinculada | Sim | Não | Não | Não |
| Cadastrar/editar produtos | Sim | Não | Não | Não |
| Ajustar estoque com motivo | Sim, por função | Não | Não | Não |
| Registrar venda e baixar estoque | Sim, por função | Sim, por função | Não | Não |
| Confirmar recebimento pendente | Sim, por função | Não | Sim, por função | Não |
| Consultar/criar/editar outras receitas e despesas | Sim | Não | Sim | Não |
| Excluir outra receita/despesa | Sim | Não | Não | Não |
| Gerenciar membros | Apenas conexão administrativa / SQL Editor | Não | Não | Não |

RLS é habilitado em todas as oito tabelas. Grants de colunas impedem alterar loja, estoque e autoria por chamadas diretas. Funções privilegiadas têm `search_path` vazio, validam usuário e loja, e não podem ser chamadas anonimamente. Nunca enviar service_role ao navegador.

## API prevista

- `optical_create_sale(p_store, p_customer, p_date, p_payment, p_paid, p_items, p_request_id)`: itens JSON com `product_id`, `quantity`, `line_total`. Preço total informado pelo vendedor permite negociar descontos; valores precisam ser positivos e ter no máximo duas casas decimais. Estoque, venda e histórico são gravados juntos ou revertidos juntos. Produtos são bloqueados em ordem de UUID para tratar vendas simultâneas. Repetir o mesmo request UUID pelo mesmo usuário retorna a venda existente sem nova baixa (mesmo que o payload tenha mudado). Uma nova venda precisa de novo UUID. Não reutilizar UUID para outra operação.
- `optical_receive_sale(p_store, p_sale)`: confirma uma vez, preservando a primeira data de recebimento em repetições.
- `optical_adjust_stock(p_store, p_product, p_delta, p_reason)`: ajuste atômico apenas para administrador; um envio repetido é um novo ajuste, portanto não repetir automaticamente em caso de resposta incerta sem consultar o histórico.

Vendas pagas são computadas diretamente nos relatórios e não devem ser duplicadas em `optical_financial_entries`. Relatórios devem filtrar `sale_date` ou `entry_date` conforme a tela; data de recebimento fica disponível em `paid_at`. Não há disparo de mensagens nem recurso de aniversário nesta migração.

## Verificação

`verification/check.mjs` executou a migração completa em PostgreSQL local via PGlite 0.5.16 e passou em 38 verificações: isolamento entre lojas, permissões de perfis, bloqueio anônimo, bloqueio de autoelevação de papel, relacionamentos compostos, estoque insuficiente, venda idempotente, saldo de estoque, confirmação financeira e revogação de membro. Não substitui teste remoto de Auth/PostgREST nem teste de concorrência em duas conexões.

Para repetir, obter o pacote oficial `@electric-sql/pglite@0.5.16` do npm e extrair em `verification/package`; rodar `node supabase/verification/check.mjs` a partir da pasta do aplicativo. Dependência baixada apenas para teste, ignorada pelo Git.

Referências oficiais: https://supabase.com/docs/guides/database/postgres/row-level-security e https://supabase.com/docs/guides/database/functions
