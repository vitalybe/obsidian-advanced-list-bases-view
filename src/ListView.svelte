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

  // option(Eli, Eli 👦🏻),
  // option(Emily, Emily 👧🏽),
  // option(Lia, Lia 👧🏼),
  // option(Inga, Inga 👸🏻),
  // option(Esty, Esty 🌸)
  // option(Pub, Pub 🍺)
  // option(Vitaly, Vitaly 👨🏻)

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
    { value: "Inga", label: "Inga 👸🏻", groups: [GroupsEnum.KIDS] },
    { value: "Esty", label: "Esty 🌸", groups: [GroupsEnum.KIDS, GroupsEnum.ANIMALS] },
    { value: "Pub", label: "Pub 🍺", groups: [GroupsEnum.ADULTS] },
    { value: "Vitaly", label: "Vitaly 👨🏻", groups: [GroupsEnum.ADULTS] },
    { value: "Pub", label: "Pub 🍺", groups: [GroupsEnum.ADULTS] },
  ];

  const TARGETS_PROPERTY = "md-targets";
  const TARGETS_DONE_PROPERTY = "md-targets-done";

  // Reactive data structure for entries
  let entryData: Array<{
    entry: ListEntry;
    properties: PropertyData[];
  }> = [];

  // Reactively process entries when they change
  $: {
    processEntries(entries, properties);
  }

  function debugLog(message: string, ...args: unknown[]): void {
    console.log(`[ListAdvancedView ListView.svelte] ${message}`, ...args);
  }

  async function processEntries(entries: ListEntry[], properties: string[]) {
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

  function handleTargetClick(entry: ListEntry) {
    console.log("handleTargetClick", entry);
    const activeFileMetadata = getActiveFileMetadata();
    if (!activeFileMetadata) return;
    const entryFile = entry.file;
    const entryFileMetadata = app.metadataCache.getFileCache(entryFile);
    app.fileManager.processFrontMatter(entryFile, (frontmatter) => {
      frontmatter["md-targets"] = ["A", "B", "C"];
      console.log(frontmatter);
    });
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
    debugLog("getTargetValue", entry, target);
    const entryFileMetadata = getEntryFileMetadata(entry);
    if (!entryFileMetadata) return false;
    const targets = entryFileMetadata.frontmatter[TARGETS_PROPERTY] ?? [];
    return targets.includes(target.value);
  }

  function handleTargetChange(entry: ListEntry, target: { value: string; label: string; groups: GroupsEnum[] }) {
    debugLog("handleTargetChange", entry, target);
    app.fileManager.processFrontMatter(entry.file, (frontmatter) => {
      const targets = (frontmatter[TARGETS_PROPERTY] as string[]) ?? [];
      targets.push(target.value);
      frontmatter[TARGETS_PROPERTY] = targets;
    });
  }
</script>

<!-- svelte-ignore a11y-no-noninteractive-tabindex -->
<div class="bases-advanced-list-container" tabindex="0" role="region" aria-label="List view">
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
    <div class="target-container">
      {#each targets as target}
        <div class="target">
          <input
            type="checkbox"
            class="target-checkbox"
            checked={getTargetValue(entry, target)}
            on:change={() => handleTargetChange(entry, target)}
          />
          <span class="target-label">{target.label}</span>
        </div>
      {/each}
    </div>
    {#if index < entryData.length - 1}
      <hr class="entry-separator" />
    {/if}
  {/each}
</div>

<style>
  .bases-advanced-list-container {
    padding: 1rem;
  }

  .bases-advanced-list-container:focus {
    outline: none;
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

  .target-container {
    display: flex;
    gap: 0.5rem;
    margin-bottom: 0.25rem;
  }

  .entry-separator {
    margin: 1rem 0;
    border: none;
    border-top: 1px solid var(--background-modifier-border);
  }
</style>
