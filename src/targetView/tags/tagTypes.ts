// Frontmatter keys. The code below speaks in terms of include/exclude, but the
// KEYS on disk stay the legacy `_only_show` / `_hidden` names for back-compat
// with the user's live vault (existing notes already carry these properties).
export const TAGS_PROPERTY = "md_tags";
export const LIST_TAGS_PROPERTY = "md_list_tags";
export const LIST_TAGS_HIDDEN_PROPERTY = "md_list_tags_hidden";
export const LIST_TAGS_ONLY_SHOW_PROPERTY = "md_list_tags_only_show";

// Sentinel tag representing "no tags at all". Never written into a note's own
// md_tags list (see isValidTagName); only ever appears inside the filter
// arrays / the tag cloud.
export const UNTAGGED_TOKEN = "__untagged__";
export const UNTAGGED_LABEL = "Untagged";

export type TagState = "neutral" | "include" | "exclude";

export interface TagFilters {
  include: string[];
  exclude: string[];
}

export interface ListTagState {
  vocabulary: string[];
  filters: TagFilters;
}

export interface TagCloudItem {
  name: string; // raw key; UNTAGGED_TOKEN for the untagged pill
  label: string; // display text; UNTAGGED_LABEL for the sentinel
  isUntagged: boolean;
  count: number;
  state: TagState;
  inVocabulary: boolean;
}
