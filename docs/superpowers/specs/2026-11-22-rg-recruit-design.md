# RG Recruit — Design da primeira versão

**Data:** 2026-11-22  
**Responsável pelo produto:** José Eduardo  
**Marca do cliente:** Ramon Gama Empresa

## Objetivo

Criar uma plataforma web de recrutamento internacional, mobile-first, para a equipe de Ramon Gama divulgar vagas por link, receber inscrições simples e aproveitar um banco de talentos acumulado para localizar candidatos compatíveis com futuras oportunidades. O foco inicial é o setor frigorífico, mas vagas podem estar em qualquer país.

## Experiência do candidato

- Site público em português com marca Ramon Gama, vagas abertas, filtros por país e área, detalhes da vaga e formulário de inscrição.
- Cadastro único contendo nome, WhatsApp com DDI, e-mail opcional, país/cidade de residência, áreas de experiência, anos de experiência, habilidades, idiomas, disponibilidade para mudança e observações opcionais.
- Uma pessoa pode se inscrever em várias vagas. O mesmo telefone normalizado evita perfis duplicados e os dados existentes não são revelados publicamente. Uma inscrição repetida **nunca sobrescreve** os dados do perfil original; a resposta pública não confirma se o telefone já constava no banco.
- Não exigir senha do candidato na versão inicial. Por segurança, alteração de cadastro e exclusão serão tratadas pela equipe após verificação de identidade; não haverá acesso público a dados de candidatos existentes.
- Consentimento explícito para tratamento de dados de candidatura e link para aviso de privacidade e canal de solicitação de exclusão. Identidade do controlador, contato de privacidade e prazo de retenção são campos que Ramon deverá revisar e preencher antes do lançamento real.

## Experiência da equipe administrativa

- Login com senha, sessão segura, administrador inicial provisionado por segredo de instalação de uso único, e criação de contas adicionais por administrador autenticado.
- Criar, editar, publicar e arquivar vagas com título, área, país, cidade, descrição, requisitos, habilidades, idiomas e experiência mínima. A origem da oportunidade é configurada por vaga, nunca inferida do telefone comercial.
- Ver banco completo de candidatos, pesquisa e filtros, detalhes, inscrições por vaga, status de triagem (`recebido`, `em_analise`, `selecionado`, `recusado`) e link direto para WhatsApp.
- Ver candidatos compatíveis com cada vaga, inclusive os que não se inscreveram nela; distinguir claramente `inscrito` de `compatível sem inscrição`.
- Excluir registros de candidatos e inscrições quando necessário; evitar expor dados pessoais em rotas públicas.

## Compatibilidade

- Pontuação determinística de 0–100, sem custo recorrente de IA. Considerar área/experiência, habilidades requisitadas, anos mínimos, idiomas e disponibilidade/localização.
- Exibir composição e razões da pontuação. Requisitos ausentes não são inventados; nenhum candidato é excluído automaticamente pelo algoritmo.
- Não usar idade, nacionalidade ou outros atributos protegidos como critério de pontuação.

## Visual e conteúdo

- Nome exibido: **Ramon Gama — Recrutamento**; produto interno: RG Recruit.
- Contatos comerciais exibidos: WhatsApp Austrália **+61 485 685 858** (da arte fornecida) e WhatsApp Espanha **+34 614 85 68 58** (adicionado expressamente por José). Ambos devem aparecer como contatos diferentes no rodapé, com links diretos; não confundí-los com dados de candidatos.
- Versão limpa do emblema `RG` e javali da referência fornecida, com fundo preto, dourado como destaque e vermelho discreto. Evitar incorporar barras, menus e informações da captura de tela no logotipo.
- Interface legível e acessível, formulários com alto contraste, boa navegação por teclado e layouts para celular e computador.
- Categorias inicialmente sugeridas a partir da arte: Abate, Desossa, Desmancha, Fumeiro, Embalamento, Produção de enchidos, Expedição e transporte. Permitir novas áreas.

## Segurança, limites e operação

- HTTPS em produção, cookies de sessão HttpOnly/Secure/SameSite, validação de entrada, SQL parametrizado, limitação de tentativas de login e checagem de origem em mutações autenticadas. Adotar headers seguros (incluindo CSP), mensagens de erro sem dados internos e Cloudflare Turnstile com verificação **no servidor** para inscrições públicas em produção; configuração de chave necessária no lançamento.
- Não prometer conformidade automática com leis de privacidade de todos os países; oferecer aviso de privacidade editável e consentimento, sendo necessária revisão do responsável antes da operação real internacional.
- Sem pagamentos, chatbot, WhatsApp API, envio de e-mails, upload de documentos, automação de mensagens ou IA generativa na V1.
- Dados persistidos no Cloudflare D1 e site/API entregues juntos por Cloudflare Workers Static Assets, com migrações e instruções `wrangler` para publicação. A publicação na conta do usuário não é parte desta entrega local.

## Abordagens consideradas

1. **Escolhida:** um Worker com Static Assets e D1. Menos projetos/configurações, deploy único, atende todos os fluxos.
2. Pages + Worker API + D1. Separa hospedagem e API, mas aumenta os pontos de configuração para um MVP pequeno.

## Aceitação

Uma pessoa encontra uma vaga, cadastra-se uma vez e se inscreve; o administrador acessa seu painel, publica outra vaga e a plataforma ordena os candidatos já cadastrados, com porcentagens explicáveis, sem expor perfis na interface pública. Testes verificam deduplicação, autorização, validação e pontuação, além de uma checagem responsiva.
