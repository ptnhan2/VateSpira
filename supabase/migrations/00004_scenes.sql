-- VateSpira: Scenes table (concrete events within beats, 1:N)
-- Run: supabase db push hoặc supabase migration up
-- Each beat can have multiple scenes; scenes hold title+summary (no prose — UF-4).

-- === Scenes (events within a beat) ===
create table if not exists scenes (
    id uuid primary key default gen_random_uuid(),
    novel_id uuid references novels(id) on delete cascade not null,
    beat_id uuid references beats(id) on delete cascade not null,
    scene_number int not null,
    title text not null,
    summary text,
    status text default 'empty',
    sort_order int,
    created_at timestamptz default now(),
    updated_at timestamptz default now(),
    unique (novel_id, beat_id, scene_number)
);

alter table scenes enable row level security;

create policy "users own scenes" on scenes for all
    using (exists (select 1 from novels where novels.id = scenes.novel_id and novels.user_id = auth.uid()));

-- Auto-update updated_at on row update
create or replace function update_scenes_updated_at()
returns trigger as $$
begin
    new.updated_at = now();
    return new;
end;
$$ language plpgsql;

create trigger scenes_set_updated_at before update on scenes
for each row execute function update_scenes_updated_at();
