-- VateSpira: Beats table (Save the Cat 15 beat slots per novel)
-- Run: supabase db push hoặc supabase migration up

-- === Beats (Save the Cat plot skeleton) ===
create table if not exists beats (
    id uuid primary key default gen_random_uuid(),
    novel_id uuid references novels(id) on delete cascade not null,
    beat_number int not null check (beat_number between 1 and 15),
    beat_name text not null,
    content text,
    status text default 'empty',
    created_at timestamptz default now(),
    updated_at timestamptz default now(),
    unique (novel_id, beat_number)
);

alter table beats enable row level security;

create policy "users own beats" on beats for all
    using (exists (select 1 from novels where novels.id = beats.novel_id and novels.user_id = auth.uid()));

-- Auto-update updated_at on row update
create or replace function update_beats_updated_at()
returns trigger as $$
begin
    new.updated_at = now();
    return new;
end;
$$ language plpgsql;

create trigger beats_set_updated_at before update on beats
for each row execute function update_beats_updated_at();
