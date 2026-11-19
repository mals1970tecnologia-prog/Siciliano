# Campos complementares da venda

Aplicação: `sales-details.sql` adiciona 24 colunas opcionais a `optical_sales`, preservando as vendas existentes. `total` já existente representa VALOR_TOTAL; `created_at` representa DATA_INCLUSAO e é registrado automaticamente no servidor. O produto continua relacionado pelos itens da venda. Não há duplicação dessas três fontes.

Os campos foram mantidos com os identificadores solicitados (em minúsculas no PostgreSQL), inclusive `receita_propia`; a interface exibe “Receita própria”. `data_input` é a data de entrada informada no atendimento e `dt_nascimento` é a data de nascimento informada nessa venda. CPF, CEP e nascimento são snapshots da venda: não alteram o cadastro do cliente.

A receita é organizada por longe/perto e OD/OE: esférico, cilíndrico, eixo, DNP e adição. Campos em branco permanecem nulos; zero e valores negativos válidos nos campos esféricos/cilíndricos são preservados. Eixos inteiros de 0 a 180; DNP positivo; adição não negativa. CPF e CEP são texto com 11 e 8 dígitos respectivamente, preservando zeros à esquerda. A validação do CPF verifica formato e quantidade de dígitos, não existência ou situação cadastral. Observações têm limite de 4.000 caracteres.

Valores da armação/lente são totais da venda, não unitários. Selecionar produto ou alterar quantidade preenche a composição com preço × quantidade (produto Lente em valor_lente; demais categorias em valor_armacao). O operador pode ajustar a composição; total é a soma em centavos. O banco verifica a soma contra os itens. Não há desconto separado nesta versão.

`optical_create_sale_complete` valida loja e perfil, chama a função transacional anterior e grava os detalhes na mesma transação. Qualquer falha reverte venda, itens e estoque. A repetição do mesmo request UUID retorna a primeira venda sem reescrever receita nem baixar estoque novamente. Função antiga continua disponível para compatibilidade e grava novas colunas como nulo.

Todos os perfis que podem operar Vendas (Administrador, Gerencial, Equipe) podem consultar os campos dentro da própria loja. As políticas RLS existentes permanecem ativas; não foi concedido UPDATE direto de vendas a usuários. Não há acesso anônimo.

Na listagem, “Detalhes” abre a ficha em modo de consulta. A exportação CSV de vendas e relatórios inclui os novos campos e a data de inclusão. A busca também considera CPF, categoria e observações.

Teste: `node supabase/verification/sales-check.mjs` executou a migração e 27 verificações locais de gravação, formatos, soma monetária, rollback, idempotência, bloqueio anônimo e isolamento de loja. Campos sensíveis foram testados apenas com dados sintéticos.
