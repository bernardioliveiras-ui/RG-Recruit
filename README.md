# RG Recruit — Atualização visual v1.2: mapa-múndi premium

Esta atualização troca a ilustração grande do escudo RG na página inicial por um mapa-múndi estilizado, com Europa em destaque, continentes e conexões internacionais. A logo RG continua no cabeçalho. A arte é SVG incorporada ao HTML, sem dependências, bibliotecas ou serviços externos.

## Atualizar o projeto publicado na Cloudflare

**Não substitua o projeto inteiro pelo ZIP anterior.** Sua configuração atual do D1 no `wrangler.jsonc` tem um UUID real que deve ser preservado.

No repositório GitHub conectado ao Cloudflare Worker `rg-recruit`, substitua apenas:

1. `public/index.html`
2. `public/premium.css`

Opcionalmente, adicione `tests/hero-world-map.test.mjs` para manter os testes de regressão.

Depois, faça um commit no GitHub. Se o deploy automático estiver ativado, a Cloudflare publicará a alteração. Ao terminar, atualize a página sem cache (Ctrl+Shift+R).

Não mexa em `wrangler.jsonc`, `migrations`, `src`, dados de candidatos, configuração de domínio ou segredos da produção para realizar **esta atualização visual**.

## Situação técnica verificada no site em 22/11/2026

- A página principal carrega as folhas `/app.css` e `/premium.css`.
- `/api/jobs` respondeu com erro genérico; o painel administrativo mostrou "Painel indisponível".
- `/api/config` respondeu `applications_open: false` e `turnstile_site_key: ""`.

**A atualização do mapa não resolve os erros de API.** Antes de liberar candidatos, revise as migrações D1 remotas e os segredos administrativos, incluindo `SESSION_SECRET`. Mantenha `PRIVACY_READY` como `"false"` até concluir a documentação de privacidade e o Turnstile conforme o README original.

## Verificação feita no pacote de desenvolvimento

`npm test` — 60 testes aprovados, 0 falhas, Node 24. A renderização isolada do SVG foi inspecionada; o novo layout completo ainda precisa de validação em navegador móvel real após o deploy.
