# Ramon Gama — Recrutamento

Portal de vagas em português e painel de recrutamento internacional. O mesmo Cloudflare Worker serve o conteúdo de `public/` e a API em `/api/`. O banco D1 guarda vagas, candidatos, inscrições e contas da equipe. O projeto começa sem registros de demonstração.

**Antes de divulgar o link ou receber dados reais**, complete o aviso de privacidade, valide o canal de atendimento e obtenha revisão jurídica para os países envolvidos. Com a configuração inicial, as vagas podem ser consultadas, mas o formulário e a gravação de candidaturas ficam bloqueados em produção.

## Rodar localmente

Use Node.js 24 e npm na pasta do projeto. Os testes usam `node:sqlite` e um banco em memória. O Wrangler 4.36 ou superior da série 4 é uma dependência de desenvolvimento.

```sh
npm install
npm test
npm run db:local
```

Crie `.dev.vars` na raiz, com permissão de leitura restrita à sua conta. Inclua `APP_ENV=development`, `SESSION_SECRET` e `ADMIN_SETUP_TOKEN`, cada um em uma linha `NOME=valor`. Use um gerenciador de senhas para gerar dois valores independentes, aleatórios e com ao menos 32 caracteres cada. Use valores diferentes dos de produção. O Git ignora esse arquivo.

Execute `npm run dev` e abra `http://localhost:8787`. No modo de desenvolvimento limitado ao computador local, deixe as chaves do Turnstile vazias e use apenas pessoas fictícias. A migração local usa o estado de desenvolvimento do Wrangler. A produção tem seu próprio banco e seu próprio primeiro administrador.

## Preparar a conta Cloudflare

1. Faça login no Wrangler com `npx wrangler login` e confira a conta em `npx wrangler whoami`.
2. Execute `npx wrangler d1 create rg-recruit`. Copie o UUID retornado para o campo `database_id` da entrada existente em `wrangler.jsonc`, substituindo os zeros. Preserve o binding `DB` e o diretório `migrations`. Se o Wrangler oferecer configurar o arquivo automaticamente, confira se ficou apenas uma entrada para o banco. Para localizar um banco existente, use `npx wrangler d1 list`.
3. Confira `assets.directory` (`./public`), `assets.binding` (`ASSETS`) e `run_worker_first: true`. Assim, o Worker verifica o protocolo antes de servir qualquer página ou rota da API. Na zona do domínio personalizado, ative **SSL/TLS → Edge Certificates → Always Use HTTPS** ou configure uma regra de redirecionamento HTTP para HTTPS no edge. Mantenha o limitador `APPLICATION_RATE_LIMITER` e escolha um `namespace_id` numérico em formato de texto livre na sua conta. A configuração inicial limita aproximadamente 12 envios por minuto por IP e localidade Cloudflare.
4. No painel Turnstile, crie um widget para o **hostname exato** da publicação. Registre o hostname sem esquema, caminho nem porta. Em `vars` do Wrangler, preencha `TURNSTILE_SITE_KEY` com a chave **pública** e `TURNSTILE_HOSTNAME` com esse hostname. Cadastre no Worker eventual domínio personalizado e confirme que ele usa HTTPS. Mantenha `PRIVACY_READY` como a string `"false"` durante a preparação.
5. Confira e aplique as migrações no D1 de destino. A sequência abaixo pressupõe a primeira publicação da aplicação, sem dados reais. Em atualizações, revise a migração e o procedimento de recuperação antes de aplicá-la.

```sh
npx wrangler d1 migrations list DB --remote
npm run db:remote
npm run deploy -- --dry-run
npm run deploy
```

6. Na primeira implantação, o acesso da equipe fica indisponível até receber o segredo de sessão. Grave os três segredos com entrada interativa. Gere valores separados para a sessão e a instalação, ambos aleatórios e com pelo menos 32 caracteres. O terceiro valor vem do widget Turnstile. Guarde-os no cofre da equipe.

