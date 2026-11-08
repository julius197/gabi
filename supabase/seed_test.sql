-- NUR TESTDATEN – alle Patienten, Kürzel und Notizen sind erfunden. Keine echten Patientendaten.
-- Gabi (PhysioWorks) – Beispieldaten für Supabase: 3 Test-Patienten mit je 2 Notizen.
-- Ausführen NACH schema.sql im Supabase-Dashboard unter „SQL Editor“. Kann mehrfach laufen (idempotent).
-- Erzeugt mit: cd worker && node dev/seed_erzeugen.mjs (Quelle: demo.js) – bitte nicht von Hand ändern.

begin;

-- Test-Patienten (nur Kürzel und fiktive Beschreibung)
insert into public.patients_test (kuerzel, pseudonym) values
  ('TP-01', 'Testfall Knie rechts (fiktiv)'),
  ('TP-02', 'Testfall Schulter links (fiktiv)'),
  ('TP-03', 'Testfall LWS (fiktiv)')
on conflict (kuerzel) do nothing;

-- Je 2 Beispielnotizen (feste IDs, damit nichts doppelt angelegt wird)
insert into public.notes (id, patient_id, rohtext, strukturiert, suchtext, erstellt_am)
select '7e3c1a52-0101-4000-8000-000000000101'::uuid, id, 'Patientin kommt zur dritten Behandlung nach vorderer Kreuzbandplastik rechts. Schmerz in Ruhe bei zwei, bei Belastung bei fünf. Flexion aktiv bis 90 Grad, Extension minus 5 Grad. Leichte Schwellung am medialen Gelenkspalt. Wir haben 20 Minuten Lymphdrainage gemacht, dann Patellamobilisation und Quadrizepsaktivierung im Sitzen. Für zu Hause Quadrizeps anspannen, dreimal zehn Wiederholungen, zweimal täglich. Nächstes Mal Gangschule.',
  '{"befund":["Diagnose laut Verordnung: Z. n. vorderer Kreuzbandplastik rechts","3. Behandlung","Pat.: Schmerz NRS 2 in Ruhe, NRS 5 bei Belastung","Flexion Knie rechts aktiv bis 90°, Extension -5°","Leichte Schwellung medialer Gelenkspalt"],"massnahmen":["Manuelle Lymphdrainage, 20 min","Patellamobilisation","Quadrizepsaktivierung im Sitzen"],"verlauf":["Nächster Termin: Gangschule"],"hausaufgaben":["Quadrizeps anspannen 3 × 10 Wdh., 2 × täglich"],"unklar":[]}'::jsonb,
  'tp-01
testfall knie rechts (fiktiv)
patientin kommt zur dritten behandlung nach vorderer kreuzbandplastik rechts. schmerz in ruhe bei zwei, bei belastung bei fünf. flexion aktiv bis 90 grad, extension minus 5 grad. leichte schwellung am medialen gelenkspalt. wir haben 20 minuten lymphdrainage gemacht, dann patellamobilisation und quadrizepsaktivierung im sitzen. für zu hause quadrizeps anspannen, dreimal zehn wiederholungen, zweimal täglich. nächstes mal gangschule.
diagnose laut verordnung: z. n. vorderer kreuzbandplastik rechts
3. behandlung
pat.: schmerz nrs 2 in ruhe, nrs 5 bei belastung
flexion knie rechts aktiv bis 90°, extension -5°
leichte schwellung medialer gelenkspalt
manuelle lymphdrainage, 20 min
patellamobilisation
quadrizepsaktivierung im sitzen
nächster termin: gangschule
quadrizeps anspannen 3 × 10 wdh., 2 × täglich',
  ((now() at time zone 'Europe/Berlin')::date - 9 + time '08:30') at time zone 'Europe/Berlin'
from public.patients_test where kuerzel = 'TP-01'
on conflict (id) do nothing;

insert into public.notes (id, patient_id, rohtext, strukturiert, suchtext, erstellt_am)
select '7e3c1a52-0102-4000-8000-000000000102'::uuid, id, 'Knie rechts, fünfte Behandlung. Patientin berichtet, Treppensteigen geht besser. Flexion jetzt bis 110 Grad, Extension null. Schwellung deutlich weniger. Gangschule ohne Unterarmgehstützen, dann Beinpresse mit 30 Kilo, dreimal zwölf. Zu Hause Bridging und Wandsitzen, jeweils dreimal fünfzehn, täglich. In zwei Wochen Kontrolle beim Operateur.',
  '{"befund":["Flexion Knie rechts bis 110°, Extension 0°"],"massnahmen":["Gangschule ohne Unterarmgehstützen","Beinpresse 30 kg, 3 × 12 Wdh."],"verlauf":["Pat.: Treppensteigen geht besser","Schwellung deutlich weniger","Kontrolle beim Operateur in 2 Wochen"],"hausaufgaben":["Bridging 3 × 15 Wdh., täglich","Wandsitzen 3 × 15 (unklar), täglich"],"unklar":["„dreimal fünfzehn“ beim Wandsitzen unklar (Sekunden oder Wiederholungen)"]}'::jsonb,
  'tp-01
