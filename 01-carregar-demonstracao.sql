-- RG Recruit: dados 100% ficticios para demonstracao comercial.
-- Este arquivo altera o D1 indicado pelo comando Wrangler. Confira --remote antes de executar.
-- Não altera contas administrativas nem registros que nao tenham marcadores [DEMO RG].
-- Vagas criadas como DRAFT para nao aparecerem no portal publico.

WITH vagas(title, area, country, city, description, requirements, skills,
           required_skills, languages, qualifications, min_years_experience, status) AS (
  VALUES
    ('[DEMO RG] Desossa - Valencia', 'Desossa', 'Espanha', 'Valencia',
     'DEMONSTRACAO - Vaga ficticia. Nunca anunciar como contratacao real.',
     'Desossa; experiencia com Culatra e Serra do peito; minimo de 4 anos.',
     '["Aparar carne"]', '["Culatra","Serra do peito"]',
     '["Espanhol"]', '["HACCP"]', 4, 'draft'),
    ('[DEMO RG] Abate - Portugal', 'Abate', 'Portugal', 'Lisboa',
     'DEMONSTRACAO - Segunda vaga ficticia para comprovar cadastro unico.',
     'Atividades de abate e preparacao de carnes.',
     '["Sangria"]', '[]', '["Portugues"]', '[]', 2, 'draft')
)
INSERT INTO jobs(title, area, country, city, description, requirements, skills,
                 required_skills, languages, qualifications, min_years_experience, status)
SELECT v.title, v.area, v.country, v.city, v.description, v.requirements,
       v.skills, v.required_skills, v.languages, v.qualifications,
       v.min_years_experience, v.status
FROM vagas v
WHERE NOT EXISTS (SELECT 1 FROM jobs j WHERE j.title = v.title);

-- Numeros +1 202 555 0101-0105: serie de exemplo, nao contatos reais.
WITH pessoas(name, phone, country, city, areas, years_experience,
             experiences, skills, languages, qualifications, willing_to_relocate) AS (
  VALUES
    ('[DEMO RG] Aline', '+12025550101', 'Espanha', 'Valencia', '["Desossa"]', 6,
     '[{"area":"Desossa","years":6,"skills":["Culatra","Serra do peito","Aparar carne"]}]',
     '["Culatra","Serra do peito","Aparar carne"]', '["Espanhol"]', '["HACCP"]', 0),
    ('[DEMO RG] Bruno', '+12025550102', 'Portugal', 'Porto', '["Desossa"]', 2,
     '[{"area":"Desossa","years":2,"skills":["Culatra","Serra do peito"]}]',
     '["Culatra","Serra do peito"]', '["Espanhol"]', '[]', 1),
    ('[DEMO RG] Carla', '+12025550103', 'Espanha', 'Madrid', '["Desossa"]', 5,
     '[{"area":"Desossa","years":5,"skills":["Culatra","Aparar carne"]}]',
     '["Culatra","Aparar carne"]', '[]', '[]', 0),
    ('[DEMO RG] Elisa', '+12025550104', 'Portugal', 'Braga', '["Desossa"]', 1,
     '[{"area":"Desossa","years":1,"skills":[]}]',
     '[]', '[]', '[]', 0),
    ('[DEMO RG] Diego', '+12025550105', 'Espanha', 'Sevilha', '["Abate"]', 15,
     '[{"area":"Abate","years":15,"skills":["Sangria"]}]',
     '["Sangria"]', '["Espanhol"]', '[]', 0)
)
INSERT INTO candidates(name, phone, country, city, areas, years_experience,
                       experiences, skills, languages, qualifications,
                       willing_to_relocate, notes)
SELECT p.name, p.phone, p.country, p.city, p.areas, p.years_experience,
       p.experiences, p.skills, p.languages, p.qualifications,
       p.willing_to_relocate,
       'SIMULACAO COMERCIAL: dados inteiramente ficticios. Nao contactar, nao entrevistar.'
FROM pessoas p
WHERE NOT EXISTS (SELECT 1 FROM candidates c WHERE c.phone = p.phone);

-- Quatro candidaturas na vaga Desossa. Diego se inscreveu so em Abate.
-- Aline aparece em ambas, mas permanece com apenas um perfil no banco.
WITH inscricoes(name, phone, title) AS (
  VALUES
    ('[DEMO RG] Aline', '+12025550101', '[DEMO RG] Desossa - Valencia'),
    ('[DEMO RG] Bruno', '+12025550102', '[DEMO RG] Desossa - Valencia'),
    ('[DEMO RG] Carla', '+12025550103', '[DEMO RG] Desossa - Valencia'),
    ('[DEMO RG] Elisa', '+12025550104', '[DEMO RG] Desossa - Valencia'),
    ('[DEMO RG] Diego', '+12025550105', '[DEMO RG] Abate - Portugal'),
    ('[DEMO RG] Aline', '+12025550101', '[DEMO RG] Abate - Portugal')
)
INSERT INTO applications(candidate_id, job_id)
SELECT c.id, j.id
FROM inscricoes i
JOIN candidates c ON c.phone = i.phone AND c.name = i.name
JOIN jobs j ON j.title = i.title AND j.status = 'draft'
WHERE NOT EXISTS (
  SELECT 1 FROM applications a WHERE a.candidate_id = c.id AND a.job_id = j.id
);

SELECT 'Vagas DEMO' AS indicador, COUNT(*) AS total FROM jobs WHERE title LIKE '[DEMO RG] %';
SELECT 'Candidatos DEMO' AS indicador, COUNT(*) AS total FROM candidates WHERE name LIKE '[DEMO RG] %';
SELECT 'Inscricoes DEMO' AS indicador, COUNT(*) AS total FROM applications a
 JOIN candidates c ON c.id = a.candidate_id WHERE c.name LIKE '[DEMO RG] %';
