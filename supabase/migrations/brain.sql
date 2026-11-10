-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- ⚠️  NICHT AUSFÜHREN OHNE FREIGABE VON JULIUS.
-- ⚠️  ENTWURF. Die Live-Version (v2.1.2) braucht diese Tabellen nicht. Nie automatisch ausführen.
-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- Gabi Brain – Tabellen für das GEMEINSAME Brain der Praxis in Supabase (Region EU / Frankfurt).
--
-- Wozu: Heute liegt das Brain nur im Browser des Geräts (IndexedDB). Diese Tabellen sind die Vorbereitung dafür,
-- dass mehrere Geräte und Personen dasselbe Brain sehen. Der Worker nutzt sie erst mit den Schaltern
--   BRAIN_SPEICHER = "supabase"   (Routen /api/brain…, worker/src/brain_abruf.js)
--   BRAIN_QUELLE   = "supabase"   (Gabi holt den Kontext selbst aus brain_nodes)
-- Beide stehen im Code auf AUS.
--
-- Was diese Datei tut: legt NUR NEUE Tabellen an (brain_nodes, brain_edges, brain_versions, brain_gaps, brain_meta)
-- und eine kleine Funktion zum Zählen. patients_test und notes bleiben unberührt. Idempotent (kann mehrfach laufen).
--
-- KEINE Patientendaten: Im Brain steht nur Praxiswissen. Test-Patienten, Notizen und Berichte erscheinen im Brain nur
-- als abgeleitete Knoten der Oberfläche und werden hier NIE gespeichert (der Worker lehnt sie ab).
--
-- Vor dem echten Einsatz nötig (siehe README und GABI-BRAIN-LOG.md): Benutzerkonten und Rollen. Mit EINEM gemeinsamen
-- Zugangscode könnte jede Person mit dem Code das gemeinsame Brain ändern – die Vorlage dafür steht unten, auskommentiert.
--
-- Spalten wie in BRAIN-BAUPLAN.md §2, deutsch benannt wie im bestehenden Schema:
--   erstellt/geaendert → erstellt_am/geaendert_am · geloescht (Papierkorb) → geloescht_am · Nutzung → nutzung_anzahl/nutzung_zuletzt

-- ── Knoten ──────────────────────────────────────────────────────────────────────────────────────
create table if not exists public.brain_nodes (
  id              text primary key check (id ~ '^[A-Za-z0-9_-]{4,40}$'),
  art             text not null check (art in ('praxiswissen', 'regel', 'persona', 'frage', 'vorlage')),
  titel           text not null check (char_length(titel) between 2 and 120),
  inhalt          text not null default '' check (char_length(inhalt) <= 20000),
  tags            text[] not null default '{}' check (cardinality(tags) <= 12),
  status          text not null default 'entwurf' check (status in ('bestaetigt', 'entwurf', 'zu_klaeren')),
  quelle          text not null default '' check (char_length(quelle) <= 80),
  erstellt_am     timestamptz not null default now(),
  geaendert_am    timestamptz not null default now(),          -- nur bei inhaltlicher Änderung, nicht bei Nutzung
  geschuetzt      boolean not null default false,
  rev             integer not null default 1 check (rev >= 1), -- zählt bei jedem Schreiben hoch (Schutz bei zwei Geräten)
  geloescht_am    timestamptz,                                 -- Papierkorb (30 Tage); null = aktiv
  seed            text check (seed is null or seed ~ '^[A-Za-z0-9_-]{1,80}$'),  -- stabiler Schlüssel der Seed-Knoten
  nutzung_anzahl  integer not null default 0 check (nutzung_anzahl >= 0),       -- „von Gabi verwendet“
  nutzung_zuletzt timestamptz
);

-- Titel eindeutig (ohne Papierkorb) – der Worker meldet einen doppelten Titel mit einem eigenen Satz
create unique index if not exists brain_nodes_titel_eindeutig on public.brain_nodes (lower(titel)) where geloescht_am is null;
create index if not exists brain_nodes_status on public.brain_nodes (status) where geloescht_am is null;
create index if not exists brain_nodes_geaendert on public.brain_nodes (geaendert_am desc);
create index if not exists brain_nodes_tags on public.brain_nodes using gin (tags);

-- ── Kanten (nur die von Hand gesetzten; Verweise aus [[Titel]] rechnet die Oberfläche selbst) ──
-- Ohne Fremdschlüssel: Eine Kante darf auch auf einen abgeleiteten Knoten zeigen (Patient, Notiz), der hier nie liegt.
create table if not exists public.brain_edges (
  id          text primary key check (id ~ '^[A-Za-z0-9_-]{1,80}$'),
  von         text not null check (von ~ '^[A-Za-z0-9_-]{1,80}$'),
  nach        text not null check (nach ~ '^[A-Za-z0-9_-]{1,80}$'),
  art         text not null check (art in ('verweis', 'gehoert_zu', 'notiz_von', 'bericht_zu')),
  erstellt_am timestamptz not null default now()
);
create index if not exists brain_edges_von on public.brain_edges (von);
create index if not exists brain_edges_nach on public.brain_edges (nach);