testfall knie rechts (fiktiv)
knie rechts, fünfte behandlung. patientin berichtet, treppensteigen geht besser. flexion jetzt bis 110 grad, extension null. schwellung deutlich weniger. gangschule ohne unterarmgehstützen, dann beinpresse mit 30 kilo, dreimal zwölf. zu hause bridging und wandsitzen, jeweils dreimal fünfzehn, täglich. in zwei wochen kontrolle beim operateur.
flexion knie rechts bis 110°, extension 0°
gangschule ohne unterarmgehstützen
beinpresse 30 kg, 3 × 12 wdh.
pat.: treppensteigen geht besser
schwellung deutlich weniger
kontrolle beim operateur in 2 wochen
bridging 3 × 15 wdh., täglich
wandsitzen 3 × 15 (unklar), täglich
„dreimal fünfzehn“ beim wandsitzen unklar (sekunden oder wiederholungen)',
  ((now() at time zone 'Europe/Berlin')::date - 2 + time '16:10') at time zone 'Europe/Berlin'
from public.patients_test where kuerzel = 'TP-01'
on conflict (id) do nothing;

insert into public.notes (id, patient_id, rohtext, strukturiert, suchtext, erstellt_am)
select '7e3c1a52-0201-4000-8000-000000000201'::uuid, id, 'Schulter links, Erstbefund. Ärztliche Diagnose Impingement-Syndrom. Patient klagt über Schmerzen beim Überkopfarbeiten, NRS sechs. Abduktion aktiv bis 100 Grad, schmerzhafter Bogen zwischen 70 und 110 Grad. Außenrotation kraftgemindert. Manuelle Therapie am Glenohumeralgelenk, 15 Minuten, danach Skapulastabilisation mit Theraband. Hausaufgabe Pendelübungen dreimal täglich.',
  '{"befund":["Diagnose laut Verordnung: Impingement-Syndrom Schulter links","Pat.: Schmerz bei Überkopfarbeit, NRS 6","Abduktion aktiv bis 100°, schmerzhafter Bogen 70–110°","Außenrotation kraftgemindert"],"massnahmen":["Manuelle Therapie Glenohumeralgelenk, 15 min","Skapulastabilisation mit Theraband"],"verlauf":["Erstbefund"],"hausaufgaben":["Pendelübungen 3 × täglich"],"unklar":[]}'::jsonb,
  'tp-02
testfall schulter links (fiktiv)
schulter links, erstbefund. ärztliche diagnose impingement-syndrom. patient klagt über schmerzen beim überkopfarbeiten, nrs sechs. abduktion aktiv bis 100 grad, schmerzhafter bogen zwischen 70 und 110 grad. außenrotation kraftgemindert. manuelle therapie am glenohumeralgelenk, 15 minuten, danach skapulastabilisation mit theraband. hausaufgabe pendelübungen dreimal täglich.
diagnose laut verordnung: impingement-syndrom schulter links
pat.: schmerz bei überkopfarbeit, nrs 6
abduktion aktiv bis 100°, schmerzhafter bogen 70–110°
außenrotation kraftgemindert
manuelle therapie glenohumeralgelenk, 15 min
skapulastabilisation mit theraband
erstbefund
pendelübungen 3 × täglich',
  ((now() at time zone 'Europe/Berlin')::date - 12 + time '10:15') at time zone 'Europe/Berlin'
from public.patients_test where kuerzel = 'TP-02'
on conflict (id) do nothing;

insert into public.notes (id, patient_id, rohtext, strukturiert, suchtext, erstellt_am)
select '7e3c1a52-0202-4000-8000-000000000202'::uuid, id, 'Schulter links. Schmerz beim Überkopfarbeiten jetzt bei vier. Abduktion bis 130 Grad. Triggerpunktbehandlung am Supraspinatus, ähm, Infraspinatus und Mobilisation. Theraband rot, Außenrotation dreimal fünfzehn. Patient soll zu Hause weiter pendeln und neu Außenrotation mit Theraband machen. Nächster Termin Kraft der Rotatorenmanschette testen.',
  '{"befund":["Abduktion bis 130°"],"massnahmen":["Triggerpunktbehandlung Supraspinatus/Infraspinatus (unklar)","Mobilisation","Außenrotation mit Theraband rot, 3 × 15 Wdh."],"verlauf":["Pat.: Schmerz bei Überkopfarbeit jetzt NRS 4","Nächster Termin: Kraft Rotatorenmanschette testen"],"hausaufgaben":["Pendelübungen weiter","Neu: Außenrotation mit Theraband"],"unklar":["„Supraspinatus, ähm, Infraspinatus“ unklar – welcher Muskel behandelt wurde"]}'::jsonb,
  'tp-02
