# Perfis e gestão de usuários

Aplicar `roles-policy.sql` uma vez no SQL Editor do projeto, depois da migração inicial. A conta que executa deve ter privilégio de administrador do banco. Sem essa etapa, a interface mostra Usuários indisponível; não trata a ausência das funções como sucesso.

| Perfil | Menus | Gestão de contas |
|---|---|---|
| Administrador (`admin`) | Todos | Atribui qualquer perfil e ativa/desativa contas da própria loja |
| Gerencial (`manager`) | Todos | Gerencia Gerencial e Equipe; não altera nem atribui Administrador |
| Equipe (`team`) | Clientes, Produtos, Vendas | Não consulta nem altera usuários |

Equipe pode cadastrar/editar clientes e produtos, excluir clientes sem vendas, desativar produtos, ajustar estoque com motivo, registrar vendas e confirmar recebimentos. Não acessa Financeiro, Relatórios, Usuários, Configurações nem Visão geral. O banco permite apenas dados operacionais desses módulos e nome/ID da própria loja necessários à inicialização.

Os perfis antigos `seller` e `finance` são convertidos em `team`, sem promoção automática a acesso total. O proprietário pode atribuir Gerencial pelo novo menu após aplicar o SQL. A aplicação também interpreta os nomes antigos como Equipe na transição.

## Cadastro

Crie a conta em Supabase → Authentication → Users e confirme o e-mail. Depois, em Usuários → Vincular usuário, informe o e-mail, perfil e situação. Não há gestão de senhas no aplicativo, chaves administrativas no navegador nem convite automático por e-mail. O vínculo é feito por função protegida no banco; a senha não é enviada nem armazenada por essa função.

## Proteções

- Apenas membros ativos da mesma loja podem executar as operações.
- Nenhum cliente pode escrever diretamente em `optical_members`.
- Alterações registram ator, alvo, perfil anterior/novo e situação na tabela `optical_member_audit`, visível apenas para Administrador e Gerencial.
- O último Administrador ativo não pode ser desativado ou rebaixado. Operações simultâneas de gestão de membros usam bloqueio da loja.
- Usuários de uma loja não podem modificar membros de outra.
- A revalidação ao atualizar dados atualiza perfil e menus; se o vínculo foi desativado, bloqueia a tela. O banco rejeita o acesso revogado nas próximas solicitações, independentemente da atualização do menu. Registros já vistos no navegador não podem ser retirados retroativamente.

## Validação

`node supabase/verification/roles-check.mjs` passou em 28 verificações num PostgreSQL local PGlite. Inclui último administrador, escalonamento de privilégios, isolamento entre lojas, uso operacional da equipe, bloqueio do financeiro, revogação e recusa anônima.

`node supabase/verification/cloud-check.mjs` verifica o adaptador, oito telas, navegação de Equipe e Gerencial e erros da API simulada.

A aplicação da migração remota não é inferida pelos testes locais: deve ser confirmada no SQL Editor ou por acesso administrativo ao projeto.
