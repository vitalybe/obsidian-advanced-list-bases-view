// Frozen prop interfaces for the tag components. Wave 1 agents import these
// and may NOT change the `$props()` destructure lines in the .svelte files -
// add fields here first if a component needs more.
import type { App, BasesEntry, TFile } from "obsidian";
import type { TagFilters } from "./tagTypes";

export interface TagCloudProps {
  app: App;
  listFile: TFile | null;
  vocabulary: string[];
  entryTagLists: string[][];
  filters: TagFilters;
  onannounce: (msg: string) => void;
}

export interface EntryTagsProps {
  app: App;
  entry: BasesEntry;
  listFile: TFile | null;
  tags: string[];
  vocabulary: string[];
  onannounce: (msg: string) => void;
}

// Rendered by EntryTags when its "+" trigger is activated. Self-sufficient:
// it writes both the entry's md_tags and (for brand-new tags) the list's
// vocabulary itself, so it needs no onpick callback - only onclose.
export interface TagPickerProps {
  app: App;
  file: TFile;
  listFile: TFile | null;
  vocabulary: string[];
  currentTags: string[];
  anchorEl: HTMLElement | null;
  onclose: () => void;
  onannounce: (msg: string) => void;
}
