// Group identity is a plain string (the group value). Display label may differ.
export interface GroupDef {
  value: string;
  label: string;
}

export interface DefinedTarget {
  value: string;
  icon: string;
  groups: string[];
}

export interface Roster {
  groups: GroupDef[];
  targets: DefinedTarget[];
}

// Active list note frontmatter key pointing at the roster config note.
export const TARGETS_SOURCE_PATH_PROPERTY = "md_targets_source_path";

// Fallback config note used when the source path is missing or unreadable.
export const DEFAULT_TARGETS_SOURCE_PATH = "Meta/Targets.md";

// Frontmatter keys inside the roster config note.
export const ROSTER_GROUPS_KEY = "md_targets_groups";
export const ROSTER_PEOPLE_KEY = "md_targets_people";

export const EMPTY_ROSTER: Roster = { groups: [], targets: [] };
