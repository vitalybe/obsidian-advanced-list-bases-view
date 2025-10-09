# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is an Obsidian plugin that adds an advanced list view to Obsidian Bases. It demonstrates the Obsidian Bases API (requires Obsidian 1.10.0+) that allows plugin developers to create new view types for displaying and filtering notes.

The plugin currently implements a basic list view structure but is incomplete - the `onDataUpdated()` method in `list-view.ts:26` needs implementation to actually render content.

## Build Commands

**Development mode** (build + watch):
```bash
pnpm run dev
```
This uses `watchman-make` to watch TypeScript files and rebuild automatically.

**Production build**:
```bash
pnpm run build
```
This runs TypeScript type checking followed by esbuild bundling in production mode (minified, no sourcemaps).

**Version bump**:
```bash
pnpm run version
```
Updates manifest.json and versions.json, then stages them for commit.

## Architecture

### Plugin Registration (main.ts)
The plugin extends Obsidian's `Plugin` class and registers a custom bases view type during `onload()`:
- View type ID: `"list-advanced"`
- Display name: `"List Advanced"`
- Icon: `"lucide-scroll-text"`
- Factory function creates `ListAdvancedView` instances
- Options provided via `ListAdvancedView.getViewOptions`

### View Implementation (list-view.ts)
`ListAdvancedView` extends `BasesView` and must implement:
- `onDataUpdated()`: Called when query results change - **currently empty, needs implementation**
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

- `obsidian`: Core Obsidian API (provides `Plugin`, `BasesView`, `QueryController`, `ViewOption`)
- `maplibre-gl`: MapLibre GL JS library (v5.8.0) - suggests this may have been forked from a map view plugin

## Development Notes

The README mentions this is a "Map view for Obsidian Bases" but the code implements a list view. The `maplibre-gl` dependency and references to map functionality in the README suggest this was forked from a map plugin but is being converted to an advanced list view. The actual map functionality has not been implemented in the current codebase.
