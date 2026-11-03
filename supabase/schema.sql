-- Gabi – Testversion: Datenbank-Schema für Supabase (Region EU / Frankfurt)
-- Einmal im Supabase-Dashboard unter „SQL Editor“ ausführen. Kann mehrfach laufen (idempotent).
-- NUR TESTDATEN: Kürzel/Pseudonyme, keine Klarnamen, keine echten Patientendaten.

-- Test-Patienten: nur Kürzel (mindestens eine Ziffer, z. B. TP-01) und eine kurze fiktive Beschreibung
create table if not exists public.patients_test (
  id          uuid primary key default gen_random_uuid(),
  kuerzel     text not null unique
              check (kuerzel ~ '^[A-Z0-9-]{2,12}$' and kuerzel ~ '[0-9]'),
  pseudonym   text not null default '' check (char_length(pseudonym) <= 60),
  erstellt_am timestamptz not null default now()
);

-- Notizen: Rohtext (Transkript), strukturierte Notiz (Befund/Maßnahmen/Verlauf/Hausaufgaben/unklar)
create table if not exists public.notes (
  id           uuid primary key default gen_random_uuid(),
  patient_id   uuid not null references public.patients_test(id) on delete cascade,
  rohtext      text not null default '' check (char_length(rohtext) <= 50000),
  strukturiert jsonb not null default '{}'::jsonb,
  suchtext     text not null default '',            -- vom Worker befüllt (Kleinbuchstaben), für die Suche
  erstellt_am  timestamptz not null default now(),
  geaendert_am timestamptz
);

create index if not exists notes_patient_erstellt on public.notes (patient_id, erstellt_am desc);
create index if not exists notes_erstellt on public.notes (erstellt_am desc);

-- Zugriff nur über den Worker (geheimer Schlüssel / service_role). Browser-Schlüssel (anon) sehen nichts.
alter table public.patients_test enable row level security;
alter table public.notes enable row level security;
revoke all on table public.patients_test from anon, authenticated;
revoke all on table public.notes from anon, authenticated;
grant select, insert, update, delete on table public.patients_test to service_role;
grant select, insert, update, delete on table public.notes to service_role;

-- Ein fiktiver Test-Patient zum Ausprobieren
insert into public.patients_test (kuerzel, pseudonym)
values ('TP-01', 'Testfall Knie rechts (fiktiv)')
on conflict (kuerzel) do nothing;
