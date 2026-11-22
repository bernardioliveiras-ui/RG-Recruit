# RG Recruit — Match por tarefas (v1.3)

## Objetivo

Dar à equipe Ramon Gama uma triagem **assistida**, transparente e rápida, especialmente para vagas frigoríficas em Portugal, Espanha e outros destinos. O algoritmo nunca toma a decisão de contratar ou recusar.

## Decisões confirmadas

- Pontuação: 25% função/área, 35% tarefas práticas, 20% tempo **na função específica**, 10% destino e mobilidade, 10% idiomas/qualificações.
- Cada vaga distingue tarefas **obrigatórias** de **desejáveis**. Faltas e desconhecidos devem ser visíveis à revisão humana, não provocam exclusão automática.
- Todos os perfis continuam acessíveis. A lista prioriza compatibilidade, indica o que está faltando e informa se houve candidatura à vaga.
- Cadastro único por WhatsApp. Dados de experiência antigos permanecem compatíveis com a base D1 existente.
- Mobile-first no candidato e no administrativo; desktop aproveita a largura disponível.
- Visual premium Ramon Gama: preto, champagne, dourado e componentes acessíveis.

## Como construir

1. **Regras explicáveis (escolhido):** pontuação local determinística + requisitos obrigatórios sinalizados para decisão humana. Baixo custo, reproduzível, sem enviar dados pessoais a IA externa.
2. IA que decide o ranking: evita esforço inicial, porém custa mais, explica pior e cria maior risco regulatório; rejeitado para a primeira versão.
3. Exclusão rígida por filtros: rápida, mas esconde perfis bons quando o cadastro está incompleto; rejeitada.

## Implementação por entregas

**v1.3 — núcleo prioritário:** cadastro de tarefas obrigatórias, anos por função, motor 25/35/20/10/10, feedback humano, ranking com faixas e tratamento de dados faltantes. Migração incremental `0002` sem tocar nos dados antigos. Controles responsivos.

**v1.4 — divulgação:** gerar arte de Story a partir da vaga (template editorial da marca), link rastreável e download local PNG.

**v1.5 — importação de artes:** upload privado, leitura assistida por visão/OCR, extração como *rascunho* e confirmação explícita do admin; configurar custo/limites, consentimento, retenção e isolamento de arquivos antes de habilitar IA.

## Segurança, privacidade e limites

Não pontuar gênero, idade, nacionalidade, documentos ou qualquer atributo protegido. Não assumir que dado ausente é descumprimento. Não publicar contatos ou classificação de candidatos no público. A equipe revisa antes de contatar/selecionar. Autorização para uso do banco de talentos e aviso de privacidade adequados à UE antes de abrir inscrições. Segurança forte, não promessa de proteção absoluta.

## Não objetivos desta entrega

- IA que aprova/rejeita automaticamente.
- Importação OCR em produção sem configuração de processamento de imagem.
- Autenticação sem verificação de posse do WhatsApp; os candidatos não poderão sobrescrever o perfil só digitando o mesmo número.
