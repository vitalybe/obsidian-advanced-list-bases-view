<script lang="ts">
  import {
    MarkdownRenderer,
    TFile,
    type App,
    type BasesPropertyId,
    type BasesEntry,
    type BasesViewConfig,
    type FrontMatterCache,
    type RenderContext,
    parsePropertyId,
  } from "obsidian";
  import type { PropertyData } from "../types";
  import GroupsAndTargetsSelector from "./GroupsAndTargetsSelector.svelte";
  import { ALL_TARGETS, type DefinedTarget } from "./targetTypes";

  // Props with defaults to prevent undefined errors
  let {
    entries = [],
    properties = [],
    config = undefined,
    app,
    renderContext = undefined,
    component = undefined,
  }: {
    entries?: BasesEntry[];
    properties?: BasesPropertyId[];
    config?: BasesViewConfig;
    app: App;
    renderContext?: RenderContext;
    component?: any;
  } = $props();

  const TARGETS_PROPERTY = "md_targets";
  const TARGETS_DONE_PROPERTY = "md_targets_done";
  const IS_DONE_PROPERTY = "md_is_done";

  // Reactive data structure for entries
  let entryData = $state<
    Array<{
      entry: BasesEntry;
      baseProperties: PropertyData[];
    }>
  >([]);

  // Track active target
  let activeTarget = $state<string | undefined>(undefined);
  let activeTargetLabel = $state<string | undefined>(undefined);

  // Reactively process entries when they change
  $effect(() => {
    processEntries(entries, properties);
  });

  function debugLog(message: string, ...args: unknown[]): void {
    console.log(`[ListAdvancedView ListView.svelte] ${message}`, ...args);
  }

  async function processEntries(entries: BasesEntry[], properties: BasesPropertyId[]) {
    debugLog("processEntries");
    const processed = await Promise.all(
      entries.map(async (entry) => {
        const props = await Promise.all(properties.map(async (prop) => await processProperty(entry, prop)));
        return {
          entry,
          baseProperties: props.filter((p) => p !== null) as PropertyData[],
        };
      })
    );
    entryData = processed;

    // Update active target info
    activeTarget = getActiveFileTarget();
    activeTargetLabel = getActiveFileTargetLabel();
    debugLog("Updated activeTarget:", activeTarget, activeTargetLabel);
  }

  async function processProperty(entry: BasesEntry, prop: BasesPropertyId): Promise<PropertyData | null> {
    try {
      const value = entry.getValue(prop);
      if (!value) return null;

      const propParsed = parsePropertyId(prop);

      // Check if this is a dynamic template directive
      return {
        type: "property",
        propertyFull: prop,
        propertyName: propParsed.name,
        propertyType: propParsed.type,
        label: config?.getDisplayName(prop) || prop,
        value,
      };
    } catch (error) {
      console.error(`Error processing property ${prop}:`, error);
      return null;
    }
  }

  function renderMarkdown(element: HTMLElement, params: { content: string; filePath: string }) {
    // Render markdown when element is mounted
    if (app && component) {
      MarkdownRenderer.render(app, params.content, element, params.filePath, component);
    }

    return {
      update(newParams: { content: string; filePath: string }) {
        // Clear and re-render if content changes
        element.empty();
        if (app && component) {
          MarkdownRenderer.render(app, newParams.content, element, newParams.filePath, component);
        }
      },
      destroy() {
        // Clean up if needed
        element.empty();
      },
    };
  }

  function getActiveFileMetadata(): FrontMatterCache | undefined {
    let metadata: FrontMatterCache | undefined;

    const activeFile = app.workspace.activeEditor?.file;
    if (activeFile) {
      metadata = app.metadataCache.getFileCache(activeFile) ?? undefined;
    }

    return metadata;
  }

  function renderPropertyValue(element: HTMLElement, value: any) {
    // Render property value when element is mounted
    if (value && renderContext) {
      value.renderTo(element, renderContext);
    }

    return {
      update(newValue: any) {
        // Clear and re-render if value changes
        element.empty();
        if (newValue && renderContext) {
          newValue.renderTo(element, renderContext);
        }
      },
      destroy() {
        // Clean up if needed
        element.empty();
      },
    };
  }

  function formatTarget(target: DefinedTarget): string {
    return `${target.icon} ${target.value}`;
  }

  function getActiveFileTarget(): string | undefined {
    let target: string | undefined;

    const activeFileMetadata = getActiveFileMetadata();
    const targets = activeFileMetadata?.frontmatter?.[TARGETS_PROPERTY];
    debugLog("getActiveFileTarget", targets);
    if (targets) {
      if (Array.isArray(targets)) {
        target = targets[0];
      } else {
        target = targets;
      }
    }

    return target;
  }

  function getActiveFileTargetLabel(): string | undefined {
    const targetValue = getActiveFileTarget();
    const target = ALL_TARGETS.find((t) => t.value === targetValue);

    return target ? formatTarget(target) : undefined;
  }

  function openRedditUrl(entry: BasesEntry) {
    const redditUrl = entry.getValue("note.reddit_url");
    if (redditUrl) {
      window.open(redditUrl.toString(), "_blank");
    }
  }

  function addActiveTargetToEntry(entry: BasesEntry) {
    const activeTarget = getActiveFileTarget();
    if (!activeTarget) return;

    app.fileManager.processFrontMatter(entry.file, (frontmatter) => {
      const targets = (frontmatter[TARGETS_DONE_PROPERTY] as string[]) ?? [];
      if (!targets.includes(activeTarget)) {
        targets.push(activeTarget);
      }
      frontmatter[TARGETS_DONE_PROPERTY] = targets;
    });
  }

  function handleWatch(entry: BasesEntry) {
    addActiveTargetToEntry(entry);
    setTimeout(() => {
      openRedditUrl(entry);
    }, 100);
  }

  function handleMarkAsRead(entry: BasesEntry) {
    const activeTarget = getActiveFileTarget();
    if (!activeTarget) return;

    const isRead = isEntryMarkedAsRead(entry);

    app.fileManager.processFrontMatter(entry.file, (frontmatter) => {
      const targetsOriginal = (frontmatter[TARGETS_DONE_PROPERTY] as unknown[] | unknown) ?? [];
      const targets = Array.isArray(targetsOriginal) ? targetsOriginal : [targetsOriginal.toString()];

      if (isRead) {
        // Remove the target (mark as unread)
        const index = targets.indexOf(activeTarget);
        if (index > -1) {
          targets.splice(index, 1);
        }
      } else {
        // Add the target (mark as read)
        if (!targets.includes(activeTarget)) {
          targets.push(activeTarget);
        }
      }

      frontmatter[TARGETS_DONE_PROPERTY] = targets;
    });
  }

  function handleRemove(entry: BasesEntry) {
    const isDone = isEntryMarkedAsDone(entry);

    app.fileManager.processFrontMatter(entry.file, (frontmatter) => {
      frontmatter[IS_DONE_PROPERTY] = !isDone;
    });
  }

  function handleFilterSelect(event: Event) {
    const select = event.target as HTMLSelectElement;
    const selectedTarget = select.value;

    const activeFile = app.workspace.activeEditor?.file;
    if (!activeFile) return;

    app.fileManager.processFrontMatter(activeFile, (frontmatter) => {
      if (selectedTarget === "") {
        // Remove the property if "None" is selected
        frontmatter[TARGETS_PROPERTY] = null;
      } else {
        // Set the target as an array with the selected value
        frontmatter[TARGETS_PROPERTY] = selectedTarget;
      }
    });
  }

  function getBooleanValue(entry: BasesEntry, prop: BasesPropertyId): boolean {
    const value: { data: boolean } | undefined = entry.getValue(prop) as any;
    return value?.data ?? false;
  }

  function isEntryMarkedAsRead(entry: BasesEntry): boolean {
    const activeTarget = getActiveFileTarget();
    if (!activeTarget) return false;

    const targetsDone = entry.getValue(`note.${TARGETS_DONE_PROPERTY}`);
    if (!targetsDone) return false;

    const targetsDoneArray = Array.isArray(targetsDone) ? targetsDone : [targetsDone];
    return targetsDoneArray.some((t: any) => t.toString() === activeTarget);
  }

  function isEntryMarkedAsDone(entry: BasesEntry): boolean {
    return getBooleanValue(entry, `note.${IS_DONE_PROPERTY}`);
  }

  function getAreTargetsShown(entry: BasesEntry): boolean {
    const areTargetsEmpty = getBooleanValue(entry, "formula.fnzTargetsEmptyTargets");
    return areTargetsEmpty;
  }

  function getEntryClasses(entry: BasesEntry): string {
    return [
      getBooleanValue(entry, "formula.fnzTargetItemShouldShow") === false ? "entry-about-to-disappear" : "",
      getBooleanValue(entry, "formula.fnzTargetsEmptyTargets") ? "entry-targets-empty" : "",
    ].join(" ");
  }

  function handlePropertyChange(entry: BasesEntry, propertyName: string, newValue: string) {
    app.fileManager.processFrontMatter(entry.file, (frontmatter) => {
      frontmatter[propertyName] = newValue;
    });
  }

  function getTextAreaRowsCount(content: string): number {
    const newLines = (content.match(/\n/g) || []).length;
    const linesPerContent = content.length / 50 + 1;
    return Math.max(linesPerContent, newLines, 1);
  }
