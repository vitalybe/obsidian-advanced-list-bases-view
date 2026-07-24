// Pure reads/computation over tag data. Never writes frontmatter - see
// tagWrites.ts for that. Every function here is a plain function of its
// arguments (plus, for the `read*` helpers, the metadata cache) so it is safe
// to call from a `$derived.by`.
import type { App, TFile } from "obsidian";
import {
  LIST_TAGS_HIDDEN_PROPERTY,
  LIST_TAGS_ONLY_SHOW_PROPERTY,
  LIST_TAGS_PROPERTY,
  TAGS_PROPERTY,
  UNTAGGED_TOKEN,
  UNTAGGED_LABEL,
  type ListTagState,
  type TagCloudItem,
  type TagFilters,
  type TagState,
} from "./tagTypes";

// Shared by normalizeTagInput/tagKey: trim -> strip ONE leading `#` -> trim
// -> collapse internal whitespace runs to a single space. Case is left alone
// here; tagKey lowercases on top of this.
function normalizeCore(raw: string): string {
  return String(raw)
    .trim()
    .replace(/^#/, "")
    .trim()
    .replace(/\s+/g, " ");
}

export function normalizeTagInput(raw: string): string | null {
  const value = normalizeCore(raw);
  return value.length === 0 ? null : value;
}

// Case-insensitive identity for a tag name. `Music` and `music` share a key.
export function tagKey(name: string): string {
  return normalizeCore(name).toLocaleLowerCase();
}

export function sameTag(a: string, b: string): boolean {
  return tagKey(a) === tagKey(b);
}

export function hasTag(list: readonly string[], name: string): boolean {
  return list.some((t) => sameTag(t, name));
}

// Accepts a scalar as a one-element list (the live vault has `md_tags: music`
// scalars). Drops nulls, dedupes by tagKey (first occurrence wins), and
// PRESERVES source order - callers that want a sorted view (e.g. the tag
// cloud) sort themselves; this function never reorders.
export function normalizeTagList(raw: unknown): string[] {
  let items: unknown[];
  if (raw == null) {
    items = [];
  } else if (Array.isArray(raw)) {
    items = raw;
  } else {
    items = [raw];
  }

  const result: string[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    if (item == null) continue;
    const normalized = normalizeTagInput(String(item));
    if (normalized === null) continue;
    const key = tagKey(normalized);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(normalized);
  }
  return result;
}

const INVALID_TAG_CHARS_RE = /[,#[\]"'\n]/;

// Rejects: length < 2 after normalization; a leading `-`; any of
// `, # [ ] " ' \n` (YAML/Obsidian hazards); and anything whose tagKey equals
// UNTAGGED_TOKEN - the sentinel must never land in a note.
export function isValidTagName(raw: string): boolean {
  const normalized = normalizeTagInput(raw);
  if (normalized === null) return false;
  if (normalized.length < 2) return false;
  if (normalized.startsWith("-")) return false;
  if (INVALID_TAG_CHARS_RE.test(normalized)) return false;
  if (tagKey(normalized) === UNTAGGED_TOKEN) return false;
  return true;
}

export function findExistingTag(
  pool: readonly string[],
  query: string,
): string | undefined {
  const key = tagKey(query);
  return pool.find((t) => tagKey(t) === key);
}

// Single choke point for "which note holds the list config", matching
// today's `app.workspace.activeEditor?.file` behavior used throughout
// targetView.svelte.
export function resolveListFile(app: App): TFile | null {
  return app.workspace.activeEditor?.file ?? null;
}

// Reads live metadata-cache frontmatter, NOT entry.getValue - entry.getValue
// returns a stale snapshot from the last Bases query and does not refresh
// after processFrontMatter. This is the single most important contract in
// the whole tag feature.
export function readEntryTags(app: App, file: TFile): string[] {
  const fm = app.metadataCache.getFileCache(file)?.frontmatter;
  return normalizeTagList(fm?.[TAGS_PROPERTY]);
}

export function readListTagState(
  app: App,
  file: TFile | null,
): ListTagState {
  if (!file) {
    return { vocabulary: [], filters: { include: [], exclude: [] } };
  }
  const fm = app.metadataCache.getFileCache(file)?.frontmatter;
  const vocabulary = normalizeTagList(fm?.[LIST_TAGS_PROPERTY]);
  const include = normalizeTagList(fm?.[LIST_TAGS_ONLY_SHOW_PROPERTY]);
  const exclude = normalizeTagList(fm?.[LIST_TAGS_HIDDEN_PROPERTY]);
  return { vocabulary, filters: { include, exclude } };
}

export function tagStateOf(tag: string, filters: TagFilters): TagState {
  if (hasTag(filters.include, tag)) return "include";
  if (hasTag(filters.exclude, tag)) return "exclude";
  return "neutral";
}

// Frozen matching semantics - see targetView.svelte's `visibleEntryData` for
// how this replaces the old `hasTagsProperty`-guarded filter. Untagged notes
// now hide under an active include filter unless Untagged is itself
// included; that is the intended bug fix (previously untagged notes bypassed
// filtering entirely).
export function matchesTagFilters(
  tags: string[],
  filters: TagFilters,
): boolean {
  const isUntagged = tags.length === 0;
  if (filters.include.length > 0) {
    const hit =
      tags.some((t) => hasTag(filters.include, t)) ||
      (isUntagged && hasTag(filters.include, UNTAGGED_TOKEN));
    if (!hit) return false; // include is OR across tags
  }
  if (filters.exclude.length > 0) {
    if (tags.some((t) => hasTag(filters.exclude, t))) return false; // exclude wins over include
    if (isUntagged && hasTag(filters.exclude, UNTAGGED_TOKEN)) return false;
  }
  return true;
}

export function countActiveTagFilters(filters: TagFilters): number {
  return filters.include.length + filters.exclude.length;
}

export function describeTagFilters(filters: TagFilters): string {
  const count = countActiveTagFilters(filters);
  if (count === 0) return "";
  return `${count} tag filter${count === 1 ? "" : "s"} active`;
}

// Union of `vocabulary` and all tags actually present (undeclared tags are
// visible - a current bug being fixed). Sorted by count desc, then
// localeCompare. Zero-count vocabulary tags are INCLUDED with count: 0. The
// Untagged item is pinned LAST regardless of count, and is included only
// when its count > 0 or it is currently filtered.
export function buildTagCloud(
  vocabulary: string[],
  entryTagLists: string[][],
  filters: TagFilters,
): TagCloudItem[] {
  // key -> canonical display name: vocabulary's casing wins, else first-seen
  // scanning entries in order. This stops the vocabulary forking into
  // Work/work/WORK.
  const displayByKey = new Map<string, string>();
  for (const tag of vocabulary) {
    const key = tagKey(tag);
    if (!displayByKey.has(key)) displayByKey.set(key, tag);
  }

  const counts = new Map<string, number>();
  for (const key of displayByKey.keys()) counts.set(key, 0);

  let untaggedCount = 0;
  for (const tags of entryTagLists) {
    if (tags.length === 0) {
      untaggedCount++;
      continue;
    }
    for (const tag of tags) {
      const key = tagKey(tag);
      if (!displayByKey.has(key)) displayByKey.set(key, tag);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }

  const items: TagCloudItem[] = [...displayByKey.entries()].map(
    ([key, label]) => ({
      name: label,
      label,
      isUntagged: false,
      count: counts.get(key) ?? 0,
      state: tagStateOf(label, filters),
      inVocabulary: hasTag(vocabulary, label),
    }),
  );

  items.sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));

  const untaggedState = tagStateOf(UNTAGGED_TOKEN, filters);
  if (untaggedCount > 0 || untaggedState !== "neutral") {
    items.push({
      name: UNTAGGED_TOKEN,
      label: UNTAGGED_LABEL,
      isUntagged: true,
      count: untaggedCount,
      state: untaggedState,
      inVocabulary: false,
    });
  }

  return items;
}
