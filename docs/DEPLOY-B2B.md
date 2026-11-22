# Atualização RG Recruit — anunciantes, pagamentos e parceiros

Este pacote atualiza o **mesmo Cloudflare Worker e o mesmo banco D1**. Não migra para Hostinger e não conecta à API da Nickel. O recebimento é conferido manualmente por Ramon; **nenhuma cobrança bancária é executada pelo site**. A candidatura continua gratuita.

## Antes de começar (importante)

- Trabalhe na pasta atual `RG-Recruit` já ligada ao GitHub, usando **Node 24** e os comandos `.cmd` no PowerShell.
- Copie os arquivos deste pacote **por cima dos arquivos do projeto** mantendo a estrutura de pastas. **Não substitua** seu `wrangler.jsonc` configurado, `.dev.vars`, `.git` nem quaisquer segredos. Não apague o banco D1 nem crie um novo.
- O pacote contém `migrations/0003_commercial.sql`. **Ela deve ser aplicada antes de publicar o Worker novo.** Se já foi aplicada anteriormente, não tente reexecutar o SQL manualmente.
- `PRIVACY_READY` deve permanecer como `"false"` enquanto o aviso de privacidade não estiver juridicamente concluído. Isso permite demonstrar vagas e parceiros, mas **impede candidaturas públicas**.
- Se já houver anúncios/candidatos reais, faça a atualização em período de menor tráfego, combine com a equipe e guarde o backup com acesso restrito: ele pode conter dados pessoais.

## 1. Conferir conta e backup do banco real

No PowerShell, dentro de `RG-Recruit`, execute **uma linha por vez**:

```powershell
npx.cmd wrangler whoami
npx.cmd wrangler d1 time-travel info DB
npx.cmd wrangler d1 export DB --remote --output "$env:USERPROFILE\Downloads\backup-rg-recruit-antes-b2b.sql"
npx.cmd wrangler d1 migrations list DB --remote
```

Guarde o **bookmark** do segundo comando e o arquivo `.sql` fora da pasta do projeto e fora do GitHub. Confira se a pasta `Downloads` existe no seu Windows antes da exportação. Confira se o UUID do binding `DB` em `wrangler.jsonc` é o mesmo do banco `rg-recruit` já utilizado pelo Worker. Idealmente, a lista mostrará **apenas `0003_commercial.sql`**. Se aparecerem `0001` ou `0002`, **pare**: pode ser o banco errado ou migrações não registradas.

## 2. Migração segura e publicação

Depois de conferir o backup:

```powershell
npx.cmd wrangler d1 migrations apply DB --remote
npm.cmd test
npm.cmd run deploy -- --dry-run
npm.cmd run deploy
```

Os 88 testes automatizados desta atualização foram executados localmente. O dry-run e o deploy real exigem as dependências de desenvolvimento instaladas; se necessário, rode `npm.cmd install` antes. **Não confirme no Wrangler nenhuma mudança de `database_id`, `SESSION_SECRET`, `TURNSTILE_SECRET_KEY` ou hostname sem conferi-la.** A Cloudflare informa que a implantação pode substituir variáveis editadas no painel com as variáveis do Wrangler.

Após o deploy, faça uma atualização forçada da página (`Ctrl+F5`). Se o visual não mudar, confira se a implantação ativa usa o mesmo Worker e se o GitHub recebeu os arquivos novos.

## 3. Verificar sem abrir candidatos ao público

1. Abra `https://rg-recruit.bernardioliveiras.workers.dev/#admin` e entre com seu login **já existente**. Não repita a configuração inicial da conta.
2. Confira no menu **Empresas**, **Pagamentos**, **Parceiros**, **Vagas** e **Compatibilidade**.
3. Em **Empresas**, cadastre um anunciante fictício *claramente identificado como TESTE*. Em **Vagas**, crie uma vaga rascunho.
4. Em **Pagamentos**, escolha a empresa e a vaga, informe um valor em euros e o número de dias. A nova cobrança ficará **pendente** e a vaga não aparecerá no público.
5. **Atenção:** clicar em **Confirmar recebimento e ativar** marca a cobrança como paga e publica o anúncio no site real. Para testar sem pagamento verdadeiro, use um **ambiente separado**, nunca uma aprovação fictícia em produção.
6. Em **Parceiros**, crie/edite categorias e parceiros; links públicos devem usar `https://`. Confirme em `/#parceiros` que só os parceiros ativos aparecem.
7. Abra `/api/partners`: deve devolver JSON com a lista pública sem telefone ou e-mail internos. Abra `/api/config`: `applications_open` deve continuar `false`. Confira se `/api/admin/companies` sem login devolve `401`.
8. Revise os anúncios antigos e *de demonstração* em **Vagas**. Os existentes antes desta migração, se não possuírem contrato, **continuam publicados como legados** para não causar remoção inesperada. Arquive-os manualmente quando apropriado.

## Como Ramon opera o comercial

1. Ramon cadastra a **empresa** e a **vaga rascunho**.
2. Define **valor em EUR** e **prazo de 1 a 365 dias** em **Pagamentos**.
3. Após conferir a entrada em uma conta adequada ao negócio, marca o pagamento como recebido no painel.
4. A vaga passa a aparecer no portal até o vencimento. **Ao expirar, o servidor deixa de listá-la automaticamente**. Não depende de uma tarefa agendada.
5. Uma renovação pendente não estende a exibição; após confirmada, soma o novo período ao fim da contratação paga anterior, ou começa imediatamente se já venceu.
6. Candidatos não pagam; a equipe continua com o ranking de match e revisão humana. Parceiros e categorias podem ser alterados sem editar código.

**Limitações desta versão:** sem checkout online, débito, cobrança automática, faturas, integração Nickel, login de empresas ou hospedagem Hostinger. Dados fiscais e de registro empresarial **não são anunciados publicamente sem comprovação**. Não há garantia absoluta contra ataques; use contas individuais, senhas fortes, Turnstile e revisões periódicas. A aprovação manual não é prova bancária de pagamento, apenas o registro da conferência feita pelo administrador.

## Recuperação

Em caso de erro grave, **não reverta o Worker antigo contra o banco novo às cegas**. O banco pode receber dados novos após a migração. Primeiro pause as operações comerciais, registre a situação e use o bookmark/backup para planejar a recuperação. Restaurar por Time Travel sobrescreve dados do banco e exige decisão consciente sobre alterações feitas depois do backup.

Docs oficiais: [Migrações D1](https://developers.cloudflare.com/d1/reference/migrations/), [Time Travel / backup](https://developers.cloudflare.com/d1/reference/time-travel/), [Wrangler deploy](https://developers.cloudflare.com/workers/wrangler/commands/workers/).
