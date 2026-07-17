-- VateSpira: Scene outline field (UF-4b scope expansion)
-- Adds `outline` column to scenes table — detailed scene outline
-- (sequential plot points + dialogue markers) for agent to read before writing prose.
-- Run: supabase db push hoặc supabase migration up

ALTER TABLE scenes ADD COLUMN IF NOT EXISTS outline text;
