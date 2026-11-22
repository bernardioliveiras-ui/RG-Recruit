# RG Recruit Match v1.3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entregar ranking de compatibilidade baseado em tarefas práticas e experiência na função, com revisão humana e bom uso em celular e PC.

**Architecture:** Campo novo para tarefas obrigatórias das vagas e histórico de funções dos candidatos, ambos em JSON validado e persistido em D1 por migração incremental. Pontuação pura no Worker, interface admin resumida por faixas e explicações por critério, sem filtragem definitiva de pessoas.

**Tech Stack:** Cloudflare Workers, D1 SQLite, JavaScript ESM, HTML/CSS responsivo, Node test runner.

**Spec:** `docs/superpowers/specs/2026-11-22-rg-match-v13-design.md`

## Global Constraints

- Pesos: área 25, tarefas 35, anos por função 20, localização 10, idiomas/qualificações 10.
- Sem descarte automático por requisito obrigatório ou dado em branco.
- Preservar dados e configuração D1 existentes: criar `0002` e entregar patch sem `wrangler.jsonc`.
- Sem pontuar dados pessoais protegidos.
- APIs protegidas continuam autenticadas, e campos de entrada validados em limites estritos.

## Review Focus

- Perfil antigo sem experiências por função: continua no ranking com experiência desconhecida, nunca inventada.
- Tarefa obrigatória não registrada pelo candidato: sinalizar para revisão, sem excluir.
- Valores Unicode e variações de maiúsculas/acentos: pontuação determinística e equivalente.
- Campos desconhecidos/arrays malformados: rejeição 400 sem gravar no D1.
- Telas com 320px de largura: formulários e cards não causam rolagem horizontal.

---

### Task 1: Motor explicável

**Files:** Modify `src/matching.js`; Test `tests/matching.test.mjs`.

**Interfaces:** `scoreCandidate(job, candidate)` retorna `{ score, reasons, breakdown, review_flags, missing_information, band }`, mantendo consumidores de `score/reasons/breakdown`.

- [ ] Criar testes de 25/35/20/10/10, tarefa obrigatória ausente, histórico por função, fallback legado, Unicode e bandas.
- [ ] Rodar `node --test tests/matching.test.mjs`, observar falha esperada.
- [ ] Implementar normalização, cálculo, flags e bandas sem rejeição automática.
- [ ] Rodar testes novamente e confirmar sucesso.

### Task 2: Migração e validação

**Files:** Create `migrations/0002_match_requirements.sql`; Modify `src/validation.js`, `src/repository.js`; Test `tests/validation.test.mjs`, `tests/schema.test.mjs`.

**Interfaces:** Job `required_skills:string[]`; Candidate `experiences:{area:string, years:number, skills:string[]}[]`; `validateJob`, `validateApplicant`; transparência para candidaturas legadas.

- [ ] Escrever testes de payload válido e entrada maliciosa/fora de limite.
- [ ] Confirmar falha nos testes novos.
- [ ] Persistir e decodificar dados com defaults incrementais e colunas JSON.
- [ ] Rodar todos os testes de integração de API e esquema.

### Task 3: UX de vaga e cadastro

**Files:** Modify `public/admin.js`, `public/app.js`, `public/index.html`, `public/app.css`, `public/premium.css`; Test `tests/admin-ui-contract.test.mjs`, `tests/ui-contract.test.mjs`.

**Interfaces:** Editor de vaga separa tarefas obrigatórias/desejáveis; cadastro informa função, anos na função, tarefas executadas. Ranking mostra faixas de prioridade, pendências e todas as pessoas.

- [ ] Escrever testes de contrato de campo, serialização e rótulos.
- [ ] Confirmar falha nos testes novos.
- [ ] Implementar campos, mapeamento de payload, ranking e CSS 320px–desktop.
- [ ] Rodar verificações e todos os testes.

### Task 4: Handoff e proteção da implantação

**Files:** Modify `README.md`; Create `docs/DEPLOY-V1.3.md`; Test `tests/deployment.test.mjs`.

- [ ] Escrever orientação clara de migração remota antes do deploy.
- [ ] Confirmar que o pacote de atualização **não** inclui o `wrangler.jsonc` do projeto base.
- [ ] Rodar `npm test`, `npx wrangler deploy --dry-run` se disponível, e verificar conteúdo da atualização.
- [ ] Entregar ZIP incremental e avisar que OCR/arte estão em fases seguintes.
