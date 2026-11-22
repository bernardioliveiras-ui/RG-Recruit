# RG Recruit — pacote completo para Cloudflare Workers + D1

Este pacote foi conferido contra o repositório `bernardioliveiras-ui/RG-Recruit` (branch `main`, 22/11/2026). Inclui o portal público com mapa-múndi dourado, painel administrativo e o match v1.3. O arquivo `wrangler.jsonc` contém o UUID real do D1 `rg-recruit`, o hostname do Turnstile e a **chave pública** do widget. Não contém senhas ou chaves privadas.

## Publicação pelo Windows PowerShell

1. **Extraia** o ZIP em uma pasta nova. Não tente enviar o próprio ZIP como código no editor online da Cloudflare.
2. Abra o PowerShell **dentro da pasta extraída que contém `package.json`**.
3. Use preferencialmente Node.js **24 ou superior**, exigido pelo projeto. Se ainda tiver Node 22, atualize antes da publicação.
4. Execute **uma linha por vez**:

```powershell
npm.cmd install
npm.cmd test
npx.cmd wrangler whoami
npx.cmd wrangler secret list --name rg-recruit
npx.cmd wrangler d1 migrations list DB --remote
```

5. Confira que a conta Cloudflare é a mesma do Worker `rg-recruit`; os segredos `SESSION_SECRET` e `TURNSTILE_SECRET_KEY` devem existir. **Não compartilhe seus valores.** O token temporário `ADMIN_SETUP_TOKEN` deve continuar removido.
6. O banco remoto já foi migrado anteriormente. A lista de migrações pendentes deve estar vazia. **Não crie outro D1 nem substitua seu UUID.**
7. Para publicar esta versão, execute:

```powershell
npm.cmd run deploy
```

8. Aguarde **Success**. Depois, em uma janela anônima ou atualizada, verifique:

   - Portal: https://rg-recruit.bernardioliveiras.workers.dev/
   - Vagas: https://rg-recruit.bernardioliveiras.workers.dev/api/jobs — deve retornar JSON com `jobs`.
   - Configuração: https://rg-recruit.bernardioliveiras.workers.dev/api/config — deve ter `turnstile_site_key` público preenchido e `applications_open: false`.
   - Administração: https://rg-recruit.bernardioliveiras.workers.dev/#admin — o login existente deve permanecer funcional.

O mapa-múndi aparece **apenas na página pública inicial**, e não na tela administrativa.

## Proteção de dados — ainda não liberar inscrições reais

`PRIVACY_READY` permanece como a string `"false"` de propósito. **Não altere para `"true"`** até que a empresa Ramon Gama confirme seus dados legais e aprove o aviso de privacidade (inclusive finalidade, prazo de retenção, direitos, contatos e transferência internacional). Verifique também a base legal para reutilizar o perfil em vagas futuras e o consentimento apropriado.

O Turnstile precisa ser testado com o hostname autorizado antes da abertura. Nenhum sistema web deve ser apresentado como totalmente imune a ataques. Guarde segredos apenas no Cloudflare, nunca neste ZIP nem no GitHub.

## Observação sobre os dados

Este pacote contém código e arquivos públicos; **não exporta nem recria** o conteúdo do banco D1. Vagas, candidatos e administradores existentes continuam no banco remoto, que deve estar vinculado ao mesmo Worker.
