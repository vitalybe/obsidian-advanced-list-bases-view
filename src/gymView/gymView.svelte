<script lang="ts">
  import {
    BasesViewConfig,
    MarkdownRenderer,
    parsePropertyId,
    type BasesEntry,
    TFile,
    type App,
    type BasesPropertyId,
    type FrontMatterCache,
    type RenderContext,
    ListValue,
  } from "obsidian";
  import type { PropertyData } from "../types";

  // Props with defaults to prevent undefined errors
  export let entries: BasesEntry[] = [];
  export let properties: BasesPropertyId[] = [];
  export let config: BasesViewConfig | undefined = undefined;
  export let app: App;
  export let renderContext: RenderContext | undefined = undefined;
  export let component: any = undefined;

  // Exercise data structure (for List-type properties)
  interface ExerciseData {
    prop: string;
    label: string;
    currentValues: number[];
    recentOptions: number[]; // Last 3 unique values from past entries
  }

  // Combined property display data
  interface PropertyDisplay {
    prop: string;
    type: "exercise" | "property";
    exerciseData?: ExerciseData;
    propertyData?: PropertyData;
  }

  let propertyDisplays: PropertyDisplay[] = [];
  let selectedValues: Map<string, string> = new Map();
  let customValues: Map<string, string> = new Map();

  // Reactively process entries when they change
  $: {
    processEntries(entries, properties);
  }

  function debugLog(message: string, ...args: unknown[]): void {
    console.log(`[GymView ListView.svelte] ${message}`, ...args);
  }

  function sanitizeValue(value: string): number {
    return parseFloat(value.replace(/[^\d.-]/g, ""));
  }

  function getValues(listValue: ListValue): number[] {
    const listLength = listValue.length();
    const values: number[] = [];
    for (let i = 0; i < listLength; i++) {
      const value = listValue.get(i);
      values.push(sanitizeValue(value.toString()));
    }
    return values;
  }

  async function processEntries(entries: BasesEntry[], properties: BasesPropertyId[]) {
    debugLog("processEntries", entries.length, "properties:", properties.length);

    if (entries.length === 0 || properties.length === 0) {
      propertyDisplays = [];
      return;
    }

    // Get the first entry (the current one we're editing)
    const firstEntry = entries[0];

    // Aggregate exercise history from all entries
    const exerciseHistory = aggregateExerciseHistory(entries);

    // Process each property in order
    const displays: PropertyDisplay[] = [];

    for (const prop of properties) {
      const value = firstEntry.getValue(prop);

      if (!value) continue;

      // Check if this is a List type (array)
      if (value instanceof ListValue) {
        // Render as exercise form
        const currentValues = getValues(value);
        const propParsed = parsePropertyId(prop);
        const recentOptions = getRecentUniqueValues(propParsed.name, exerciseHistory, currentValues);

        displays.push({
          prop,
          type: "exercise",
          exerciseData: {
            prop: propParsed.name,
            label: config?.getDisplayName(prop) || prop,
            currentValues,
            recentOptions,
          },
        });
      } else {
        // Render as regular property
        const propertyData = await processProperty(firstEntry, prop);
        if (propertyData) {
          displays.push({
            prop,
            type: "property",
            propertyData,
          });
        }
      }
    }

    propertyDisplays = displays;
    debugLog("Processed property displays:", propertyDisplays);
  }

  async function processProperty(entry: ListEntry, prop: BasesPropertyId): Promise<PropertyData | null> {
    try {
      const value = entry.getValue(prop);
      if (!value) return null;

      const valueStr = value.toString();

      // Check if this is a dynamic template directive (same as targetView)
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

  function aggregateExerciseHistory(entries: BasesEntry[]): Map<string, number[][]> {
    const history = new Map<string, number[][]>();

    // Skip the first entry (that's the one we're editing) and process the rest
    for (let i = 1; i < entries.length; i++) {
      const entry = entries[i];
      const metadata = getEntryFileMetadata(entry);

      if (!metadata?.frontmatter) continue;

      for (const [exerciseName, value] of Object.entries(metadata.frontmatter)) {
        if (!Array.isArray(value)) continue;

        if (!history.has(exerciseName)) {
          history.set(exerciseName, []);
        }

        const values = value.map((v) => sanitizeValue(v));
        history.get(exerciseName)!.push(values);
      }
    }

    return history;
  }

  function getRecentUniqueValues(exerciseName: string, history: Map<string, number[][]>, currentValues: number[]): number[] {
    const exerciseHistory = history.get(exerciseName);
    if (!exerciseHistory) return [];
    debugger;

    // Flatten all values from history and get unique ones
    const allValues = exerciseHistory.flat();
    const uniqueValues: number[] = [];
    const seen = new Set();

    // Get unique values in order of appearance (most recent first)
    for (const value of allValues) {
      if (!seen.has(value)) {
        uniqueValues.push(value);
        seen.add(value);
      }

      // Stop after 3 unique values
      if (uniqueValues.length >= 3) break;
    }

    return uniqueValues;
  }

  function getEntryFileMetadata(entry: BasesEntry): FrontMatterCache | undefined {
    const entryFile = entry.file;
    return app.metadataCache.getFileCache(entryFile) ?? undefined;
  }

  function handleRemoveValue(exercise: ExerciseData | undefined, valueIndex: number) {
    if (!exercise) return;

    debugLog("handleRemoveValue", exercise.prop, valueIndex);

    if (entries.length === 0) return;
    const firstEntry = entries[0];

    app.fileManager.processFrontMatter(firstEntry.file, (frontmatter) => {
      const values = frontmatter[exercise.prop];
      if (Array.isArray(values)) {
        values.splice(valueIndex, 1);
        frontmatter[exercise.prop] = values;
      }
    });
  }

  function handleAddValue(exercise: ExerciseData) {
    debugLog("handleAddValue", exercise.prop);

    if (entries.length === 0) return;
    const firstEntry = entries[0];

    // Get the selected or custom value
    const selectedValue = selectedValues.get(exercise.prop);
    const customValue = customValues.get(exercise.prop);

    const valueToAdd = customValue || selectedValue;

    if (!valueToAdd) {
      debugLog("No value to add");
      return;
    }

    app.fileManager.processFrontMatter(firstEntry.file, (frontmatter) => {
      let values = frontmatter[exercise.prop];
      if (!Array.isArray(values)) {
        values = [];
      }
      // Sanitize and convert to number if possible
      const sanitized = sanitizeValue(valueToAdd);
      values.push(sanitized);
      frontmatter[exercise.prop] = values;
    });

    // Clear the input after adding
    customValues.set(exercise.prop, "");
    selectedValues.set(exercise.prop, "");
    customValues = customValues;
    selectedValues = selectedValues;
  }

  function handleRadioChange(exerciseName: string, value: string) {
    selectedValues.set(exerciseName, value);
    // Clear custom value when radio is selected
    customValues.set(exerciseName, "");
    customValues = customValues;
  }

  function handleCustomValueChange(exerciseName: string, value: string) {
    customValues.set(exerciseName, value);
    // Clear radio selection when custom value is entered
    selectedValues.set(exerciseName, "");
    selectedValues = selectedValues;
  }
</script>

<!-- svelte-ignore a11y-no-noninteractive-tabindex -->
<div class="gym-container" tabindex="0" role="region" aria-label="Gym view">
  {#if propertyDisplays.length === 0}
    <div class="empty-state">
      <p>No properties found. Make sure your base has defined properties.</p>
    </div>
  {:else}
    {#each propertyDisplays as display (display.prop)}
      {#if display.type === "exercise" && display.exerciseData}
        <!-- Exercise form for List-type properties -->
        <div class="exercise-card">
          <h3 class="exercise-name">{display.exerciseData.label}</h3>

          <!-- Current values with remove buttons -->
          <div class="current-values">
            <span class="section-label">Current values:</span>
            {#if display.exerciseData.currentValues.length > 0}
              <div class="values-list">
                {#each display.exerciseData.currentValues as value, index}
                  <div class="value-item">
                    <span class="value-text">{value}</span>
                    <button
                      class="btn-remove"
                      on:click={() => handleRemoveValue(display.exerciseData, index)}
                      title="Remove this value"
                    >
                      ×
                    </button>
                  </div>
                {/each}
              </div>
            {:else}
              <p class="empty-text">No values recorded yet</p>
            {/if}
          </div>

          <!-- Recent options as radio buttons -->
          {#if display.exerciseData.recentOptions.length > 0}
            <div class="recent-options">
              <span class="section-label">Recent values:</span>
              <div class="radio-group">
                {#each display.exerciseData.recentOptions as option}
                  <label class="radio-label">
                    <input
                      type="radio"
                      name={`exercise-${display.exerciseData.prop}`}
                      value={option}
                      checked={selectedValues.get(display.exerciseData.prop) === option.toString()}
                      on:change={() =>
                        display.exerciseData ? handleRadioChange(display.exerciseData.prop, option.toString()) : undefined}
                    />
                    <span>{option}</span>
                  </label>
                {/each}
              </div>
            </div>
          {/if}

          <!-- Custom value input -->
          <div class="custom-input">
            <span class="section-label">New value:</span>
            <div class="input-row">
              <input
                type="text"
                class="text-input"
                placeholder="Enter new value..."
                value={customValues.get(display.exerciseData.prop) || ""}
                on:input={(e) =>
                  display.exerciseData ? handleCustomValueChange(display.exerciseData.prop, e.currentTarget.value) : undefined}
              />
              <button
                class="btn-submit"
                on:click={() => (display.exerciseData ? handleAddValue(display.exerciseData) : undefined)}
              >
                Submit
              </button>
            </div>
          </div>
        </div>
      {:else if display.type === "property" && display.propertyData}
        <!-- Regular property display (non-List types) -->
        {#if display.propertyData.type === "template"}
          <div class="property-display">
            <div
              class="template"
              use:renderMarkdown={{ content: display.propertyData.templateContent, filePath: display.propertyData.filePath }}
            ></div>
          </div>
        {:else if display.propertyData.type === "property"}
          <div class="property-display">
            <div class="property">
              <span class="property-label">{display.propertyData.label}</span>
              <span class="property-value" use:renderPropertyValue={display.propertyData.value}></span>
            </div>
          </div>
        {:else if display.propertyData.type === "error"}
          <div class="property-display">
            <div class="error">{display.propertyData.message}</div>
          </div>
        {/if}
      {/if}
    {/each}
  {/if}
</div>

<style>
  .gym-container {
    padding: 1rem;
  }

  .gym-container:focus {
    outline: none;
  }

  .empty-state {
    padding: 2rem;
    text-align: center;
    color: var(--text-muted);
  }

  .property-display {
    margin-bottom: 1rem;
    padding: 0.75rem;
    border: 1px solid var(--background-modifier-border);
    border-radius: 4px;
    background-color: var(--background-secondary);
  }

  .property {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .property-label {
    font-weight: 600;
    color: var(--text-normal);
  }

  .property-value {
    color: var(--text-muted);
  }

  .error {
    color: var(--text-error);
    font-style: italic;
  }

  .exercise-card {
    margin-bottom: 2rem;
    padding: 1.5rem;
    border: 1px solid var(--background-modifier-border);
    border-radius: 8px;
    background-color: var(--background-primary);
  }

  .exercise-name {
    margin: 0 0 1rem 0;
    font-size: 1.25rem;
    font-weight: 600;
    color: var(--text-normal);
    border-bottom: 2px solid var(--interactive-accent);
    padding-bottom: 0.5rem;
  }

  .section-label {
    display: block;
    font-weight: 500;
    color: var(--text-normal);
    margin-bottom: 0.5rem;
    font-size: 0.95rem;
  }

  .current-values {
    margin-bottom: 1.5rem;
  }

  .values-list {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }

  .value-item {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.4rem 0.8rem;
    background-color: var(--background-secondary);
    border-radius: 4px;
    border: 1px solid var(--background-modifier-border);
  }

  .value-text {
    font-weight: 500;
    color: var(--text-normal);
  }

  .btn-remove {
    background: none;
    border: none;
    color: var(--text-error);
    font-size: 1.5rem;
    line-height: 1;
    cursor: pointer;
    padding: 0;
    width: 20px;
    height: 20px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 3px;
    transition: background-color 0.2s;
  }

  .btn-remove:hover {
    background-color: var(--background-modifier-hover);
  }

  .empty-text {
    color: var(--text-muted);
    font-style: italic;
    margin: 0;
  }

  .recent-options {
    margin-bottom: 1.5rem;
  }

  .radio-group {
    display: flex;
    flex-wrap: wrap;
    gap: 1rem;
  }

  .radio-label {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    cursor: pointer;
    user-select: none;
    padding: 0.4rem 0.8rem;
    border: 1px solid var(--background-modifier-border);
    border-radius: 4px;
    background-color: var(--background-secondary);
    transition: all 0.2s;
  }

  .radio-label:hover {
    background-color: var(--background-modifier-hover);
  }

  .radio-label input[type="radio"] {
    cursor: pointer;
  }

  .custom-input {
    margin-bottom: 0.5rem;
  }

  .input-row {
    display: flex;
    gap: 0.5rem;
  }

  .text-input {
    flex: 1;
    padding: 0.5rem 0.75rem;
    border: 1px solid var(--background-modifier-border);
    border-radius: 4px;
    background-color: var(--background-primary);
    color: var(--text-normal);
    font-size: 0.95rem;
  }

  .text-input:focus {
    outline: none;
    border-color: var(--interactive-accent);
  }

  .btn-submit {
    padding: 0.5rem 1rem;
    border: none;
    border-radius: 4px;
    background-color: var(--interactive-accent);
    color: var(--text-on-accent);
    font-weight: 500;
    cursor: pointer;
    transition: opacity 0.2s;
    white-space: nowrap;
  }

  .btn-submit:hover {
    opacity: 0.9;
  }

  .btn-submit:active {
    transform: scale(0.98);
  }
</style>
