# Ótica Siciliano — operação em nuvem

O aplicativo usa Supabase Auth e consulta as tabelas `optical_*` com a sessão do usuário e a chave publishable. Não contém chave administrativa e não grava registros operacionais no localStorage. O SDK mantém a sessão de autenticação no navegador.

Pré-requisitos: executar a migração em `supabase/migrations/202611140001_siciliano.sql`, cadastrar e confirmar o usuário no Supabase Auth e executar `supabase/02_primeiro_administrador.sql`. O proprietário informou que executou os dois SQLs com sucesso; a verificação autenticada remota depende do login do proprietário, pois a integração administrativa não está operacional nesta sessão.

Administrador: admin@example.com. A senha é definida pelo proprietário no Supabase e nunca deve ser incluída no código.

## Uso

- Cadastre clientes e produtos. Cada produto começa com estoque zero; use a ação **Estoque** para registrar entrada ou ajuste com motivo.
- Vendas usam `optical_create_sale`, com transação de estoque e UUID estável para evitar duplicação ao repetir a mesma solicitação. A tela atual registra um produto por venda; o banco suporta vários itens e os relatórios contabilizam todos os itens existentes.
- Administrador e financeiro podem confirmar vendas pendentes pela ação **Receber**. Vendas pagas já entram no saldo: não as duplique como outras entradas financeiras.
- Produtos são desativados para preservar histórico. Clientes vinculados a vendas não podem ser excluídos.
- Use **Atualizar dados** antes de um novo atendimento para obter mudanças de outros computadores. Também há atualização ao voltar à aba. Não há sincronização por Realtime nesta versão.
- Usuário sem vínculo ativo não entra no painel. Administrador pode cadastrar produtos; vendedor pode cadastrar clientes e vender; financeiro pode operar recebimentos e outras movimentações. Gestão de membros continua pelo SQL Editor do projeto, fora da API pública.
- Exporte relatórios em CSV e imprima pelo menu Relatórios. O JSON baixado é uma cópia de consulta; não há restauração automática na nuvem.

Dados antigos de demonstração permanecem somente no endereço e navegador em que foram cadastrados. Configurações → Exportar dados locais antigos permite baixar a cópia correspondente ao usuário atual ou à versão inicial. Não ocorre importação automática de dados fictícios.

## Domínio

Hostname solicitado: `siciliano.malstec.com.br`. A validação em 16/11/2026 estava pendente, com consulta DNS retornando nome inexistente. Entradas para a zona `malstec.com.br` no Registro.br:

| Tipo | Nome relativo | Dados |
|---|---|---|
| CNAME | siciliano | custom-domains.chatgpt.site. |
| TXT | _openai-site-verification.siciliano | VALOR_FORNECIDO_PELA_HOSPEDAGEM |
| TXT | _cf-custom-hostname.siciliano | VALOR_FORNECIDO_PELA_HOSPEDAGEM |

Somente a página de login será visível sem autenticação. Os dados permanecem sujeitos ao Auth e às políticas RLS do Supabase.

## Verificação

- `node --check dist/app.js`, `node --check dist/auth.js`, `node --check dist/cloud.js`.
- `node supabase/verification/cloud-check.mjs`: adaptador, operações, papéis e renderização das sete telas com API simulada.
- `node supabase/verification/check.mjs`: migração e 38 verificações de integridade/permissões em PostgreSQL local PGlite.
- Consulta HTTP anônima das oito tabelas remotas retornou 401. Isso comprova a recusa anônima, não o vínculo do administrador nem os fluxos autenticados.
- Tela de login verificada no navegador local. Login e gravação remota requerem validação pela conta do proprietário.

Prévia: `node preview.cjs` e abrir http://127.0.0.1:4173. Publicação estática usa apenas a pasta `dist`.
