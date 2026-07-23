// Every writer here is a no-op when the file is null (defensive - the frozen
// signatures below take a non-null TFile, but callers may still race a
// closed/renamed file, so we guard anyway rather than let
// processFrontMatter throw).
import type { App, TFile } from "obsidian";
import {
  LIST_TAGS_HIDDEN_PROPERTY,
  LIST_TAGS_ONLY_SHOW_PROPERTY,
  LIST_TAGS_PROPERTY,
  TAGS_PROPERTY,
  type TagState,
} from "./tagTypes";
import { hasTag, isValidTagName, normalizeTagInput, normalizeTagList, sameTag } from "./tagModel";

// Writes both filter arrays in ONE processFrontMatter pass: remove the tag
// from both, then add to at most one. A tag is never in both.
export function setTagState(
  app: App,
  listFile: TFile,
  tag: string,
  next: TagState,
): void {
  if (!listFile) return;
  const normalized = normalizeTagInput(tag);
  if (normalized === null) return;

  app.fileManager.processFrontMatter(listFile, (fm) => {
    const include = normalizeTagList(fm[LIST_TAGS_ONLY_SHOW_PROPERTY]).filter(
      (t) => !sameTag(t, normalized),
    );
    const exclude = normalizeTagList(fm[LIST_TAGS_HIDDEN_PROPERTY]).filter(
      (t) => !sameTag(t, normalized),
    );

    if (next === "include") include.push(normalized);
    else if (next === "exclude") exclude.push(normalized);

    // Transient UI state: delete the key entirely when empty, matching the
    // existing `delete frontmatter[LENGTH_FILTER_PROPERTY]` convention.
    if (include.length > 0) fm[LIST_TAGS_ONLY_SHOW_PROPERTY] = include;
    else delete fm[LIST_TAGS_ONLY_SHOW_PROPERTY];

    if (exclude.length > 0) fm[LIST_TAGS_HIDDEN_PROPERTY] = exclude;
    else delete fm[LIST_TAGS_HIDDEN_PROPERTY];
  });
}

export function clearTagFilters(app: App, listFile: TFile): void {
  if (!listFile) return;
  app.fileManager.processFrontMatter(listFile, (fm) => {
    delete fm[LIST_TAGS_ONLY_SHOW_PROPERTY];
    delete fm[LIST_TAGS_HIDDEN_PROPERTY];
  });
}

// Appends; never re-sorts. Keeps `md_tags` as `[]` when it already existed
// and stays empty (handled by removeEntryTag) - here we're only ever adding.
export function addEntryTag(app: App, file: TFile, tag: string): void {
  if (!file) return;
  const normalized = normalizeTagInput(tag);
  if (normalized === null || !isValidTagName(normalized)) return;

  app.fileManager.processFrontMatter(file, (fm) => {
    const tags = normalizeTagList(fm[TAGS_PROPERTY]);
    if (hasTag(tags, normalized)) return;
    tags.push(normalized);
    fm[TAGS_PROPERTY] = tags;
  });
}

// `md_tags` keeps `[]` when the last tag is removed - the note still "has a
// tags property" (unlike the filter keys, which get deleted when empty).
export function removeEntryTag(app: App, file: TFile, tag: string): void {
  if (!file) return;

  app.fileManager.processFrontMatter(file, (fm) => {
    const tags = normalizeTagList(fm[TAGS_PROPERTY]);
    if (!hasTag(tags, tag)) return;
    fm[TAGS_PROPERTY] = tags.filter((t) => !sameTag(t, tag));
  });
}

// Never deletes the vocabulary key, even indirectly - this function only
// ever appends.
export function addToVocabulary(app: App, listFile: TFile, tag: string): void {
  if (!listFile) return;
  const normalized = normalizeTagInput(tag);
  if (normalized === null || !isValidTagName(normalized)) return;

  app.fileManager.processFrontMatter(listFile, (fm) => {
    const vocabulary = normalizeTagList(fm[LIST_TAGS_PROPERTY]);
    if (hasTag(vocabulary, normalized)) return;
    vocabulary.push(normalized);
    fm[LIST_TAGS_PROPERTY] = vocabulary;
  });
}
