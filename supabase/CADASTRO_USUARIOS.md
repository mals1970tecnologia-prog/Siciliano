# Cadastro de usuários

`user-registration.sql` adiciona nome completo ao vínculo por loja e restringe Gerencial à gestão de Equipe. Administrador pode cadastrar e editar qualquer perfil, mantendo pelo menos um Administrador ativo. E-mail continua sendo o identificador de login. O nome exibido não é usado para decidir permissões.

Usuários → Cadastrar usuário oferece criar conta nova ou vincular conta existente. Nome completo e e-mail são obrigatórios. Contas novas pedem senha inicial com confirmação (12 a 128 caracteres), definida pelo responsável. Não há envio automático de mensagem ou senha por e-mail. O responsável informa as credenciais ao usuário fora do aplicativo.

A Edge Function `optical-register-user` exige JWT válido da sessão, validado pela plataforma e novamente pelo Supabase Auth. Consulta perfil ativo na loja antes de criar a conta, com chave administrativa somente no ambiente do servidor. O vínculo é feito por RPC usando o JWT do solicitante, que revalida a permissão no banco. Gerencial só pode criar Equipe. Nenhuma senha é armazenada em tabelas do aplicativo, logs ou respostas.

Contas criadas por esse fluxo administrativo são confirmadas no Auth. Se a conta já existir, use Vincular conta existente; esse fluxo não altera a senha dela. Se a criação no Auth for concluída mas o vínculo falhar, a conta permanece sem o novo acesso à loja. Atualize a lista e use Vincular conta existente para concluir. Não há exclusão automática de conta ao ocorrer falha de rede.

Testes locais: 19 verificações em `verification/registration-check.mjs`, cobrindo nome obrigatório, hierarquia, bloqueio anônimo, senha, uso do JWT do solicitante e recuperação de falhas sem exclusão de contas. Nenhuma conta real de teste é criada por essa suíte.
