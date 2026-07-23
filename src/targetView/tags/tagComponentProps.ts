// Prop interfaces for the tag components. Nothing typechecks `.svelte` props
// (`tsc -noEmit` skips those files entirely), so treat these as the contract:
// add a field here before widening a component's `$props()` destructure.
//
// TagPicker is deliberately absent. It declares its prop shape inline because
// it performs no writes of its own, reporting intent up to EntryTags through
// `ontoggle`/`oncreate` so every write funnels into that component's
// serialization queue.
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
