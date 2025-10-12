<script lang="ts">
  import { MarkdownRenderer, TFile, type App, type FrontMatterCache, type RenderContext } from "obsidian";
  import type { ListEntry, Config, PropertyData } from "./types";

  // Props with defaults to prevent undefined errors
  export let entries: ListEntry[] = [];
  export let properties: string[] = [];
  export let config: Config | undefined = undefined;
  export let app: App;
  export let renderContext: RenderContext | undefined = undefined;
  export let component: any = undefined;

  enum GroupsEnum {
    KIDS = "Kids",
    ANIMALS = "Animals",
    ADULTS = "Adults",
  }

  const groups = [
    { value: GroupsEnum.KIDS, label: "Kids" },
    { value: GroupsEnum.ANIMALS, label: "Animals" },
    { value: GroupsEnum.ADULTS, label: "Adults" },
  ];

  const targets = [
    { value: "Eli", label: "Eli 👦🏻", groups: [GroupsEnum.KIDS, GroupsEnum.ANIMALS] },
    { value: "Emily", label: "Emily 👧🏽", groups: [GroupsEnum.KIDS, GroupsEnum.ANIMALS] },
    { value: "Lia", label: "Lia 👧🏼", groups: [GroupsEnum.KIDS, GroupsEnum.ANIMALS] },
    { value: "Inga", label: "Inga 👸🏻", groups: [GroupsEnum.ADULTS] },
    { value: "Esty", label: "Esty 🌸", groups: [GroupsEnum.ADULTS, GroupsEnum.ANIMALS] },
    { value: "Pub", label: "Pub 🍺", groups: [GroupsEnum.ADULTS] },
    { value: "Vitaly", label: "Vitaly 👨🏻", groups: [GroupsEnum.ADULTS] },
  ];

  const TARGETS_PROPERTY = "md-targets";
  const TARGETS_DONE_PROPERTY = "md-targets-done";
  const DELETE_PROPERTY = "md-deleted";

  // Reactive data structure for entries
  let entryData: Array<{
    entry: ListEntry;
    properties: PropertyData[];
  }> = [];

  // Track active target
  let activeTarget: string | undefined;
  let activeTargetLabel: string | null;

  // Reactively process entries when they change
  $: {
    processEntries(entries, properties);
  }

  function debugLog(message: string, ...args: unknown[]): void {
    console.log(`[ListAdvancedView ListView.svelte] ${message}`, ...args);
  }

  async function processEntries(entries: ListEntry[], properties: string[]) {
    debugLog("processEntries");
    const processed = await Promise.all(
      entries.map(async (entry) => {
        const props = await Promise.all(properties.map(async (prop) => await processProperty(entry, prop)));
        return {
          entry,
          properties: props.filter((p) => p !== null) as PropertyData[],
        };
      })
    );
    entryData = processed;

    // Update active target info
    activeTarget = getActiveFileTarget();
    activeTargetLabel = getActiveFileTargetLabel();
    debugLog("Updated activeTarget:", activeTarget, activeTargetLabel);
  }

  async function processProperty(entry: ListEntry, prop: string): Promise<PropertyData | null> {
    try {
      const value = entry.getValue(prop);
      if (!value) return null;

      const valueStr = value.toString();

      // Check if this is a dynamic template directive
      if (valueStr.startsWith("!dynamic=")) {
        const templatePath = valueStr.substring("!dynamic=".length);
        const filePath = entry.file.path;

        try {
          if (!app) {
            return {
              type: "error",
              prop,
              message: "App not initialized",
            };
          }

          const templateFile = app.vault.getAbstractFileByPath(templatePath);
          if (templateFile && templateFile instanceof TFile) {
            const templateContent = await app.vault.read(templateFile);
            const renderedContent = templateContent.replace(/filePathPlaceholder/g, filePath);

            return {
              type: "template",
              prop,
              templateContent: renderedContent,
              filePath,
            };
          } else {
            return {
              type: "error",
              prop,
              message: `Template file not found: ${templatePath}`,
            };
          }
        } catch (error: any) {
          console.error(`Error rendering template for ${filePath}:`, error);
          return {
            type: "error",
            prop,
            message: `Error: ${error.message}`,
          };
        }
      } else if (valueStr.trim() !== "") {
        return {
          type: "property",
          prop,
          label: config?.getDisplayName(prop) || prop,
          value,
        };
      }

      return null;
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

  function getEntryFileMetadata(entry: ListEntry): FrontMatterCache | undefined {
    let metadata: FrontMatterCache | undefined;
    const entryFile = entry.file;
    metadata = app.metadataCache.getFileCache(entryFile) ?? undefined;
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

  function getTargetValue(entry: ListEntry, target: { value: string; label: string; groups: GroupsEnum[] }): boolean {
    const entryFileMetadata = getEntryFileMetadata(entry);
    if (!entryFileMetadata) return false;
    const targets = entryFileMetadata.frontmatter[TARGETS_PROPERTY] ?? [];
    return targets.includes(target.value);
  }

  function handleTargetChange(entry: ListEntry, target: { value: string; label: string; groups: GroupsEnum[] }) {
    debugLog("handleTargetChange", entry, target);
    app.fileManager.processFrontMatter(entry.file, (frontmatter) => {
      const targets = (frontmatter[TARGETS_PROPERTY] as string[]) ?? [];
      const index = targets.indexOf(target.value);
      if (index > -1) {
        // Remove if already present
        targets.splice(index, 1);
      } else {
        // Add if not present
        targets.push(target.value);
      }
      frontmatter[TARGETS_PROPERTY] = targets;
    });
  }

  function getGroupMembers(group: GroupsEnum) {
    return targets.filter((target) => target.groups.includes(group));
  }

  function isGroupFullySelected(entry: ListEntry, group: GroupsEnum): boolean {
    const members = getGroupMembers(group);
    if (members.length === 0) return false;
    return members.every((member) => getTargetValue(entry, member));
  }

  function handleGroupChange(entry: ListEntry, group: GroupsEnum) {
    debugLog("handleGroupChange", entry, group);
    const members = getGroupMembers(group);
    const isFullySelected = isGroupFullySelected(entry, group);

    app.fileManager.processFrontMatter(entry.file, (frontmatter) => {
      let targets = (frontmatter[TARGETS_PROPERTY] as string[]) ?? [];

      if (isFullySelected) {
        // Remove all members of this group
        targets = targets.filter((t) => !members.some((m) => m.value === t));
      } else {
        // Add all members of this group
        members.forEach((member) => {
          if (!targets.includes(member.value)) {
            targets.push(member.value);
          }
        });
      }

      frontmatter[TARGETS_PROPERTY] = targets;
    });
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

  function getActiveFileTargetLabel(): string | null {
    const targetValue = getActiveFileTarget();
    if (!targetValue) return null;
    const target = targets.find((t) => t.value === targetValue);
    return target?.label || null;
  }

  function openRedditUrl(entry: ListEntry) {
    const redditUrl = entry.getValue("reddit_url");
    if (redditUrl) {
      window.open(redditUrl.toString(), "_blank");
    }
  }

  function addActiveTargetToEntry(entry: ListEntry) {
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

  function handleWatch(entry: ListEntry) {
    openRedditUrl(entry);
    addActiveTargetToEntry(entry);
  }

  function handleMarkAsRead(entry: ListEntry) {
    addActiveTargetToEntry(entry);
  }

  function handleDelete(entry: ListEntry) {
    app.fileManager.processFrontMatter(entry.file, (frontmatter) => {
      frontmatter[DELETE_PROPERTY] = true;
    });
  }

  function handleTargetSelect(event: Event) {
    const select = event.target as HTMLSelectElement;
    const selectedTarget = select.value;

    const activeFile = app.workspace.activeEditor?.file;
    if (!activeFile) return;

    app.fileManager.processFrontMatter(activeFile, (frontmatter) => {
      if (selectedTarget === "") {
        // Remove the property if "None" is selected
        frontmatter[TARGETS_PROPERTY] = [];
      } else {
        // Set the target as an array with the selected value
        frontmatter[TARGETS_PROPERTY] = [selectedTarget];
      }
    });
  }
</script>

<!-- svelte-ignore a11y-no-noninteractive-tabindex -->
<div class="list-container" tabindex="0" role="region" aria-label="List view">
  <div class="target-selector">
    <label for="active-target-select">Select your target:</label>
    <select id="active-target-select" value={activeTarget || ""} on:change={handleTargetSelect}>
      <option value="">All</option>
      {#each targets as target}
        <option value={target.value}>{target.label}</option>
      {/each}
    </select>
  </div>

  {#each entryData as { entry, properties: props }, index (entry.file.path)}
    <div class="entry">
      {#each props as propData (propData.prop)}
        {#if propData.type === "template"}
          <div class="template" use:renderMarkdown={{ content: propData.templateContent, filePath: propData.filePath }}></div>
        {:else if propData.type === "property"}
          <div class="property">
            <span class="property-label">{propData.label}:</span>
            <span class="property-value" use:renderPropertyValue={propData.value}></span>
          </div>
        {:else if propData.type === "error"}
          <div class="error">{propData.message}</div>
        {/if}
      {/each}
    </div>
    <div class="actions-container">
      {#if activeTarget}
        <button class="btn-primary" on:click={() => handleWatch(entry)}>
          Watch ({activeTargetLabel})
        </button>
        <button class="btn-regular" on:click={() => handleMarkAsRead(entry)}> Mark as read </button>
      {/if}
      <button class="btn-regular" on:click={() => openRedditUrl(entry)}> Open </button>
      <button class="btn-destructive" on:click={() => handleDelete(entry)}> Delete </button>
    </div>
    <div class="target-container">
      <div class="groups-row">
        {#each groups as group}
          <label class="checkbox-label">
            <input
              type="checkbox"
              checked={isGroupFullySelected(entry, group.value)}
              on:change={() => handleGroupChange(entry, group.value)}
            />
            <span class="group-name">{group.label}</span>
          </label>
        {/each}
      </div>
      <div class="targets-row">
        {#each targets as target}
          <label class="checkbox-label">
            <input type="checkbox" checked={getTargetValue(entry, target)} on:change={() => handleTargetChange(entry, target)} />
            <span>{target.label}</span>
          </label>
        {/each}
      </div>
    </div>
    {#if index < entryData.length - 1}
      <hr class="entry-separator" />
    {/if}
  {/each}
</div>

<style>
  .list-container {
    padding: 1rem;
  }

  .container:focus {
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
  }

  .property {
    display: flex;
    gap: 0.5rem;
    margin-bottom: 0.25rem;
  }

  .property-label {
    font-weight: 500;
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
  }

  .btn-primary,
  .btn-regular,
  .btn-destructive:hover {
    opacity: 0.8;
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

  .target-container {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    margin-bottom: 0.5rem;
  }

  .groups-row {
    display: flex;
    gap: 1rem;
    flex-wrap: wrap;
  }

  .targets-row {
    display: flex;
    gap: 1rem;
    flex-wrap: wrap;
  }

  .checkbox-label {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    cursor: pointer;
    user-select: none;
  }

  .group-name {
    font-weight: 600;
  }

  .entry-separator {
    margin: 1rem 0;
    border: none;
    border-top: 1px solid var(--background-modifier-border);
  }
</style>