```sh
npx wrangler secret put SESSION_SECRET
npx wrangler secret put ADMIN_SETUP_TOKEN
npx wrangler secret put TURNSTILE_SECRET_KEY
```

7. Antes de inserir credenciais, execute `curl -sSI http://SEU-HOST/` e `curl -sSI http://SEU-HOST/api/config` para cada hostname divulgado. Confira o redirecionamento 3xx para o mesmo caminho em HTTPS no cabeçalho `Location`. Confirme que `curl -si https://SEU-HOST/api/config` retorna JSON com status 200. O Worker rejeita gravações que chegam por HTTP. Somente `APP_ENV=development` com hostname de loopback permite trabalhar por HTTP.
8. No endereço HTTPS do Worker, abra `/#admin` → **Configurar primeiro acesso**. Informe o token de instalação, o e-mail da equipe e uma senha entre 12 e 256 caracteres. Entre no painel com essa conta. O banco só permite criar a primeira conta pelo fluxo de instalação. Remova o segredo de instalação com `npx wrangler secret delete ADMIN_SETUP_TOKEN` após confirmar o login. Em **Equipe**, crie contas individuais apenas para quem precisa acessar todos os perfis. Quando alguém sair da equipe, use **Remover acesso da equipe** nessa conta e confirme a remoção. O sistema encerra as sessões da pessoa. Cada administrador pode remover apenas outras contas.

Os segredos ficam fora de `wrangler.jsonc`, do código e da pasta pública. A API valida o token do Turnstile no servidor e confere o hostname e a ação `application`. O painel usa cookie de sessão com `Secure`, `HttpOnly` e `SameSite=Strict`; sair revoga a sessão no banco. A rotação do segredo de sessão encerra as sessões existentes.

## Liberar as candidaturas

- [ ] Preencher o [modelo de aviso](PRIVACY-NOTICE-TEMPLATE.md) e aplicar o texto aprovado em [public/privacidade.html](public/privacidade.html), que é o documento visível aos candidatos.
- [ ] Confirmar controlador, contato monitorado, finalidades, destinatários, países, fundamento por finalidade, transferências internacionais, prazos e rotina de exclusão. A equipe precisa executar a retenção definida no aviso.
- [ ] Conferir a autorização do banco de talentos com o assessor jurídico de cada operação. A versão atual pede uma única confirmação para candidatura e oportunidades futuras. Se a avaliação exigir escolhas separadas, adaptar o formulário e o tratamento de dados antes de abrir.
- [ ] Testar o atendimento de acesso, correção e exclusão com verificação de identidade. Em uma inscrição específica, **Retirar inscrição** preserva o perfil e as demais inscrições. Em um perfil, **Excluir cadastro** remove todas as inscrições da pessoa. A correção de dados exige intervenção da equipe responsável pelo D1.
- [ ] Remover as marcações de minuta e os campos entre colchetes do HTML, registrar a data da versão, conferir o texto de consentimento e verificar os links publicados.
- [ ] Alterar `PRIVACY_READY` para a string `"true"` em `wrangler.jsonc`. Executar `npm test`, publicar com `npm run deploy` e validar o fluxo com dados fictícios antes de divulgar. Para pausar novos envios, voltar a `"false"` e publicar novamente.

Use `npm run deploy` para cada publicação. Quando `PRIVACY_READY` está em `"true"`, o comando verifica o aviso na pasta de arquivos públicos e interrompe a publicação se o arquivo estiver ausente, vazio, com campos entre colchetes ou com a palavra “minuta”. Com `"false"`, é possível publicar a prévia com a coleta fechada. A revisão do conteúdo cabe ao responsável. Executar `wrangler deploy` diretamente ou publicar pelo painel da Cloudflare ignora essa verificação local.

## Roteiro de aceitação

