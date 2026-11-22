-- RG Recruit: limpeza exclusiva dos registros de DEMONSTRACAO.
-- Confira os nomes [DEMO RG] no painel antes de executar --remote.
-- Nao remove administradores, vagas reais, nem outros perfis.
-- Se uma vaga demo tiver sido publicada ou usada por candidatos reais, ela fica preservada.

DELETE FROM applications
WHERE candidate_id IN (
  SELECT id FROM candidates
  WHERE (name, phone) IN (
    ('[DEMO RG] Aline', '+12025550101'),
    ('[DEMO RG] Bruno', '+12025550102'),
    ('[DEMO RG] Carla', '+12025550103'),
    ('[DEMO RG] Elisa', '+12025550104'),
    ('[DEMO RG] Diego', '+12025550105')
  )
)
AND job_id IN (
  SELECT id FROM jobs
  WHERE (title = '[DEMO RG] Desossa - Valencia' AND area = 'Desossa' AND country = 'Espanha'
         OR title = '[DEMO RG] Abate - Portugal' AND area = 'Abate' AND country = 'Portugal')
    AND status = 'draft'
);

DELETE FROM candidates
WHERE (name, phone) IN (
    ('[DEMO RG] Aline', '+12025550101'),
    ('[DEMO RG] Bruno', '+12025550102'),
    ('[DEMO RG] Carla', '+12025550103'),
    ('[DEMO RG] Elisa', '+12025550104'),
    ('[DEMO RG] Diego', '+12025550105')
  )
  AND NOT EXISTS (SELECT 1 FROM applications a WHERE a.candidate_id = candidates.id);

DELETE FROM jobs
WHERE (title = '[DEMO RG] Desossa - Valencia' AND area = 'Desossa' AND country = 'Espanha'
       OR title = '[DEMO RG] Abate - Portugal' AND area = 'Abate' AND country = 'Portugal')
  AND status = 'draft'
  AND NOT EXISTS (SELECT 1 FROM applications a WHERE a.job_id = jobs.id);

SELECT 'Vagas DEMO restantes' AS indicador, COUNT(*) AS total FROM jobs WHERE title LIKE '[DEMO RG] %';
SELECT 'Candidatos DEMO restantes' AS indicador, COUNT(*) AS total FROM candidates WHERE name LIKE '[DEMO RG] %';
