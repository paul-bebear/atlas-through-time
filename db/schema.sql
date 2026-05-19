-- Atlas Through Time — unified historical dataset
-- Postgres / Supabase. Principle: AGGREGATE, never interpret. Disputed facts
-- are stored as multiple rows distinguished by `perspective`, each with its
-- own source + confidence. The viz shows all sides; it never picks one.
--
-- Apply:  psql "$DATABASE_URL" -f db/schema.sql
-- (Idempotent: safe to re-run; drops & recreates the atlas schema.)

drop schema if exists atlas cascade;
create schema atlas;
set search_path = atlas, public;

-- THREAD: the continuity of a people / nation. The narrative spine.
-- Franks -> Kingdom of France -> France is ONE thread.
create table thread (
  id            bigint generated always as identity primary key,
  slug          text unique not null,
  display_name  text not null,
  region        text,                 -- continent / curation bucket (EU first)
  notes         text,
  source        text not null default 'wikidata',
  confidence    real not null default 0.7,
  method        text not null default 'auto',
  updated_at    timestamptz not null default now()
);

-- POLITY: a concrete governing entity bounded in time.
-- "Kingdom of France 987-1792", "French First Republic 1792-1804".
create table polity (
  id              bigint generated always as identity primary key,
  wikidata_qid    text unique,
  canonical_name  text not null,
  type            text,               -- kingdom / republic / empire / ...
  start_year      integer,
  start_precision text default 'year',-- year | decade | century | circa
  end_year        integer,
  end_precision   text default 'year',
  lat             double precision,
  lng             double precision,
  notes           text,
  source          text not null default 'wikidata',
  confidence      real not null default 0.7,
  method          text not null default 'auto',
  updated_at      timestamptz not null default now()
);

-- Every name a polity is known by, incl. source-dataset spellings, other
-- languages, historical forms. This is what unifies "France" with
-- "Kingdom of France" and lets historical-basemaps strings resolve.
create table polity_name (
  id          bigint generated always as identity primary key,
  polity_id   bigint not null references polity(id) on delete cascade,
  name        text not null,
  lang        text default 'en',
  kind        text default 'alias',   -- official | common | alias | historical | exonym
  valid_from  integer,
  valid_to    integer,
  source      text not null default 'wikidata',
  confidence  real not null default 0.7
);

-- THREAD <-> POLITY, many-to-many. The Commonwealth attaches to BOTH the
-- Poland thread and the Lithuania thread, with a role + year span.
create table thread_polity (
  thread_id   bigint not null references thread(id) on delete cascade,
  polity_id   bigint not null references polity(id) on delete cascade,
  role        text not null default 'core', -- core | constituent | shared | predecessor | successor
  from_year   integer,
  to_year     integer,
  source      text not null default 'wikidata',
  confidence  real not null default 0.7,
  primary key (thread_id, polity_id, role)
);

-- One generic typed graph for ALL relations. Adding religion-influence,
-- ideology-lineage or etymology later = a new `dimension` value, no DDL.
--   dimension: succession | descent | religion | ideology | etymology | ...
--   subject_type/object_type: 'polity' | 'thread'
create table relation (
  id            bigint generated always as identity primary key,
  subject_type  text not null,
  subject_id    bigint not null,
  object_type   text not null,
  object_id     bigint not null,
  dimension     text not null,
  type          text not null,        -- continues_as | renamed_to | split_into | merged_from | descends_from | gave_rise_to | ...
  year          integer,
  direction     text default 'directed',
  source        text not null default 'wikidata',
  confidence    real not null default 0.7,
  method        text not null default 'auto'
);

-- Period-keyed attributes. Disputed facts = multiple rows, same
-- subject/key/period, different `perspective` + source. We store all.
create table fact (
  id            bigint generated always as identity primary key,
  subject_type  text not null,        -- 'polity' | 'thread'
  subject_id    bigint not null,
  key           text not null,        -- government | leader | capital | population | flag | ...
  value         text,
  value_num     double precision,
  from_year     integer,
  to_year       integer,
  perspective   text,                 -- null = undisputed; else e.g. 'claimed_by:US'
  source        text not null default 'wikidata',
  confidence    real not null default 0.7,
  method        text not null default 'auto',
  updated_at    timestamptz not null default now()
);