1. Entre em `/#admin`. Crie e publique “Embalamento de teste” em Portugal, com a habilidade “Embalamento”. Em outra janela, filtre por Portugal e abra o link da vaga. Confirme que rascunhos ficam fora da lista.
2. Use os dados fictícios “Pessoa Exemplo”, `+1 202 555 0147`, `pessoa@example.invalid`, país de residência “Portugal”, dois anos de experiência e habilidade “Embalamento”. Leia o aviso, confirme o consentimento e envie. Em produção, conclua a verificação do widget.
3. Publique “Embalamento de teste 2” com a mesma habilidade. No seu painel de compatibilidade, verifique a pessoa como compatível sem inscrição e confira os critérios da pontuação. Candidate-se à segunda vaga com o mesmo número. Confirme no painel um perfil e duas inscrições. Uma nova candidatura preserva os dados do primeiro cadastro.
4. Altere um status de triagem, atualize a página e confira a persistência. Em uma das inscrições fictícias, use **Retirar inscrição**, confirme e verifique que o perfil e a outra inscrição continuam disponíveis. Arquive **as duas vagas de teste**. Em uma janela sem sessão, confirme que nenhuma vaga de teste segue publicada e que os dois links de detalhe deixaram de abrir as vagas. Exclua somente o perfil fictício e confira a remoção da inscrição restante. Saia e tente reabrir o banco de candidatos.
5. Em um telefone e em um computador, teste navegação por teclado, filtros, formulário, abertura do aviso, retorno do foco e painel de triagem. Confira os contatos comerciais de Espanha e Austrália no rodapé.
6. Em uma janela sem sessão, abra `/api/admin/candidates` e verifique resposta 401. Inspecione os headers da página inicial e da API, por exemplo com `curl -sSI https://SEU-HOST/` e `curl -si https://SEU-HOST/api/config`. Confira a CSP para scripts e frames do Turnstile e `Cache-Control: no-store` na raiz e nos dados da API.

## Diagnóstico de operação

| Sintoma | O que conferir |
| --- | --- |
| Candidaturas indisponíveis | Confira `PRIVACY_READY`, o hostname da barra de endereço, as duas chaves do mesmo widget e o binding do limitador. A API pública `/api/config` informa `applications_open` e a chave pública. |
| Widget não conclui | Confira o hostname no painel Turnstile, a CSP de `public/_headers` e a conexão a `challenges.cloudflare.com`. Recarregue a verificação se o token expirar. |
| Acesso administrativo indisponível | Confira a presença e o comprimento de `SESSION_SECRET`, o UUID de D1 e as migrações do ambiente correto. Solicitações de instalação também dependem de `ADMIN_SETUP_TOKEN`. |
| Muitas tentativas | Aguarde o prazo indicado pela resposta. O login limita tentativas por endereço de rede e e-mail. Redes compartilhadas também podem atingir o limite público de envios. |
| Lista vazia | No painel, confira se a vaga está publicada e se os filtros correspondem. Bancos local e remoto são independentes. |

Para investigar um incidente, registre horário, caminho sem dados pessoais, código HTTP e identificador da requisição quando disponível. Mantenha corpos de formulários, consultas com nomes, cookies, senhas e tokens fora de tickets, capturas de tela e logs.

**Limites do piloto.** A lista de candidatos traz resumos e o ranking calcula a pontuação para todo o conjunto consultado em memória. As listas de vagas, inscrições e perfis ainda não têm paginação. Antes de ampliar o piloto, use dados fictícios no volume esperado e meça o tempo, o tamanho das respostas e o uso de CPU e memória do Worker. A capacidade no ambiente Cloudflare depende dessas medições. A busca textual no D1 ignora diferenças de maiúsculas e minúsculas para letras ASCII. Para letras acentuadas, use a grafia e a caixa cadastradas, ou busque por telefone normalizado ou e-mail.

Referências da Cloudflare: [migrações D1](https://developers.cloudflare.com/d1/reference/migrations/), [Workers Static Assets](https://developers.cloudflare.com/workers/static-assets/), [headers de arquivos estáticos](https://developers.cloudflare.com/workers/static-assets/headers/), [rate limiting](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/) e [CSP do Turnstile](https://developers.cloudflare.com/turnstile/reference/content-security-policy/).
