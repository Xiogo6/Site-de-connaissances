-- Generated from knowledge-base.json
-- Source file: C:/Users/kevin/OneDrive/Bureau/Site de connaissance/knowledge-base.json
-- Output date: 2026-03-29T16:17:48.878Z

begin;

insert into public.app_settings (id)
values (true)
on conflict (id) do nothing;

insert into public.notes (
  slug,
  title,
  type,
  content_md,
  metadata,
  is_favorite,
  review_streak,
  last_reviewed_at,
  next_review_at,
  created_at,
  updated_at
)
values
(
  'memoire-active',
  'Memoire active',
  'concept',
  '# Memoire active

La memoire active est l''espace mental qui maintient des informations pendant quelques secondes pour raisonner.

- Elle est limitee en capacite.
- Elle est soutenue par l''attention.
- Elle influence directement [[Revision active]] et [[Charge cognitive]].

Boucle phonologique : maintien verbal temporaire.
Calepin visuo-spatial : maintien des images et positions.
Administrateur central : coordination de l''attention.',
  '{}'::jsonb,
  true,
  2,
  '2026-03-22T19:00:00.000Z',
  '2026-03-23T10:00:00.000Z',
  '2026-03-23T08:00:00.000Z',
  '2026-03-23T08:00:00.000Z'
),
(
  'revision-active',
  'Revision active',
  'procedure',
  '# Revision active

La revision active consiste a recuperer une information sans la relire tout de suite.

- C''est plus efficace qu''une simple relecture passive.
- Les quiz sont une excellente forme de revision active.
- Cette pratique renforce [[Memoire active]] et la consolidation.

Recuperation : effort de rappel qui renforce la trace.
Feedback : correction qui stabilise la bonne reponse.',
  '{}'::jsonb,
  true,
  1,
  '2026-03-22T18:30:00.000Z',
  '2026-03-23T08:00:00.000Z',
  '2026-03-23T08:10:00.000Z',
  '2026-03-23T08:10:00.000Z'
),
(
  'charge-cognitive',
  'Charge cognitive',
  'concept',
  '# Charge cognitive

La charge cognitive correspond a la quantite d''effort mental necessaire pour traiter une information.

- Une interface claire en reduit le cout.
- Une structure trop dense nuit a [[Memoire active]].
- Les liens explicites facilitent la navigation conceptuelle.

Charge intrinsique : difficulte propre au sujet.
Charge extrinseque : difficulte creee par la presentation.',
  '{}'::jsonb,
  false,
  0,
  null,
  '2026-03-23T07:00:00.000Z',
  '2026-03-23T08:20:00.000Z',
  '2026-03-23T08:20:00.000Z'
),
(
  'systeme-personnel',
  'Systeme personnel',
  'hub',
  '# Systeme personnel

Un systeme de connaissance personnel doit respecter la facon dont vous pensez, pas l''inverse.

- Une page doit representer une idee distincte.
- Les liens doivent montrer les influences, dependances et contrastes.
- Le graphe permet de voir la forme globale de la pensee.

Architecture de pensee : organisation personnelle des concepts.
Backlink : page qui cite la page actuelle.',
  '{}'::jsonb,
  true,
  3,
  '2026-03-22T17:00:00.000Z',
  '2026-03-26T17:00:00.000Z',
  '2026-03-23T08:30:00.000Z',
  '2026-03-23T08:30:00.000Z'
)
on conflict (slug) do update
set
  title = excluded.title,
  type = excluded.type,
  content_md = excluded.content_md,
  metadata = excluded.metadata,
  is_favorite = excluded.is_favorite,
  review_streak = excluded.review_streak,
  last_reviewed_at = excluded.last_reviewed_at,
  next_review_at = excluded.next_review_at,
  created_at = excluded.created_at,
  updated_at = excluded.updated_at;

insert into public.tags (
  name,
  slug
)
values
(
  'apprentissage',
  'apprentissage'
),
(
  'clarte',
  'clarte'
),
(
  'cognition',
  'cognition'
),
(
  'conception',
  'conception'
),
(
  'memoire',
  'memoire'
),
(
  'meta',
  'meta'
),
(
  'organisation',
  'organisation'
),
(
  'quiz',
  'quiz'
)
on conflict (slug) do update
set
  name = excluded.name;

