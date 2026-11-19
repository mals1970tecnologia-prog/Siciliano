# Ótica Siciliano

Aplicativo de gestão de ótica em português, com clientes, produtos, vendas com receita óptica, estoque, financeiro, relatórios e usuários por perfil.

**Aplicação:** https://siciliano.malstec.com.br  
**Revisão da documentação:** 19/11/2026.

A página de login é pública. Os registros exigem autenticação no Supabase e vínculo ativo com a loja. Os dados operacionais são salvos em PostgreSQL.

## Funcionalidades

- Clientes com nome e telefone obrigatórios na interface, pesquisa e exportação.
- Nomes de clientes/produtos e material salvos em caixa alta, inclusive no cadastro durante a venda.
- Produtos com material/variante, preço definido ou pendente e estoque.
- Vendas com receita de longe/perto, valores, CPF, CEP, nascimento e detalhes.
- Movimentações financeiras, recebimentos e relatórios por período.
- Usuários com nome completo e acesso por e-mail/senha.
- Logo da empresa e identidade visual em azul e verde.

| Perfil | Acesso |
|---|---|
| Administrador | Todos os menus e gestão de qualquer perfil |
| Gerencial | Todos os menus; cadastra e gerencia somente Equipe |
| Equipe | Clientes, Produtos e Vendas |

## Documentação do projeto

Consulte [Documentação técnica e operacional](docs/PROJETO.md):

1. Arquitetura e arquivos da implementação.
2. Banco de dados e campos de receita.
3. Autenticação, permissões e cadastro de usuários.
4. Manual de operação.
5. Configuração, publicação e manutenção.
6. Importações, validação e limites atuais.

## Prévia local

Na pasta do código, com Node.js instalado:

```sh
node preview.cjs
```

Abra `http://127.0.0.1:4173`. A pasta `dist` contém os arquivos publicados, sem compilação de frontend. O SDK do Supabase está fixado em `@supabase/supabase-js@2.49.8` e precisa de internet.

A configuração pública contém somente URL do projeto e chave publishable. Chaves administrativas ficam no ambiente do servidor.

Este repositório contém o código atual do aplicativo, SQLs e documentação. Atualizar o GitHub não faz deploy nem aplica alterações no banco.