</script>

<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<div class="list-container" tabindex="0" role="region" aria-label="List view">
  <div class="target-selector">
    <label for="active-target-select">Select your target:</label>
    <select id="active-target-select" value={activeTarget || ""} onchange={handleFilterSelect}>
      <option value="">All</option>
      {#each ALL_TARGETS as target}
        <option value={target.value}>{formatTarget(target)}</option>
      {/each}
    </select>
  </div>

  {#each entryData as { entry, baseProperties: props }, index (entry.file.path)}
    <div class="entry {getEntryClasses(entry)}">
      {#each props as propData (propData.propertyFull)}
        <div class="property">
          <label class="property-label" for={`${entry.file.path}-${propData.propertyFull}`}>{propData.label}</label>
          {#if propData.propertyType === "note"}
            <textarea
              id={`${entry.file.path}-${propData.propertyFull}`}
              class="property-input"
              rows={getTextAreaRowsCount(propData.value?.toString() || "1")}
              value={propData.value?.toString() || ""}
              onblur={(e) => handlePropertyChange(entry, propData.propertyName, (e.target as HTMLTextAreaElement).value)}
            ></textarea>
          {:else}
            <span class="property-value" use:renderPropertyValue={propData.value}></span>
          {/if}
        </div>
      {/each}
      <div class="actions-container">
        {#if activeTarget}
          <button class="btn-primary" onclick={() => handleWatch(entry)}>
            Watch ({activeTargetLabel})
          </button>
          <button class="btn-regular" onclick={() => handleMarkAsRead(entry)}>
            {isEntryMarkedAsRead(entry) ? `Unmark Read (${activeTargetLabel})` : `Mark Read (${activeTargetLabel})`}
          </button>
        {/if}
        <button class="btn-regular" onclick={() => openRedditUrl(entry)}> Open </button>
        <button class="btn-destructive" onclick={() => handleRemove(entry)}>
          {isEntryMarkedAsDone(entry) ? "Restore" : "Remove"}
        </button>
      </div>
      <div class="target-controls">
        <GroupsAndTargetsSelector
          {entry}
          {app}
          propertyName="md_targets"
          label="Targets:"
          initiallyExpanded={getAreTargetsShown(entry)}
        />
        <GroupsAndTargetsSelector {entry} {app} propertyName="md_targets_done" label="Seen:" initiallyExpanded={false} />
      </div>
      {#if index < entryData.length - 1}
        <hr class="entry-separator" />
      {/if}
    </div>
  {/each}
</div>

<style>
  .list-container {
    padding: 1rem;
  }

  .list-container:focus {
    outline: none;
  }

  .target-selector {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    margin-bottom: 1.5rem;
    padding-bottom: 1rem;
    border-bottom: 1px solid var(--background-modifier-border);
  }

  .target-selector label {
    font-weight: 500;
    color: var(--text-normal);
  }

  .target-selector select {
    padding: 0.4rem 0.8rem;
    border: 1px solid var(--background-modifier-border);
    border-radius: 4px;
    background-color: var(--background-primary);
    color: var(--text-normal);
    cursor: pointer;
    font-size: 0.95rem;
  }

  .target-selector select:focus {
    outline: none;
    border-color: var(--interactive-accent);
  }

  .entry {
    margin-bottom: 0.5rem;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    padding: 0.5rem;
  }

  .entry-separator {
    margin: 1rem 0;
    border: none;
    border-top: 1px solid var(--background-modifier-border);
  }

  .entry-about-to-disappear {
    opacity: 0.5;
  }

  .entry-targets-empty {
    background-color: hsla(2, 88%, 59%, 0.2);
  }

  .property {
    display: flex;
    flex-direction: column;
    margin-bottom: 0.25rem;
    gap: 0.25rem;
  }

  .property-label {
    font-weight: bold;
    font-size: 0.9rem;
  }

  .property-input {
    width: 100%;
    padding: 0.5rem;
    border: 1px solid var(--background-modifier-border);
    border-radius: 4px;
    background-color: var(--background-primary);
    color: var(--text-normal);
    font-family: var(--font-interface);
    font-size: 0.9rem;
    resize: vertical;
  }

  .property-input:focus {
    outline: none;
    border-color: var(--interactive-accent);
  }

  .error {
    color: var(--text-error);
    font-style: italic;
  }

  .actions-container {
    display: flex;
    gap: 0.5rem;
    margin-bottom: 0.75rem;
    flex-wrap: wrap;
  }

  .btn-primary,
  .btn-regular,
  .btn-destructive {
    padding: 0.4rem 0.8rem;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-size: 0.9rem;
    font-weight: 500;
    transition: opacity 0.2s;
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .btn-primary {
    background-color: var(--interactive-accent);
    color: var(--text-on-accent);
  }

  .btn-regular {
    background-color: var(--background-modifier-border);
    color: var(--text-normal);
  }

  .btn-destructive {
    background-color: var(--text-error);
    color: var(--text-on-accent);
  }

  .target-controls {
    display: flex;
    flex-direction: row;
    gap: 0.5rem;
    align-items: start;
    flex-wrap: wrap;
  }
</style>
