import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const rootDir = resolve(import.meta.dirname, "..", "..");
const sourcePath = resolve(rootDir, "knowledge-base.json");
const outputPath = resolve(rootDir, "supabase", "seed.sql");

const raw = readFileSync(sourcePath, "utf8");
const sourceNotes = JSON.parse(raw);

const noteTypes = new Set(["concept", "person", "event", "folder", "hub", "procedure", "question"]);

function slugify(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function sqlString(value) {
  if (value === null || value === undefined) {
    return "null";
  }

  return `'${String(value).replace(/'/g, "''")}'`;
}

function sqlBoolean(value) {
  return value ? "true" : "false";
}

function sqlNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? String(numeric) : String(fallback);
}

function sqlJson(value) {
  return `'${JSON.stringify(value ?? {}).replace(/'/g, "''")}'::jsonb`;
}

function extractLinks(content) {
  const matches = [...String(content ?? "").matchAll(/\[\[([^[\]]+)\]\]/g)];
  const seen = new Set();

  return matches
    .map((match) => match[1].trim())
    .filter((title) => {
      const key = title.toLowerCase();
      if (!title || seen.has(key)) {
        return false;
      }

      seen.add(key);
      return true;
    });
}

const normalizedNotes = sourceNotes.map((note, index) => {
  const title = String(note?.title ?? "").trim() || `Sans titre ${index + 1}`;
  const slug = String(note?.id ?? "").trim() || slugify(title) || `note-${index + 1}`;
  const type = noteTypes.has(note?.type) ? note.type : "concept";
  const review = note?.review ?? {};
  const tags = Array.isArray(note?.tags)
    ? note.tags.map((tag) => String(tag).trim()).filter(Boolean)
    : [];

  return {
    slug,
    title,
    type,
    content: String(note?.content ?? ""),
    metadata: note?.metadata ?? {},
    isFavorite: Boolean(note?.favorite),
    reviewStreak: Number(review?.streak) || 0,
    lastReviewedAt: typeof review?.lastReviewedAt === "string" ? review.lastReviewedAt : null,
    nextReviewAt: typeof review?.nextReviewAt === "string" ? review.nextReviewAt : null,
    createdAt: typeof note?.createdAt === "string" ? note.createdAt : null,
    updatedAt: typeof note?.updatedAt === "string" ? note.updatedAt : null,
    tags,
    links: extractLinks(note?.content),
  };
});

const uniqueTags = [...new Set(normalizedNotes.flatMap((note) => note.tags))].sort((left, right) =>
  left.localeCompare(right, "fr", { sensitivity: "base" })
);

const noteRows = normalizedNotes.map(
  (note) => `(
  ${sqlString(note.slug)},
  ${sqlString(note.title)},
  ${sqlString(note.type)},
  ${sqlString(note.content)},
  ${sqlJson(note.metadata)},
  ${sqlBoolean(note.isFavorite)},
  ${sqlNumber(note.reviewStreak)},
  ${sqlString(note.lastReviewedAt)},
  ${sqlString(note.nextReviewAt)},
  ${sqlString(note.createdAt)},
  ${sqlString(note.updatedAt)}
)`
);

const tagRows = uniqueTags.map(
  (tag) => `(
  ${sqlString(tag)},
  ${sqlString(slugify(tag))}
)`
);

const noteTagStatements = normalizedNotes.flatMap((note) =>
  note.tags.map(
    (tag) => `insert into public.note_tags (note_id, tag_id)
select n.id, t.id
from public.notes n
join public.tags t on t.slug = ${sqlString(slugify(tag))}
where n.slug = ${sqlString(note.slug)}
on conflict (note_id, tag_id) do nothing;`
  )
);

const noteLinkStatements = normalizedNotes.flatMap((note) =>
  note.links.map(
    (linkedTitle) => `insert into public.note_links (source_note_id, target_note_id, target_title_raw)
select source_note.id, target_note.id, ${sqlString(linkedTitle)}
from public.notes source_note
left join public.notes target_note on lower(target_note.title) = lower(${sqlString(linkedTitle)})
where source_note.slug = ${sqlString(note.slug)};`
  )
);

const sql = `-- Generated from knowledge-base.json
-- Source file: ${sourcePath.replace(/\\/g, "/")}
-- Output date: ${new Date().toISOString()}

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
${noteRows.join(",\n")}
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
${tagRows.length ? tagRows.join(",\n") : "  ('general', 'general')"}
on conflict (slug) do update
set
  name = excluded.name;

delete from public.note_links;
delete from public.note_tags;

${noteTagStatements.join("\n\n")}

${noteLinkStatements.join("\n\n")}

commit;
`;

writeFileSync(outputPath, sql, "utf8");

console.log(`Seed SQL generated: ${outputPath}`);