delete from public.note_links;
delete from public.note_tags;

insert into public.note_tags (note_id, tag_id)
select n.id, t.id
from public.notes n
join public.tags t on t.slug = 'cognition'
where n.slug = 'memoire-active'
on conflict (note_id, tag_id) do nothing;

insert into public.note_tags (note_id, tag_id)
select n.id, t.id
from public.notes n
join public.tags t on t.slug = 'memoire'
where n.slug = 'memoire-active'
on conflict (note_id, tag_id) do nothing;

insert into public.note_tags (note_id, tag_id)
select n.id, t.id
from public.notes n
join public.tags t on t.slug = 'apprentissage'
where n.slug = 'memoire-active'
on conflict (note_id, tag_id) do nothing;

insert into public.note_tags (note_id, tag_id)
select n.id, t.id
from public.notes n
join public.tags t on t.slug = 'memoire'
where n.slug = 'revision-active'
on conflict (note_id, tag_id) do nothing;

insert into public.note_tags (note_id, tag_id)
select n.id, t.id
from public.notes n
join public.tags t on t.slug = 'apprentissage'
where n.slug = 'revision-active'
on conflict (note_id, tag_id) do nothing;

insert into public.note_tags (note_id, tag_id)
select n.id, t.id
from public.notes n
join public.tags t on t.slug = 'quiz'
where n.slug = 'revision-active'
on conflict (note_id, tag_id) do nothing;

insert into public.note_tags (note_id, tag_id)
select n.id, t.id
from public.notes n
join public.tags t on t.slug = 'cognition'
where n.slug = 'charge-cognitive'
on conflict (note_id, tag_id) do nothing;

insert into public.note_tags (note_id, tag_id)
select n.id, t.id
from public.notes n
join public.tags t on t.slug = 'conception'
where n.slug = 'charge-cognitive'
on conflict (note_id, tag_id) do nothing;

insert into public.note_tags (note_id, tag_id)
select n.id, t.id
from public.notes n
join public.tags t on t.slug = 'clarte'
where n.slug = 'charge-cognitive'
on conflict (note_id, tag_id) do nothing;

insert into public.note_tags (note_id, tag_id)
select n.id, t.id
from public.notes n
join public.tags t on t.slug = 'organisation'
where n.slug = 'systeme-personnel'
on conflict (note_id, tag_id) do nothing;

insert into public.note_tags (note_id, tag_id)
select n.id, t.id
from public.notes n
join public.tags t on t.slug = 'meta'
where n.slug = 'systeme-personnel'
on conflict (note_id, tag_id) do nothing;

insert into public.note_tags (note_id, tag_id)
select n.id, t.id
from public.notes n
join public.tags t on t.slug = 'clarte'
where n.slug = 'systeme-personnel'
on conflict (note_id, tag_id) do nothing;

insert into public.note_links (source_note_id, target_note_id, target_title_raw)
select source_note.id, target_note.id, 'Revision active'
from public.notes source_note
left join public.notes target_note on lower(target_note.title) = lower('Revision active')
where source_note.slug = 'memoire-active';

insert into public.note_links (source_note_id, target_note_id, target_title_raw)
select source_note.id, target_note.id, 'Charge cognitive'
from public.notes source_note
left join public.notes target_note on lower(target_note.title) = lower('Charge cognitive')
where source_note.slug = 'memoire-active';

insert into public.note_links (source_note_id, target_note_id, target_title_raw)
select source_note.id, target_note.id, 'Memoire active'
from public.notes source_note
left join public.notes target_note on lower(target_note.title) = lower('Memoire active')
where source_note.slug = 'revision-active';

insert into public.note_links (source_note_id, target_note_id, target_title_raw)
select source_note.id, target_note.id, 'Memoire active'
from public.notes source_note
left join public.notes target_note on lower(target_note.title) = lower('Memoire active')
where source_note.slug = 'charge-cognitive';

commit;
