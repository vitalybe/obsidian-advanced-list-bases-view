# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is an Obsidian plugin that adds an advanced list view to Obsidian Bases. It demonstrates the Obsidian Bases API (requires Obsidian 1.10.0+) that allows plugin developers to create new view types for displaying and filtering notes.

The plugin renders meta-bind textarea inputs for each entry in a base, allowing inline editing of the `md-title` property for each file. This was forked from a map view plugin (see `src/map-view-original.ts.txt` for reference implementation).

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
