-- UF-1b: Add genre column to novels table
-- Form sends genre (fantasy/sci-fi/romance/thriller/literary/other) but
-- 00001_init_codex.sql did not include this column.
alter table novels add column if not exists genre text;
