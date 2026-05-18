-- Run AFTER schema.sql, in the Supabase SQL editor.
-- Keeps RLS ON (correct/safe). Grants the API roles access to the `atlas`
-- schema and adds public READ-ONLY policies so the app (anon key) can read.
-- Writes happen with the service_role key, which bypasses RLS.
--
-- Also required (one-time, in the dashboard):
--   Settings → API → Exposed schemas → add `atlas`

grant usage on schema atlas to anon, authenticated, service_role;
grant select on all tables in schema atlas to anon, authenticated;
grant all on all tables in schema atlas to service_role;
grant usage, select on all sequences in schema atlas to service_role;

-- Enable RLS + a read-only anon/authenticated policy on every atlas table.
do $$
declare t text;
begin
  for t in
    select tablename from pg_tables where schemaname = 'atlas'
  loop
    execute format('alter table atlas.%I enable row level security;', t);
    execute format('drop policy if exists public_read on atlas.%I;', t);
    execute format(
      'create policy public_read on atlas.%I for select to anon, authenticated using (true);', t);
  end loop;
end $$;
