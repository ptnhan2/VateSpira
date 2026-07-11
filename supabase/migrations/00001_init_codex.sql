-- VateSpira: Codex tables + RLS (multi-tenant)
-- Run: supabase db push hoặc supabase migration up

-- === Novels (root entity) ===
create table if not exists novels (
    id uuid primary key default gen_random_uuid(),
    user_id uuid references auth.users(id) on delete cascade not null,
    title text not null,
    language text default 'vi',
    pov text,
    tense text,
    technique text default 'save-the-cat',
    created_at timestamptz default now(),
    updated_at timestamptz default now()
);
alter table novels enable row level security;
create policy "users own novels" on novels for all using (user_id = auth.uid());

-- === Characters ===
create table if not exists characters (
    id uuid primary key default gen_random_uuid(),
    novel_id uuid references novels(id) on delete cascade not null,
    name text not null,
    age text,
    personality text,
    appearance text,
    arc text,
    pov text,
    color_theme text,
    portfolio_data jsonb default '{}',
    created_at timestamptz default now(),
    updated_at timestamptz default now()
);
alter table characters enable row level security;
create policy "users own characters" on characters for all
    using (exists (select 1 from novels where novels.id = characters.novel_id and novels.user_id = auth.uid()));

-- === Locations ===
create table if not exists locations (
    id uuid primary key default gen_random_uuid(),
    novel_id uuid references novels(id) on delete cascade not null,
    name text not null,
    description text,
    geography text,
    created_at timestamptz default now()
);
alter table locations enable row level security;
create policy "users own locations" on locations for all
    using (exists (select 1 from novels where novels.id = locations.novel_id and novels.user_id = auth.uid()));

-- === Timeline events ===
create table if not exists timeline_events (
    id uuid primary key default gen_random_uuid(),
    novel_id uuid references novels(id) on delete cascade not null,
    title text not null,
    date_label text,
    sort_key int,
    description text,
    character_ids uuid[] default '{}',
    created_at timestamptz default now()
);
alter table timeline_events enable row level security;
create policy "users own timeline" on timeline_events for all
    using (exists (select 1 from novels where novels.id = timeline_events.novel_id and novels.user_id = auth.uid()));

-- === Lore ===
create table if not exists lore (
    id uuid primary key default gen_random_uuid(),
    novel_id uuid references novels(id) on delete cascade not null,
    category text not null,
    title text not null,
    body text,
    created_at timestamptz default now()
);
alter table lore enable row level security;
create policy "users own lore" on lore for all
    using (exists (select 1 from novels where novels.id = lore.novel_id and novels.user_id = auth.uid()));

-- === Items ===
create table if not exists items (
    id uuid primary key default gen_random_uuid(),
    novel_id uuid references novels(id) on delete cascade not null,
    name text not null,
    description text,
    significance text,
    created_at timestamptz default now()
);
alter table items enable row level security;
create policy "users own items" on items for all
    using (exists (select 1 from novels where novels.id = items.novel_id and novels.user_id = auth.uid()));

-- === Relationships ===
create table if not exists relationships (
    id uuid primary key default gen_random_uuid(),
    novel_id uuid references novels(id) on delete cascade not null,
    from_character_id uuid references characters(id) on delete cascade not null,
    to_character_id uuid references characters(id) on delete cascade not null,
    type text not null,
    description text,
    created_at timestamptz default now()
);
alter table relationships enable row level security;
create policy "users own relationships" on relationships for all
    using (exists (select 1 from novels where novels.id = relationships.novel_id and novels.user_id = auth.uid()));

-- === Chapters (metadata only; prose in StoreBackend) ===
create table if not exists chapters (
    id uuid primary key default gen_random_uuid(),
    novel_id uuid references novels(id) on delete cascade not null,
    number int not null,
    title text,
    status text default 'draft',
    word_count int default 0,
    created_at timestamptz default now(),
    updated_at timestamptz default now()
);
alter table chapters enable row level security;
create policy "users own chapters" on chapters for all
    using (exists (select 1 from novels where novels.id = chapters.novel_id and novels.user_id = auth.uid()));

-- === Rubric evaluations (runtime eval data) ===
create table if not exists rubric_evaluations (
    id uuid primary key default gen_random_uuid(),
    novel_id uuid references novels(id) on delete cascade not null,
    thread_id text,
    rubric_id text not null,
    result text not null,
    criteria jsonb default '[]',
    explanation text,
    created_at timestamptz default now()
);
alter table rubric_evaluations enable row level security;
create policy "users own evals" on rubric_evaluations for all
    using (exists (select 1 from novels where novels.id = rubric_evaluations.novel_id and novels.user_id = auth.uid()));

-- === Offline eval runs ===
create table if not exists eval_runs (
    id uuid primary key default gen_random_uuid(),
    scenario_id text not null,
    model text not null,
    scores jsonb default '{}',
    category_scores jsonb default '{}',
    created_at timestamptz default now()
);

-- Note: LangGraph store + checkpoint tables auto-created by PostgresSaver/PostgresStore
-- when agent first runs with checkpointer=PostgresSaver(pg) / store=PostgresStore(pg).