testfall schulter links (fiktiv)
schulter links. schmerz beim überkopfarbeiten jetzt bei vier. abduktion bis 130 grad. triggerpunktbehandlung am supraspinatus, ähm, infraspinatus und mobilisation. theraband rot, außenrotation dreimal fünfzehn. patient soll zu hause weiter pendeln und neu außenrotation mit theraband machen. nächster termin kraft der rotatorenmanschette testen.
abduktion bis 130°
triggerpunktbehandlung supraspinatus/infraspinatus (unklar)
mobilisation
außenrotation mit theraband rot, 3 × 15 wdh.
pat.: schmerz bei überkopfarbeit jetzt nrs 4
nächster termin: kraft rotatorenmanschette testen
pendelübungen weiter
neu: außenrotation mit theraband
„supraspinatus, ähm, infraspinatus“ unklar – welcher muskel behandelt wurde',
  ((now() at time zone 'Europe/Berlin')::date - 5 + time '11:40') at time zone 'Europe/Berlin'
from public.patients_test where kuerzel = 'TP-02'
on conflict (id) do nothing;

insert into public.notes (id, patient_id, rohtext, strukturiert, suchtext, erstellt_am)
select '7e3c1a52-0301-4000-8000-000000000301'::uuid, id, 'Lendenwirbelsäule, Patientin mit Lumbalgie seit drei Wochen, keine Ausstrahlung ins Bein. Finger-Boden-Abstand 25 Zentimeter. Lasègue negativ beidseits. Muskulärer Hartspann paravertebral lumbal. Wärme zehn Minuten, dann Weichteiltechniken und Mobilisation der LWS in Seitlage. Hausaufgabe Katzenbuckel und Pferderücken, zehn Wiederholungen morgens und abends.',
  '{"befund":["Pat.: Lumbalgie seit 3 Wochen, keine Ausstrahlung ins Bein","Finger-Boden-Abstand 25 cm","Lasègue beidseits negativ","Muskulärer Hartspann paravertebral lumbal"],"massnahmen":["Wärme, 10 min","Weichteiltechniken","Mobilisation LWS in Seitlage"],"verlauf":[],"hausaufgaben":["Katzenbuckel/Pferderücken 10 Wdh., morgens und abends"],"unklar":[]}'::jsonb,
  'tp-03
testfall lws (fiktiv)
lendenwirbelsäule, patientin mit lumbalgie seit drei wochen, keine ausstrahlung ins bein. finger-boden-abstand 25 zentimeter. lasègue negativ beidseits. muskulärer hartspann paravertebral lumbal. wärme zehn minuten, dann weichteiltechniken und mobilisation der lws in seitlage. hausaufgabe katzenbuckel und pferderücken, zehn wiederholungen morgens und abends.
pat.: lumbalgie seit 3 wochen, keine ausstrahlung ins bein
finger-boden-abstand 25 cm
lasègue beidseits negativ
muskulärer hartspann paravertebral lumbal
wärme, 10 min
weichteiltechniken
mobilisation lws in seitlage
katzenbuckel/pferderücken 10 wdh., morgens und abends',
  ((now() at time zone 'Europe/Berlin')::date - 20 + time '09:00') at time zone 'Europe/Berlin'
from public.patients_test where kuerzel = 'TP-03'
on conflict (id) do nothing;

insert into public.notes (id, patient_id, rohtext, strukturiert, suchtext, erstellt_am)
select '7e3c1a52-0302-4000-8000-000000000302'::uuid, id, 'LWS. Patientin berichtet deutlich weniger Schmerzen, NRS zwei. Finger-Boden-Abstand jetzt zehn Zentimeter. Isg links etwas blockiert, ähm, oder rechts, muss ich nochmal schauen. Mobilisation ISG, Stabilisationsübungen für den Rumpf, Unterarmstütz dreimal zwanzig Sekunden. Zu Hause Unterarmstütz täglich ergänzen.',
  '{"befund":["ISG links oder rechts (unklar) etwas blockiert"],"massnahmen":["Mobilisation ISG","Rumpfstabilisation, Unterarmstütz 3 × 20 s"],"verlauf":["Pat.: deutlich weniger Schmerz, NRS 2","Finger-Boden-Abstand jetzt 10 cm"],"hausaufgaben":["Unterarmstütz täglich (ergänzend)"],"unklar":["Widerspruch: ISG links oder rechts blockiert","„Isg“ als „ISG“ gelesen"]}'::jsonb,
  'tp-03
testfall lws (fiktiv)
lws. patientin berichtet deutlich weniger schmerzen, nrs zwei. finger-boden-abstand jetzt zehn zentimeter. isg links etwas blockiert, ähm, oder rechts, muss ich nochmal schauen. mobilisation isg, stabilisationsübungen für den rumpf, unterarmstütz dreimal zwanzig sekunden. zu hause unterarmstütz täglich ergänzen.
isg links oder rechts (unklar) etwas blockiert
mobilisation isg
rumpfstabilisation, unterarmstütz 3 × 20 s
pat.: deutlich weniger schmerz, nrs 2
finger-boden-abstand jetzt 10 cm
unterarmstütz täglich (ergänzend)
widerspruch: isg links oder rechts blockiert
„isg“ als „isg“ gelesen',
  ((now() at time zone 'Europe/Berlin')::date - 6 + time '14:20') at time zone 'Europe/Berlin'
from public.patients_test where kuerzel = 'TP-03'
on conflict (id) do nothing;

commit;
