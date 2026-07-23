# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is an Obsidian plugin that adds an advanced list view to Obsidian Bases. It demonstrates the Obsidian Bases API (requires Obsidian 1.10.0+) that allows plugin developers to create new view types for displaying and filtering notes.

The plugin registers two custom Bases views: **Targets** (`src/targetView/`) and **Gym** (`src/gymView/`). The Targets view renders each base entry as a card with editable properties and a grouped "Targets" selector. This was forked from a map view plugin.

## Build Commands

**Development mode** (build + watch):
```bash
pnpm run dev
```
This uses `watchman-make` to watch TypeScript files and rebuild automatically. When running in dev mode, **no need to manually build** - changes are automatically detected and rebuilt.

**Production build**:
```bash
pnpm run build
```
This runs TypeScript type checking followed by esbuild bundling in production mode (minified, no sourcemaps). Only use this for final builds; during development, `pnpm run dev` handles rebuilding automatically.

**Version bump**:
```bash
pnpm run version
```
Updates manifest.json and versions.json, then stages them for commit.

## Architecture

### Plugin Registration (main.ts)
The plugin extends Obsidian's `Plugin` class and registers a custom bases view type during `onload()`
### Main plugin hooks
- `onload()`, `onunload()`: Lifecycle hooks
- `onResize()`: Handle container resizing
- `focus()`: Focus management
- `setEphemeralState()`, `getEphemeralState()`: State persistence
- `getViewOptions()`: Static method returning available view configuration options

The view creates a container div with class `bases-advanced-list-container` for rendering content.

### Targets View (src/targetView/)

`TargetsView` (a `BasesView`) mounts the `targetView.svelte` component, which renders entries as cards. Per-card target selection lives in `GroupsAndTargetsSelector.svelte`.

- **Targets selector**: a grouped **multiselect dropdown**. Each member row has a left checkbox (active toggle) and a right eye icon (done toggle, only enabled when checked). Group headers bulk-select their members. The panel stays open for multiple picks and closes on click-outside.
- **Data model** (per-card frontmatter): `md_targets` (active values; done items remain here too) and `md_targets_done` (subset marked done).
- **Configurable roster**: groups/people are not hardcoded. `targetRoster.ts` (`TargetRoster.load`) reads them from a config note's YAML frontmatter via `vault.read` + `parseYaml`. The config note path comes from the active list note's `md_targets_source_path` frontmatter, falling back to `meta/Targets.md` (Obsidian path lookups are case-sensitive). An empty roster degrades gracefully (selector/filter show no people).
  - Config note keys: `md_targets_groups` (list of group names, or `{value,label}`) and `md_targets_people` (list of `{value, icon, groups}`).
- **Reactivity**: `targetView.svelte` loads the roster into reactive state on each data-update cycle (not a static `$derived` over the cache) and passes `groups`/`targets` to the selector; the top filter and active-target label also source from the roster.

### Tags (src/targetView/tags/)

Per-entry tagging plus a list-level tag cloud with include/exclude filtering. Rendered at two sites in `targetView.svelte`: `TagCloud.svelte` in the top filter bar, and `EntryTags.svelte` inside each card's property list.