-- ── Verlauf: je Knoten die letzten 20 Stände (der Stand VOR einer Änderung) ─────────────────────
create table if not exists public.brain_versions (
  knoten_id text not null references public.brain_nodes(id) on delete cascade,
  nr        integer not null check (nr >= 1),                  -- fortlaufend je Knoten, vergibt der Worker
  zeit      timestamptz not null default now(),
  grund     text not null default '' check (char_length(grund) <= 40),  -- bearbeitet | status | wiederhergestellt | import | interview | vorschlag | seed
  art       text not null,
  titel     text not null default '',
  inhalt    text not null default '',
  tags      text[] not null default '{}',
  status    text not null,
  quelle    text not null default '',
  primary key (knoten_id, nr)
);

-- ── Wissenslücken: Fragen, die Gabi nicht aus dem Brain beantworten konnte ──────────────────────
create table if not exists public.brain_gaps (
  id         text primary key check (id ~ '^[A-Za-z0-9_-]{1,80}$'),
  frage      text not null check (char_length(frage) between 1 and 300),
  schluessel text not null default '',                         -- Vergleichsform der Frage (gleiche Frage = ein Eintrag)
  erstmals   timestamptz not null default now(),
  zuletzt    timestamptz not null default now(),
  anzahl     integer not null default 1 check (anzahl >= 1),
  status     text not null default 'offen' check (status in ('offen', 'eingetragen', 'verworfen')),
  knoten     text                                              -- Kennung des Knotens, der daraus entstanden ist
);
create index if not exists brain_gaps_zuletzt on public.brain_gaps (zuletzt desc);

-- ── Einstellungen (z. B. Seed-Stand) ────────────────────────────────────────────────────────────
create table if not exists public.brain_meta (
  schluessel   text primary key check (schluessel ~ '^[A-Za-z0-9_.-]{1,60}$'),
  wert         jsonb not null,
  geaendert_am timestamptz not null default now()
);

-- ── „Von Gabi verwendet“ zählen: ein UPDATE, damit zwei Geräte gleichzeitig beide gezählt werden ─
create or replace function public.brain_nutzung_zaehlen(p_ids text[], p_zeit timestamptz default now())
returns table (id text, nutzung_anzahl integer, nutzung_zuletzt timestamptz)
language sql
security invoker
set search_path = public
as $$
  update public.brain_nodes as n
     set nutzung_anzahl = n.nutzung_anzahl + 1,
         nutzung_zuletzt = greatest(coalesce(n.nutzung_zuletzt, p_zeit), p_zeit)
   where n.id = any (p_ids)
     and n.geloescht_am is null
  returning n.id, n.nutzung_anzahl, n.nutzung_zuletzt;
$$;

-- ── Zugriff: nur über den Worker ────────────────────────────────────────────────────────────────
-- RLS an und KEINE Policy: Browser-Schlüssel (anon, authenticated) sehen und ändern nichts. Der Worker nutzt den
-- geheimen Schlüssel (service_role), der RLS umgeht – so wie bei patients_test und notes.
alter table public.brain_nodes enable row level security;
alter table public.brain_edges enable row level security;
alter table public.brain_versions enable row level security;
alter table public.brain_gaps enable row level security;
alter table public.brain_meta enable row level security;

-- Die Zähl-Funktion darf nur der Worker aufrufen (die Rollen gibt es nur in Supabase – darum mit Prüfung)
revoke all on function public.brain_nutzung_zaehlen(text[], timestamptz) from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on function public.brain_nutzung_zaehlen(text[], timestamptz) from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke all on function public.brain_nutzung_zaehlen(text[], timestamptz) from authenticated';
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function public.brain_nutzung_zaehlen(text[], timestamptz) to service_role';
  end if;
end
$$;

