# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is an Obsidian plugin that adds an advanced list view to Obsidian Bases. It demonstrates the Obsidian Bases API (requires Obsidian 1.10.0+) that allows plugin developers to create new view types for displaying and filtering notes.

The plugin registers two custom Bases views: **Targets** (`src/targetView/`) and **Gym** (`src/gymView/`). The Targets view renders each base entry as a card with editable properties and a grouped "Targets" selector. This was forked from a map view plugin (see `src/map-view-original.ts.txt` for reference implementation).

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

- Original map implementation preserved in `src/map-view-original.ts.txt` for reference
- Uses Obsidian's new Bases API introduced in v1.10.0 (see API changes: https://github.com/obsidianmd/obsidian-api/commit/359ffc30309077aa45954b9203fd30e5ac3da837)
- The plugin demonstrates how to render dynamic content (meta-bind inputs) within a custom bases view