- **Data model**: `md_tags` on each entry note holds its tags. The list note carries `md_list_tags` (the declared vocabulary), plus two filter arrays: `md_list_tags_only_show` (include filter) and `md_list_tags_hidden` (exclude filter). The code speaks of include/exclude throughout, but the frontmatter keys keep the older `_only_show`/`_hidden` names for backward compatibility with existing vaults - don't expect the property names to match the terminology used in the source.
- **Module split**: `tagTypes.ts` holds the property-name constants, the `UNTAGGED_TOKEN`/`UNTAGGED_LABEL` sentinel, and shared types (`TagFilters`, `ListTagState`, `TagCloudItem`). `tagModel.ts` is pure read/compute - normalization, `tagKey`/`sameTag`/`hasTag`, `readEntryTags`/`readListTagState`, `matchesTagFilters`, `buildTagCloud` - and never writes frontmatter. `tagWrites.ts` is the only module that calls `processFrontMatter`: `setTagState`/`clearTagFilters` for the list's filter arrays, `addEntryTag`/`removeEntryTag` for an entry's `md_tags`, `addToVocabulary` for the list's `md_list_tags`. `tagComponentProps.ts` defines frozen prop interfaces (`TagCloudProps`, `EntryTagsProps`, `TagPickerProps`) for the three components: `TagCloud.svelte` (the filter-bar cloud), `EntryTags.svelte` (a card's tag row plus its "+" add trigger), and `TagPicker.svelte` (the popover the "+" trigger opens, portaled to `<body>`). `TagPicker` is the exception to that prop contract: it declares its shape inline and performs no writes of its own, reporting intent upward through `ontoggle`/`oncreate` so every write funnels into the single serialization queue in `EntryTags`. `TagPickerProps` has no consumers.
- **Filter semantics**: include is OR across an entry's tags; exclude wins over include when both would otherwise match. An untagged entry (`md_tags` empty) hides under an active include filter unless the `Untagged` pseudo-tag is itself included, and is likewise excludable via the same pseudo-tag. `UNTAGGED_TOKEN` is a reserved sentinel string that only ever appears inside filter arrays or the tag cloud; `isValidTagName` rejects it (along with `,`, `#`, `[`, `]`, `"`, `'`, newlines, a leading `-`, and anything under 2 characters after normalization), so every writer in `tagWrites.ts` refuses to let it land in a note's own `md_tags`.
- **Case policy**: tag identity is case-insensitive, compared via `tagKey` (trim, strip a leading `#`, collapse whitespace, lowercase) and `sameTag`/`hasTag` built on top of it. Display stays case-preserving: when the vocabulary and an entry disagree on casing for the same tag, the vocabulary's casing wins as the canonical display form (`buildTagCloud`'s `displayByKey` map). Callers must never compare tag names with `list.includes(tag)` or `===` - always `hasTag`/`sameTag` - since either bypasses the case-insensitive identity and lets the same tag fork into multiple entries under different casing.
- **Writes**: every writer in `tagWrites.ts` returns the `processFrontMatter` promise as `Promise<void>`, including on its early-return guard paths, so a caller can chain unconditionally. `EntryTags.svelte` funnels all of its writes through one promise queue (`writeQueue`/`enqueue`): the picker stays open for multiple picks, so a user can fire several writes at the same file within a few hundred milliseconds, and concurrent `processFrontMatter` calls against one file clobber each other. The `.catch` on that queue is load-bearing - without it a single rejected write poisons the chain for the lifetime of the component. Creating a tag enqueues `addToVocabulary` before `addEntryTag`, so the tag is in the vocabulary before the re-render and never flashes as an orphan.
- **Reactivity**: tag state is derived from the metadata cache rather than imperatively loaded on the Bases data-update cycle like the roster and other filters. `readEntryTags`/`readListTagState` always read `app.metadataCache.getFileCache(file)?.frontmatter`, never `entry.getValue` - the latter is a stale snapshot from the last Bases query that does not refresh after `processFrontMatter` writes. `targetView.svelte` tracks a single `metaVersion` counter (`$state(0)`), bumped by one `metadataCache.on("changed")` listener (filtered to the list file and visible entry paths) plus `file-open`/`active-leaf-change` (since `resolveListFile`'s `activeEditor` read isn't itself reactive); every tag-derived value (`listTagState`, `entryTagsByPath`, and in turn `visibleEntryData`'s tag filtering) reads `metaVersion` to invalidate. The tag components receive tags as props from `targetView.svelte` and must not register their own metadata-cache listeners.
- **Styling**: shared pill styles live in the repo-root `styles.css`, not in component `<style>` blocks - Svelte scoped styles don't cross component boundaries, and a separately-imported component `.css` would end up in a `main.css` that the vault-sync step in `esbuild.config.mjs` does not copy. Every class is prefixed `alb-` (`alb-tag-`, `alb-tagcloud-`, `alb-entrytags-`, `alb-tagpicker-`) because these rules are global and Obsidian core plus themes style bare `.tag` aggressively. `styles.css` partitions the tag rules into four labeled sections: shared pill styles (frozen), tag cloud, entry tags, and tag picker.

### Build System
- **Entry point**: `src/main.ts`
- **Output**: `main.js` (bundled with esbuild)
- **Externals**: Obsidian API, Electron, CodeMirror packages marked as external
- **Target**: ES2018, CommonJS format
- TypeScript strict null checks enabled

## Key Dependencies

  - `Plugin`, `BasesView`, `QueryController`, `ViewOption`: Core base view types

## Runtime Dependencies

- **Meta-Bind plugin**: Required for the meta-bind inputs to function. The plugin uses `MarkdownRenderer` to render meta-bind code blocks, which are processed by the Meta-Bind plugin if installed.

## Development Notes

- Uses Obsidian's new Bases API introduced in v1.10.0 (see API changes: https://github.com/obsidianmd/obsidian-api/commit/359ffc30309077aa45954b9203fd30e5ac3da837)
- The plugin demonstrates how to render dynamic content (meta-bind inputs) within a custom bases view
- `pnpm run build` runs `tsc -noEmit` before bundling, but that step does not typecheck `.svelte` files - a mismatched prop name between a parent and child component is caught by nothing at build time
- `esbuild.config.mjs` syncs build artifacts into a vault plugin directory after every build (see `vaultPluginDir`). Set `OBSIDIAN_PLUGIN_DIR` to override it when building from a worktree, or a build will overwrite the live vault plugin
- `@tsconfig/svelte` sets `verbatimModuleSyntax` and `tsconfig.json` adds `isolatedModules`, so every type-only import and re-export must use `import type` / `export type`. svelte-preprocess strips types without knowing whether a given name is a value or a type, and a plain `import` of a type fails the `tsc` step
- `manifest.json` sets `isDesktopOnly: false`, so the plugin runs on Obsidian mobile. Interactive UI needs a touch path for anything hover-only, tap targets sized under `@media (pointer: coarse)`, and a 16px minimum font size on text inputs to stop iOS zooming the page on focus