-- Territory over time. GeoJSON in jsonb now; PostGIS optional later
-- (add a geometry(MultiPolygon,4326) column + GIST index when needed).
-- Disputed borders = overlapping rows distinguished by `perspective`.
--
-- ⚠️ LICENSING GUARDRAIL: only PERMISSIVELY-licensed geometry (PD / CC0 /
-- CC BY) may ever be loaded here — this table is part of the redistributable,
-- monetised API. historical-basemaps (GPL-3.0) is DISPLAY-ONLY (client-side
-- draw) and must NEVER be inserted into this table or served by the API.
-- Awaiting a permissive replacement before territory is populated.
create table territory (
  id          bigint generated always as identity primary key,
  polity_id   bigint not null references polity(id) on delete cascade,
  valid_from  integer,
  valid_to    integer,
  perspective text,                   -- null | de_facto | claimed_by:X
  geometry    jsonb,
  geom_source text not null default 'historical-basemaps',
  simplified  boolean default false,
  source      text not null default 'historical-basemaps',
  confidence  real not null default 0.6
);

-- Isolates the fuzzy "source dataset string -> polity" reconciliation so
-- the mess never leaks into the model. (e.g. hist-basemaps NAME -> polity)
create table name_resolution (
  id              bigint generated always as identity primary key,
  source_dataset  text not null,
  source_string   text not null,
  polity_id       bigint references polity(id) on delete set null,
  confidence      real not null default 0.5,
  method          text not null default 'auto',
  unique (source_dataset, source_string)
);

create table event (
  id            bigint generated always as identity primary key,
  wikidata_qid  text unique,
  title         text not null,
  lat           double precision,
  lng           double precision,
  start_year    integer,
  end_year      integer,
  category      text,
  wiki_title    text,
  source        text not null default 'wikidata',
  confidence    real not null default 0.7
);

create table event_polity (
  event_id   bigint not null references event(id) on delete cascade,
  polity_id  bigint not null references polity(id) on delete cascade,
  role       text not null default 'participant',
  primary key (event_id, polity_id, role)
);

-- External sources for any row (Wikipedia, Britannica, primary, ...).
create table reference (
  id            bigint generated always as identity primary key,
  subject_type  text not null,        -- polity | thread | fact | event
  subject_id    bigint not null,
  kind          text not null,        -- wikipedia | britannica | primary | dataset
  url           text not null,
  title         text,
  source        text not null default 'wikidata'
);

-- Indexes
create index on polity (wikidata_qid);
create index on polity (start_year, end_year);
create index on polity_name (lower(name));
create index on polity_name (polity_id);
create index on thread_polity (polity_id);
create index on relation (subject_type, subject_id);
create index on relation (object_type, object_id);
create index on relation (dimension);
create index on fact (subject_type, subject_id);
create index on fact (key);
create index on territory (polity_id, valid_from, valid_to);
create index on name_resolution (source_string);
create index on event (start_year, end_year);

-- Helper: a polity is active at a year if the year falls in its span.
create or replace function polity_active_at(p polity, y integer)
returns boolean language sql immutable as $$
  select y >= coalesce(p.start_year, -100000)
     and y <= coalesce(p.end_year,  100000);
$$;

-- Extinct vs extant civilisation counter at a given year, with descendants
-- reachable via the generic relation graph (dimension = 'descent').
create or replace function civilisation_counts(y integer)
returns table (extant bigint, extinct bigint) language sql stable as $$
  with active as (
    select distinct tp.thread_id
    from thread_polity tp
    join polity p on p.id = tp.polity_id
    where polity_active_at(p, y)
  )
  select
    (select count(*) from active),
    (select count(*) from thread t
       where not exists (select 1 from active a where a.thread_id = t.id)
         and exists (select 1 from thread_polity tp join polity p on p.id = tp.polity_id
                     where tp.thread_id = t.id and coalesce(p.start_year,100000) <= y));
$$;

-- Supabase: expose read-only to the anon role (uncomment when loading).
-- alter table thread, polity, polity_name, thread_polity, relation, fact,
--   territory, name_resolution, event, event_polity, reference enable row level security;
-- (then create "allow anon select" policies per table)
