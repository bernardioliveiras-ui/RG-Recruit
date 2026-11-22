# RG Recruit v1.3 — atualização segura no Cloudflare

Esta é uma **atualização parcial** para um projeto já publicado. Ela mantém os dados existentes e não fornece um novo UUID de banco.

## Antes de atualizar

1. Confirme que o repositório GitHub utilizado pelo Worker possui seu `wrangler.jsonc` **com o UUID real do banco `rg-recruit`**. **Não** substitua esse arquivo por exemplos de pacotes antigos com `00000000-0000-0000-0000-000000000000`.
2. Preserve as senhas, configurações do Worker e dados em produção. Faça uma cópia de segurança D1/Time Travel do banco antes da migração, caso sua política de retenção exija.
3. Copie os arquivos deste ZIP nas mesmas pastas do projeto do GitHub; mantenha todos os outros arquivos intactos, inclusive `wrangler.jsonc` e `migrations/0001_initial.sql`.
4. Tenha acesso ao terminal do projeto e à mesma conta Cloudflare que hospeda `rg-recruit`.

## Ordem correta

Na pasta do projeto com o **UUID real**, execute:

```sh
npm install
npm test
npx wrangler whoami
npx wrangler d1 migrations list DB --remote
npx wrangler d1 migrations apply DB --remote
```

A etapa `migrations apply` deve executar a nova migração `0002_match_requirements.sql`. Se `0001_initial.sql` também aparecer como pendente e o banco **já tiver tabelas e dados**, pare antes de confirmar: é sinal de que o histórico de migrações do banco precisa ser conciliado. Não apague ou recrie o banco para resolver isso.

Somente depois da migração, faça commit/push no repositório que dispara o deploy da Cloudflare ou execute `npm run deploy` na pasta correta.

**Importante:** o novo Worker consulta colunas criadas pela migração `0002`. Publicar código antes de migrar provocará erro 500 na listagem de vagas e no painel. A Cloudflare confirma que o comando `d1 migrations apply` aplica apenas migrações pendentes e mantém backup automático.

## Como testar depois

1. Abra `https://rg-recruit.bernardioliveiras.workers.dev/api/jobs`: deve retornar JSON com `jobs`, não erro 500.
2. Entre em `/#admin`. Se o painel indicar “Acesso administrativo indisponível”, confira se o segredo `SESSION_SECRET` de 32+ caracteres foi configurado **no Worker correto**. O token de instalação `ADMIN_SETUP_TOKEN` também é necessário para criar a primeira conta, antes de removê-lo.
3. Crie uma vaga fictícia de “Desossa” com tarefa **obrigatória** “Culatra”, tarefa **desejável** “Serra do peito” e quatro anos de experiência na função.
4. Inscreva uma pessoa fictícia com duas funções diferentes, informando tarefas e anos em cada uma. O ranking deve destacar a função correspondente, não aproveitar anos de uma função não relacionada.
5. Abra a tela de compatibilidade da vaga: aparecem os grupos **Mais compatíveis**, **Revisar** e **Outros perfis**. Pessoas com dados incompletos continuam visíveis; requisitos obrigatórios não causam reprovação automática.
6. Confira a página em um celular pequeno e em um computador. Antes de testes de candidatura real, o aviso de privacidade aprovado, o Turnstile e `PRIVACY_READY=true` são indispensáveis.

## O que fica para as próximas versões

- **v1.4:** gerar artes premium para redes sociais a partir da vaga e baixar imagem com link.
- **v1.5:** importar artes existentes; OCR/visão propõe rascunho, e a equipe revisa antes de publicar. O upload e o processamento devem ter limite, armazenamento privado e política de retenção.

O match v1.3 usa regras explicáveis, sem chamar serviços de IA com dados de candidatos. A equipe é responsável por selecionar, contatar e entrevistar. Nenhuma aplicação web é garantida 100% imune a ataques; mantenha segredos, revisões e atualizações de segurança em dia.

Referências: [D1 — migrações](https://developers.cloudflare.com/d1/reference/migrations/), [Comandos D1](https://developers.cloudflare.com/d1/wrangler-commands/) e [Secrets Workers](https://developers.cloudflare.com/workers/configuration/secrets/).
