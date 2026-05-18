-- Run AFTER schema.sql, in the Supabase SQL editor.
-- Keeps RLS ON (correct/safe). Grants the API roles access to the `atlas`
-- schema and adds public READ-ONLY policies so the app (anon key) can read.
-- Writes happen with the service_role key, which bypasses RLS.
--
-- Exposing `atlas` to the Data API is done here in SQL (no dashboard
-- needed — the "Exposed schemas" UI moved/is hard to find). This points
-- PostgREST at public + graphql_public + atlas and hot-reloads it.
alter role authenticator set pgrst.db_schemas = 'public, graphql_public, atlas';
notify pgrst, 'reload config';
notify pgrst, 'reload schema';

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