-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- VORLAGE FÜR SPÄTER – bleibt auskommentiert, bis es Benutzerkonten gibt (Supabase Auth) und Julius freigibt.
--
-- Rollen: Admin = Praxisinhaber (darf im Brain alles: anlegen, ändern, bestätigen, löschen, Regeln und Persona).
--         Mitarbeit = alle anderen (lesen; vorschlagen = Entwürfe anlegen und eigene Entwürfe ändern;
--                     nie bestätigen, nie löschen, nie Regeln oder Persona).
-- Solange der Worker mit dem geheimen Schlüssel arbeitet, greifen diese Policies nicht (service_role umgeht RLS) –
-- sie gelten, sobald die Oberfläche mit dem Konto der angemeldeten Person liest oder der Worker deren Sitzung weiterreicht.
-- ════════════════════════════════════════════════════════════════════════════════════════════════
--
-- create table if not exists public.brain_rollen (
--   nutzer_id uuid primary key references auth.users(id) on delete cascade,
--   rolle     text not null check (rolle in ('admin', 'mitarbeit')),
--   seit      timestamptz not null default now()
-- );
-- alter table public.brain_rollen enable row level security;
-- create policy brain_rollen_eigene on public.brain_rollen for select to authenticated using (nutzer_id = auth.uid());
--
-- -- Rolle der angemeldeten Person (security definer, damit die Policies unten sie lesen dürfen)
-- create or replace function public.brain_rolle() returns text
-- language sql stable security definer set search_path = public as $$
--   select rolle from public.brain_rollen where nutzer_id = auth.uid()
-- $$;
--
-- alter table public.brain_nodes add column if not exists erstellt_von uuid references auth.users(id);
-- alter table public.brain_nodes add column if not exists geaendert_von uuid references auth.users(id);
-- alter table public.brain_versions add column if not exists von uuid references auth.users(id);
--
-- -- Knoten lesen: alle Mitglieder der Praxis
-- create policy brain_nodes_lesen on public.brain_nodes for select to authenticated
--   using (public.brain_rolle() in ('admin', 'mitarbeit'));
-- -- Admin: alles
-- create policy brain_nodes_admin on public.brain_nodes for all to authenticated
--   using (public.brain_rolle() = 'admin') with check (public.brain_rolle() = 'admin');
-- -- Mitarbeit: vorschlagen = Entwürfe anlegen (nie bestätigt, nie Regel oder Persona) …
-- create policy brain_nodes_vorschlagen on public.brain_nodes for insert to authenticated
--   with check (public.brain_rolle() = 'mitarbeit' and erstellt_von = auth.uid()
--               and status in ('entwurf', 'zu_klaeren') and art in ('praxiswissen', 'frage', 'vorlage') and not geschuetzt);
-- -- … und eigene Entwürfe ändern, solange sie nicht bestätigt sind
-- create policy brain_nodes_eigene_entwuerfe on public.brain_nodes for update to authenticated
--   using (public.brain_rolle() = 'mitarbeit' and erstellt_von = auth.uid() and status <> 'bestaetigt' and not geschuetzt)
--   with check (status in ('entwurf', 'zu_klaeren') and art in ('praxiswissen', 'frage', 'vorlage') and not geschuetzt);
--
-- -- Kanten und Verlauf: lesen alle, schreiben nur der Admin
-- create policy brain_edges_lesen on public.brain_edges for select to authenticated using (public.brain_rolle() in ('admin', 'mitarbeit'));
-- create policy brain_edges_admin on public.brain_edges for all to authenticated using (public.brain_rolle() = 'admin') with check (public.brain_rolle() = 'admin');
-- create policy brain_versions_lesen on public.brain_versions for select to authenticated using (public.brain_rolle() in ('admin', 'mitarbeit'));
-- create policy brain_versions_admin on public.brain_versions for all to authenticated using (public.brain_rolle() = 'admin') with check (public.brain_rolle() = 'admin');
--
-- -- Wissenslücken: lesen und melden alle, erledigen oder verwerfen nur der Admin
-- create policy brain_gaps_lesen on public.brain_gaps for select to authenticated using (public.brain_rolle() in ('admin', 'mitarbeit'));
-- create policy brain_gaps_melden on public.brain_gaps for insert to authenticated with check (public.brain_rolle() in ('admin', 'mitarbeit') and status = 'offen');
-- create policy brain_gaps_admin on public.brain_gaps for all to authenticated using (public.brain_rolle() = 'admin') with check (public.brain_rolle() = 'admin');
--
-- -- Einstellungen: nur der Admin
-- create policy brain_meta_admin on public.brain_meta for all to authenticated using (public.brain_rolle() = 'admin') with check (public.brain_rolle() = 'admin');

-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- RÜCKWEG (macht alles aus dieser Datei rückgängig – löscht das gemeinsame Brain! Nur von Hand, nach Freigabe):
--   drop function if exists public.brain_nutzung_zaehlen(text[], timestamptz);
--   drop table if exists public.brain_versions, public.brain_edges, public.brain_gaps, public.brain_meta, public.brain_nodes;
-- ════════════════════════════════════════════════════════════════════════════════════════════════
