# RG Recruit — Demonstração para Ramon (somente dados fictícios)

Este pacote **não é uma atualização do site**. Serve para adicionar ao banco D1 atual:

- 2 vagas de demonstração com status **rascunho** (não aparecem no portal público);
- 5 candidatos fictícios identificados por `[DEMO RG]`;
- 6 candidaturas ligadas às duas vagas;
- a classificação na vaga **[DEMO RG] Desossa - Valencia**: 100%, 78%, 76%, 30%, 15%.

Não muda senhas, admins, migrações, código ou configurações Turnstile.
O valor `PRIVACY_READY` deve continuar como `"false"`.

## 1. Preparar o PowerShell no Windows

Descompacte o ZIP. Copie a **pasta inteira** `RG-Recruit-Demo-Ramon` para dentro da pasta já existente:

`C:\Users\hokiz\Documents\GitHub\RG-Recruit`

Abra o PowerShell nessa pasta do projeto (`RG-Recruit`) e execute:

```powershell
Get-Location
Test-Path .\wrangler.jsonc
Test-Path .\RG-Recruit-Demo-Ramon\01-carregar-demonstracao.sql
```

Os dois testes de caminho devem mostrar `True`. Se algum der `False`, confira a pasta onde descompactou antes de continuar.

## 2. Conferir o banco remoto antes de gravar

```powershell
npx.cmd wrangler whoami
npx.cmd wrangler d1 execute DB --remote --command "SELECT COUNT(*) AS candidatos_atuais FROM candidates;"
```

Confira se está na conta Cloudflare correta e no banco `rg-recruit` esperado. `--remote` **altera o banco do site em produção** nos comandos de importação e limpeza, então não prossiga se estiver apontando para outra conta.

Por segurança, considere obter um backup/registro de recuperação do D1 antes de executar uma alteração remota. Não envie arquivos de backup que contenham dados pessoais por chat nem os inclua no GitHub.

## 3. Importar os dados de demonstração

Somente depois de conferir a conta e o D1, execute **uma vez**:

```powershell
npx.cmd wrangler d1 execute DB --remote --file=.\RG-Recruit-Demo-Ramon\01-carregar-demonstracao.sql
```

Se o Wrangler pedir confirmação para modificar o D1 remoto, leia o nome do banco e confirme somente se estiver correto.

O arquivo foi feito para não duplicar registros quando executado de novo, mas não é necessário repeti-lo.

Confira os rascunhos no banco:

```powershell
npx.cmd wrangler d1 execute DB --remote --command "SELECT title, status FROM jobs WHERE title LIKE '[DEMO RG] %';"
```

Devem aparecer as duas vagas, ambas com `status` igual a `draft`.

## 4. Apresentar ao Ramon

1. Acesse **https://rg-recruit.bernardioliveiras.workers.dev/#admin** com seu login existente.
2. Atualize a página. Em **Visão geral**, haverá cinco novos perfis e seis candidaturas a mais do que antes. **Vagas publicadas** não aumenta porque as vagas de demonstração são rascunhos.
3. Em **Vagas**, procure `[DEMO RG] Desossa - Valencia`.
4. Clique em **Ver compatibilidade**. A lista deve exibir cinco perfis, inclusive Diego, que está inscrito **apenas na outra vaga**.
5. Demonstre a ordem esperada: Aline 100%, Bruno 78%, Carla 76%, Elisa 30%, Diego 15%.
6. Mostre o aviso sobre tarefa obrigatória não informada da Carla; o candidato continua acessível para revisão humana.

**Não publique os rascunhos e não tente contatar os números de exemplo.**
Os telefones usam a faixa fictícia `+1 202 555 01xx` e os registros são somente ilustrativos.

## 5. Limpar os dados depois da apresentação

O comando abaixo **apaga os registros de demonstração do D1 remoto**. Faça isso somente quando terminar de usar os dados e após conferir os nomes no painel.

```powershell
npx.cmd wrangler d1 execute DB --remote --file=.\RG-Recruit-Demo-Ramon\02-remover-demonstracao.sql
```

A limpeza exige correspondência exata de **nome e telefone** para remover perfis, e de **título e área/país** para remover vagas. Também protege vagas que tenham saído do estado de rascunho ou tenham inscrições não previstas. Se alguém alterou/usou dados de demonstração para outra finalidade, alguns registros poderão permanecer e deverão ser revisados manualmente.

Os comandos **não incluem** `wrangler deploy` nem migrações D1. Não mude `PRIVACY_READY` para `true` até concluir a política de privacidade real.

Se aparecer erro, copie somente a mensagem de erro e o nome do comando, **sem mostrar segredos, cookies ou dados pessoais reais**.
