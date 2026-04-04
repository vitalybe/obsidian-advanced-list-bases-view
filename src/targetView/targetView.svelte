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
    Component,
    Value,
    ListValue,
  } from "obsidian";
  import type { PropertyData } from "../types";
  import type { Writable } from "svelte/store";
  import GroupsAndTargetsSelector from "./GroupsAndTargetsSelector.svelte";
  import EditableTextarea from "./EditableTextarea.svelte";
  import { ALL_TARGETS, type DefinedTarget } from "./targetTypes";
  import type { TargetViewStoreData } from "./targetView.ts";

  interface Props {
    targetViewStore: Writable<TargetViewStoreData>;
    config?: BasesViewConfig;
    app: App;
    renderContext: RenderContext;
    component: Component;
  }

  // Props with defaults to prevent undefined errors
  let { targetViewStore, config = undefined, app, renderContext, component }: Props = $props();

  // Subscribe to store to get reactive values
  let storeData = $derived($targetViewStore);
  let entries = $derived(storeData.entries);
  let properties = $derived(storeData.properties);

  const TARGETS_PROPERTY = "md_targets";
  const TARGETS_DONE_PROPERTY = "md_targets_done";
  const IS_DONE_PROPERTY = "md_is_done";

  // Reactive data structure for entries
  let entryData = $state<
    Array<{
      entry: BasesEntry;
      filledProperties: PropertyData[];
      emptyProperties: PropertyData[];
      fileContent: string;
    }>
  >([]);

  // Track active target
  let activeTarget = $state<string | undefined>(undefined);
  let activeTargetLabel = $state<string | undefined>(undefined);

  // Filter state: "all", "filled", "empty"
  let targetFilter = $state<"all" | "filled" | "empty">("all");

  // Search state
  let searchValue = $state<string>("");

  // Reactively process entries when they change
  $effect(() => {
    async function processEntriesEffect() {
      entryData = await processEntries(entries, properties);
    }

    processEntriesEffect();
  });

  // Reactively update search value when active file changes
  $effect(() => {
    // Access active file to create reactive dependency
    const activeFile = app.workspace.activeEditor?.file;
    if (activeFile) {
      // Update search state from file frontmatter when active file changes
      updateSearchStateFromFile();
    }
  });

  function debugLog(message: string, ...args: unknown[]): void {
    console.log(`[ListAdvancedView ListView.svelte] ${message}`, ...args);
  }

  function isPropertyValueFilled(value: Value): boolean {
    if (!value) return false;

    // Check if it's truthy
    if (!value.isTruthy()) return false;

    // Check if it's an empty list
    if (value instanceof ListValue) {
      return value.length() > 0;
    }

    // Check if it's an empty string by converting to string
    const stringValue = value.toString();
    if (stringValue.trim().length === 0) {
      return false;
    }

    return true;
  }

  function isPropertyValueEmpty(value: Value): boolean {
    if (!value) return true;

    // Check if it's falsy
    if (!value.isTruthy()) return true;

    // Check if it's an empty list
    if (value instanceof ListValue) {
      return value.length() === 0;
    }

    // Check if it's an empty string by converting to string
    const stringValue = value.toString();
    if (stringValue.trim().length === 0) {
      return true;
    }

    return false;
  }

  function separatePropertiesByValue(properties: PropertyData[]): {
    filledProperties: PropertyData[];
    emptyProperties: PropertyData[];
  } {
    const filledProperties = properties.filter((p) => isPropertyValueFilled(p.value));
    const emptyProperties = properties.filter((p) => isPropertyValueEmpty(p.value));

    return { filledProperties, emptyProperties };
  }

  async function readFileContent(file: TFile): Promise<string> {
    try {
      const content = await app.vault.read(file);
      // Remove frontmatter if present
      const frontmatterRegex = /^---\s*\n[\s\S]*?\n---\s*\n/;
      const contentWithoutFrontmatter = content.replace(frontmatterRegex, "");
      // Get first 300 characters
      return contentWithoutFrontmatter.trim().substring(0, 300);
    } catch (error) {
      console.error(`Error reading file ${file.path}:`, error);
      return "";
    }
  }

  async function processEntry(
    entry: BasesEntry,
    properties: BasesPropertyId[]
  ): Promise<{
    entry: BasesEntry;
    filledProperties: PropertyData[];
    emptyProperties: PropertyData[];
    fileContent: string;
  }> {
    const props = await Promise.all(properties.map(async (prop) => await processProperty(entry, prop)));
    const validProps = props.filter((p) => p !== null) as PropertyData[];

    const { filledProperties, emptyProperties } = separatePropertiesByValue(validProps);
    const fileContent = await readFileContent(entry.file);
    // remove embedded bases, e.g.: ![[Inbox/_data/base.base#OmniSingleItem|base]]
    const fileContentWithoutEmbeddedBases = fileContent.replace(/!\[\[.+?\.base.+?\]\]/g, "");
    console.log("fileContent", fileContentWithoutEmbeddedBases);

    return {
      entry,
      filledProperties,
      emptyProperties,
      fileContent: fileContentWithoutEmbeddedBases,
    };
  }

  async function processEntries(entries: BasesEntry[], properties: BasesPropertyId[]) {
    debugLog("processEntries");
    const entryData = await Promise.all(entries.map((entry) => processEntry(entry, properties)));

    // Update active target info
    activeTarget = getActiveFileTarget();
    activeTargetLabel = getActiveFileTargetLabel();
    debugLog("Updated activeTarget:", activeTarget, activeTargetLabel);

    // Update filter state from file frontmatter
    updateFilterStateFromFile();

    // Update search value from file frontmatter
    updateSearchStateFromFile();

    return entryData;
  }

  async function processProperty(entry: BasesEntry, prop: BasesPropertyId): Promise<PropertyData | null> {
    try {
      const value = entry.getValue(prop);
      // Return null only if property doesn't exist, not if it's empty
      if (value === null || value === undefined) return null;

      const propParsed = parsePropertyId(prop);

      // Return property data even if value is empty
      return {
        type: "property",
        propertyFull: prop,
        propertyName: propParsed.name,
        propertyType: propParsed.type,
        label: config?.getDisplayName(prop) || prop,
        value: value,
      };
    } catch (error) {
      console.error(`Error processing property ${prop}:`, error);
      return null;
    }
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

  function determineFilterState(
    showHasTargets: boolean | undefined,
    showEmptyTargets: boolean | undefined
  ): "all" | "filled" | "empty" {
    if (showHasTargets && showEmptyTargets) {
      return "all";
    } else if (showHasTargets) {
      return "filled";
    } else if (showEmptyTargets) {
      return "empty";
    }
    return "all";
  }

  function updateFilterStateFromFile() {
    const activeFileMetadata = getActiveFileMetadata();
    if (!activeFileMetadata?.frontmatter) {
      targetFilter = "all";
      return;
    }

    const showHasTargets = activeFileMetadata.frontmatter["check_show_has_targets"] as boolean | undefined;
    const showEmptyTargets = activeFileMetadata.frontmatter["check_show_empty_targets"] as boolean | undefined;

    targetFilter = determineFilterState(showHasTargets, showEmptyTargets);
  }

  function updateSearchStateFromFile() {
    const activeFileMetadata = getActiveFileMetadata();
    if (!activeFileMetadata?.frontmatter) {
      searchValue = "";
      return;
    }

    const search = activeFileMetadata.frontmatter["md_list_search"] as string | undefined;
    searchValue = search || "";
  }

  function extractEntryLink(entry: BasesEntry): string | null {
    // Check md_link first (dedicated link property)
    const mdLink = entry.getValue("note.md_link");
    if (mdLink && mdLink.isTruthy()) {
      const linkStr = mdLink.toString().trim();
      if (linkStr.length > 0) return linkStr;
    }

    // Check md_title for markdown links like [text](url)
    const mdTitle = entry.getValue("note.md_title");
    if (mdTitle && mdTitle.isTruthy()) {
      const titleStr = mdTitle.toString();
      const markdownLinkMatch = titleStr.match(/\[.*?\]\((https?:\/\/[^\s)]+)\)/);
      if (markdownLinkMatch) return markdownLinkMatch[1];
      // Check for bare URLs
      const urlMatch = titleStr.match(/(https?:\/\/[^\s]+)/);
      if (urlMatch) return urlMatch[1];
    }

    return null;
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
    const link = extractEntryLink(entry);
    if (!link) return;

    addActiveTargetToEntry(entry);
    setTimeout(() => {
      window.open(link, "_blank");
    }, 100);
  }

  function normalizeTargetsArray(targets: unknown[] | unknown): string[] {
    if (Array.isArray(targets)) {
      return targets;
    }
    return targets ? [targets.toString()] : [];
  }

  function toggleTargetInArray(targets: string[], target: string, shouldRemove: boolean): string[] {
    if (shouldRemove) {
      const index = targets.indexOf(target);
      if (index > -1) {
        targets.splice(index, 1);
      }
    } else {
      if (!targets.includes(target)) {
        targets.push(target);
      }
    }
    return targets;
  }

  function handleMarkAsRead(entry: BasesEntry) {
    const activeTarget = getActiveFileTarget();
    if (!activeTarget) return;

    const isRead = isEntryMarkedAsRead(entry);

    app.fileManager.processFrontMatter(entry.file, (frontmatter) => {
      const targetsOriginal = (frontmatter[TARGETS_DONE_PROPERTY] as unknown[] | unknown) ?? [];
      const targets = normalizeTargetsArray(targetsOriginal);
      const updatedTargets = toggleTargetInArray(targets, activeTarget, isRead);
      frontmatter[TARGETS_DONE_PROPERTY] = updatedTargets;
    });
  }

  function handleRemove(entry: BasesEntry) {
    const isDone = isEntryMarkedAsDone(entry);

    app.fileManager.processFrontMatter(entry.file, (frontmatter) => {
      frontmatter[IS_DONE_PROPERTY] = !isDone;
    });
  }

  function updateTargetProperty(activeFile: TFile, selectedTarget: string) {
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

  function handleFilterSelect(event: Event) {
    const select = event.target as HTMLSelectElement;
    const selectedTarget = select.value;

    const activeFile = app.workspace.activeEditor?.file;
    if (!activeFile) return;

    updateTargetProperty(activeFile, selectedTarget);
  }

  function getBooleanValue(entry: BasesEntry, prop: BasesPropertyId): boolean {
    const value: { data: boolean } | undefined = entry.getValue(prop) as any;
    return value?.data ?? false;
  }

  function extractTargetsDoneArray(entry: BasesEntry): string[] {
    const targetsDone: (Value & { data: string[] | string }) | null = entry.getValue(`note.${TARGETS_DONE_PROPERTY}`) as any;

    if (!targetsDone || !targetsDone.isTruthy()) {
      return [];
    }

    return Array.isArray(targetsDone.data) ? targetsDone.data : [targetsDone.data];
  }

  function isEntryMarkedAsRead(entry: BasesEntry): boolean {
    const activeTarget = getActiveFileTarget();
    if (!activeTarget) return false;

    const targetsDoneArray = extractTargetsDoneArray(entry);
    return targetsDoneArray.some((t: any) => t.toString() === activeTarget);
  }

  function isEntryMarkedAsDone(entry: BasesEntry): boolean {
    return getBooleanValue(entry, `note.${IS_DONE_PROPERTY}`);
  }

  function getAreTargetsShown(entry: BasesEntry): boolean {
    const areTargetsEmpty = getBooleanValue(entry, "formula.fnzTargetsEmptyTargets");
    return areTargetsEmpty;
  }

  function getFilterFrontmatterValues(filterValue: "all" | "filled" | "empty"): {
    showHasTargets: boolean;
    showEmptyTargets: boolean;
  } {
    if (filterValue === "all") {
      return { showHasTargets: true, showEmptyTargets: true };
    } else if (filterValue === "filled") {
      return { showHasTargets: true, showEmptyTargets: false };
    } else {
      // filterValue === "empty"
      return { showHasTargets: false, showEmptyTargets: true };
    }
  }

  function handleTargetFilterChange(event: Event) {
    const radio = event.target as HTMLInputElement;
    const filterValue = radio.value as "all" | "filled" | "empty";

    const activeFile = app.workspace.activeEditor?.file;
    if (!activeFile) return;

    const { showHasTargets, showEmptyTargets } = getFilterFrontmatterValues(filterValue);

    app.fileManager.processFrontMatter(activeFile, (frontmatter) => {
      frontmatter["check_show_has_targets"] = showHasTargets;
      frontmatter["check_show_empty_targets"] = showEmptyTargets;
    });

    // Update local state
    targetFilter = filterValue;
  }

  function handleSearchChange(event: Event) {
    const input = event.target as HTMLInputElement;
    const newValue = input.value;

    const activeFile = app.workspace.activeEditor?.file;
    if (!activeFile) return;

    app.fileManager.processFrontMatter(activeFile, (frontmatter) => {
      if (newValue.trim() === "") {
        // Remove the property if empty
        delete frontmatter["md_list_search"];
      } else {
        frontmatter["md_list_search"] = newValue;
      }
    });

    // Update local state
    searchValue = newValue;
  }

  function getEntryClasses(entry: BasesEntry): string {
    return [
      getBooleanValue(entry, "formula.fnzShouldShowRulesCombined") === false ? "entry-about-to-disappear" : "",
      getBooleanValue(entry, "formula.fnzTargetsEmptyTargets") ? "entry-targets-empty" : "",
    ].join(" ");
  }

  function handlePropertyChange(entry: BasesEntry, propertyName: string, newValue: string) {
    app.fileManager.processFrontMatter(entry.file, (frontmatter) => {
      frontmatter[propertyName] = newValue;
    });
  }

  async function handleFileContentClick(entry: BasesEntry) {
    const leaf = app.workspace.getLeaf(false);
    await leaf.openFile(entry.file);
  }

  function isOmniList(): boolean {
    const metadata = getActiveFileMetadata();
    if (!metadata?.frontmatter) return false;

    const mdListType = metadata.frontmatter["md_list_type"];
    return !!mdListType;
  }
</script>

<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<div class="list-container" tabindex="0" role="region" aria-label="List view">
  {#if isOmniList()}
    <div class="filters-container">
      <label for="active-target-select">Select your target:</label>
      <select id="active-target-select" value={activeTarget || ""} onchange={handleFilterSelect}>
        <option value="">All</option>
        {#each ALL_TARGETS as target}
          <option value={target.value}>{formatTarget(target)}</option>
        {/each}
      </select>

      <div class="search-group">
        <label for="list-search-input">Search:</label>
        <input
          id="list-search-input"
          type="text"
          class="search-input"
          placeholder="Search..."
          value={searchValue}
          oninput={handleSearchChange}
        />
      </div>

      <div class="target-filter-group">
        <span class="filter-label">Show:</span>
        <div class="radio-group">
          <label class="radio-label">
            <input
              type="radio"
              name="target-filter"
              value="all"
              checked={targetFilter === "all"}
              onchange={handleTargetFilterChange}
            />
            <span>All</span>
          </label>
          <label class="radio-label">
            <input
              type="radio"
              name="target-filter"
              value="filled"
              checked={targetFilter === "filled"}
              onchange={handleTargetFilterChange}
            />
            <span>Filled Targets</span>
          </label>
          <label class="radio-label">
            <input
              type="radio"
              name="target-filter"
              value="empty"
              checked={targetFilter === "empty"}
              onchange={handleTargetFilterChange}
            />
            <span>Empty Targets</span>
          </label>
        </div>
      </div>
    </div>
  {/if}

  {#each entryData as { entry, filledProperties, emptyProperties, fileContent }, index (entry.file.path)}
    <div class="entry {getEntryClasses(entry)}">
      {#each filledProperties as propData (propData.propertyFull)}
        <div class="property">
          <label class="property-label" for={`${entry.file.path}-${propData.propertyFull}`}>{propData.label}</label>
          {#if propData.propertyType === "note"}
            <EditableTextarea
              {renderContext}
              {app}
              sourcePath={entry.file.path}
              id={`${entry.file.path}-${propData.propertyFull}`}
              value={propData.value}
              onchange={(newValue) => handlePropertyChange(entry, propData.propertyName, newValue)}
            />
          {:else}
            <span class="property-value" use:renderPropertyValue={propData.value}></span>
          {/if}
        </div>
      {/each}
      {#if fileContent && fileContent?.trim()?.length > 0 && isOmniList()}
        <div class="property">
          <label class="property-label" for={`${entry.file.path}-content`}>Content ({fileContent.length} characters)</label>
          <EditableTextarea
            {renderContext}
            {app}
            sourcePath={entry.file.path}
            id={`${entry.file.path}-content`}
            value={fileContent}
            readonly={true}
            onchange={() => {}}
            onClick={() => handleFileContentClick(entry)}
          />
        </div>
      {/if}
      {#if emptyProperties.length > 0}
        <div class="empty-properties-container">
          {#each emptyProperties as propData (propData.propertyFull)}
            <span class="empty-property-label">{propData.label}</span>
          {/each}
        </div>
      {/if}
      <div class="actions-container">
        {#if activeTarget}
          {@const entryLink = extractEntryLink(entry)}
          <button class="btn-primary" onclick={() => handleWatch(entry)} disabled={!entryLink}>
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

  .filters-container {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.75rem;
    margin-bottom: 1.5rem;
    padding-bottom: 1rem;
    border-bottom: 1px solid var(--background-modifier-border);
  }

  .filters-container label {
    font-weight: 500;
    color: var(--text-normal);
  }

  .filters-container select {
    padding: 0.4rem 0.8rem;
    border: 1px solid var(--background-modifier-border);
    border-radius: 4px;
    background-color: var(--background-primary);
    color: var(--text-normal);
    cursor: pointer;
    font-size: 0.95rem;
  }

  .filters-container select:focus {
    outline: none;
    border-color: var(--interactive-accent);
  }

  .search-group {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .search-group label {
    font-weight: 500;
    color: var(--text-normal);
    white-space: nowrap;
  }

  .search-input {
    padding: 0.4rem 0.8rem;
    border: 1px solid var(--background-modifier-border);
    border-radius: 4px;
    background-color: var(--background-primary);
    color: var(--text-normal);
    font-size: 0.95rem;
    min-width: 200px;
  }

  .search-input:focus {
    outline: none;
    border-color: var(--interactive-accent);
  }

  .target-filter-group {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-wrap: wrap;
  }

  .filter-label {
    font-weight: 500;
    color: var(--text-normal);
    white-space: nowrap;
  }

  .radio-group {
    display: flex;
    gap: 1rem;
    align-items: center;
    flex-wrap: wrap;
  }

  .radio-label {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    cursor: pointer;
    font-size: 0.9rem;
    color: var(--text-normal);
  }

  .radio-label input[type="radio"] {
    cursor: pointer;
    accent-color: var(--interactive-accent);
  }

  .radio-label:hover {
    color: var(--text-accent);
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

  .btn-primary:disabled {
    opacity: 0.4;
    cursor: not-allowed;
    filter: grayscale(0.7);
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

  .empty-properties-container {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    margin-top: 0.5rem;
    padding-top: 0.5rem;
    border-top: 1px solid var(--background-modifier-border);
    opacity: 0.5;
  }

  .empty-property-label {
    font-size: 0.85rem;
    color: grey;
    font-weight: 500;
    text-decoration: line-through;
  }
</style>
