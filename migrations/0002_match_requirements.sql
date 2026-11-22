-- Evolução incremental: preservar registros criados antes do match v1.3.
ALTER TABLE jobs ADD COLUMN required_skills TEXT NOT NULL DEFAULT '[]';
ALTER TABLE jobs ADD COLUMN qualifications TEXT NOT NULL DEFAULT '[]';

ALTER TABLE candidates ADD COLUMN experiences TEXT NOT NULL DEFAULT '[]';
ALTER TABLE candidates ADD COLUMN qualifications TEXT NOT NULL DEFAULT '[]';
