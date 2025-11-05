<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { DateTime } from "luxon";
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
  import type { Writable } from "svelte/store";
  import type { PropertyData } from "../types";

  // Props with defaults to prevent undefined errors
  let {
    entries: entriesStore,
    properties: propertiesStore,
    config = undefined,
    app,
    renderContext = undefined,
    component = undefined,
  }: {
    entries: Writable<BasesEntry[]>;
    properties: Writable<BasesPropertyId[]>;
    config?: BasesViewConfig;
    app: App;
    renderContext?: RenderContext;
    component?: any;
  } = $props();

  // Subscribe to stores to get reactive values
  let entries = $derived($entriesStore);
  let properties = $derived($propertiesStore);

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

  let propertyDisplays = $state<PropertyDisplay[]>([]);
  let selectedValues = $state<Map<string, string>>(new Map());
  let customValues = $state<Map<string, string>>(new Map());
  let todayFileExists = $state(false);
  let lastExerciseDate = $state<DateTime | null>(null);
  let currentTime = $state(DateTime.now());
  let timerInterval: number | null = null;
  let expandedExercise = $state<string | null>(null);

  // Reactively process entries when they change
  let effectRunCount = 0;
  $effect(() => {
    effectRunCount++;
    debugLog(`Effect run #${effectRunCount}: Entries or properties changed, reprocessing...`);
    processEntries(entries, properties);
  });

  // Reactively check if today's file exists
  $effect(() => {
    checkTodayFileExists();
  });

  // Check if timer should be shown (within last 2 minutes)
  let showTimer = $derived(lastExerciseDate && currentTime.diff(lastExerciseDate, "minutes").minutes < 2);

  // Calculate elapsed time string
  let elapsedTime = $derived(lastExerciseDate ? formatElapsedTime(currentTime.diff(lastExerciseDate).as("milliseconds")) : "");

  onMount(() => {
    // Update current time every second
    timerInterval = window.setInterval(() => {
      currentTime = DateTime.now();
    }, 1000);
  });

  onDestroy(() => {
    if (timerInterval !== null) {
      clearInterval(timerInterval);
    }
  });

  function debugLog(message: string, ...args: unknown[]): void {
    console.log(`[GymView ListView.svelte] ${message}`, ...args);
  }

  function formatElapsedTime(milliseconds: number): string {
    const seconds = Math.floor(milliseconds / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;

    if (minutes > 0) {
      return `${minutes}m ${remainingSeconds}s`;
    } else {
      return `${remainingSeconds}s`;
    }
  }

  function sanitizeValue(value: string | number): number {
    if (typeof value === "number") return value;
    // Remove any non-numeric characters (except for decimal point and minus sign)
    return parseFloat(value.replace(/[^\d.-]/g, ""));
  }

  function formatDateForButton(date: Date): string {
    // Format as DD-MMM-YYYY (e.g., "16-Oct-2025")
    const day = date.getDate().toString().padStart(2, "0");
    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const month = monthNames[date.getMonth()];
    const year = date.getFullYear();
    return `${day}-${month}-${year}`;
  }

  function formatDateForFilename(date: Date): string {
    // Format as YYYY-MM-DD (e.g., "2025-10-16")
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, "0");
    const day = date.getDate().toString().padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function checkTodayFileExists() {
    if (!app) return;

    const today = new Date();
    const filename = formatDateForFilename(today);
    const filepath = `Gym/data/${filename}.md`;

    const existingFile = app.vault.getAbstractFileByPath(filepath);
    todayFileExists = existingFile !== null;
    debugLog("Today's file exists:", todayFileExists);
  }

  async function handleCreateNewExercise() {
    const today = new Date();
    const filename = formatDateForFilename(today);
    const filepath = `Gym/data/${filename}.md`;

    debugLog("Creating new exercise file:", filepath);

    try {
      // Check if file already exists
      const existingFile = app.vault.getAbstractFileByPath(filepath);
      if (existingFile) {
        debugLog("File already exists:", filepath);
        // Open the existing file
        const leaf = app.workspace.getLeaf(false);
        await leaf.openFile(existingFile as TFile);
        return;
      }

      // Create the file
      await app.vault.create(filepath, "---\n---\n");
      debugLog("Created new file:", filepath);

      // Update the file exists state
      todayFileExists = true;
    } catch (error) {
      console.error("Error creating exercise file:", error);
    }
  }

  const today = new Date();
  const buttonLabel = `New exercise for ${formatDateForButton(today)}`;

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

    // Extract last_exercise_date from first entry
    const metadata = getEntryFileMetadata(firstEntry);
    let newExerciseDateValue: DateTime | undefined;
    if (metadata?.frontmatter?.last_exercise_date) {
      const dateStr = metadata.frontmatter.last_exercise_date;
      newExerciseDateValue = DateTime.fromISO(dateStr);
    } else {
      newExerciseDateValue = undefined;
    }

    if (lastExerciseDate?.valueOf() !== newExerciseDateValue?.valueOf()) {
      debugLog("Updated lastExerciseDate to:", newExerciseDateValue);
      lastExerciseDate = newExerciseDateValue || null;
    }

    // Aggregate exercise history from all entries
    debugLog("Aggregating exercise history from entries: ", entries.map((e) => e.file.name).join(", "));
    const exerciseHistory = aggregateExerciseHistory(entries);

    // Process each property in order
    const displays: PropertyDisplay[] = [];

    for (const prop of properties) {
      const value = firstEntry.getValue(prop);

      if (!value) continue;

      // Check if this is a List type (array)
      const propParsed = parsePropertyId(prop);
      if (propParsed.type === "note") {
        // Render as exercise form
        const currentValues = value instanceof ListValue ? getValues(value) : [];
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
    // debugLog("Processed property displays:", propertyDisplays);
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
        value: value,
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

    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      const metadata = getEntryFileMetadata(entry);

      if (!metadata?.frontmatter) continue;

      for (const [exerciseName, value] of Object.entries(metadata.frontmatter)) {
        if (!history.has(exerciseName)) {
          history.set(exerciseName, []);
        }

        const valueArray = Array.isArray(value) ? value : !!value ? [value] : [];
        const values = valueArray.map((v) => sanitizeValue(v));
        history.get(exerciseName)!.push(values);
      }
    }

    return history;
  }

  function getRecentUniqueValues(exerciseName: string, history: Map<string, number[][]>, currentValues: number[]): number[] {
    const exerciseHistory = history.get(exerciseName);
    if (!exerciseHistory) return [];

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
      values.push(sanitized.toString());
      frontmatter[exercise.prop] = values;

      // Update last_exercise_date with current ISO datetime
      frontmatter["last_exercise_date"] = DateTime.now().toISO();
    });
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

  function toggleExercise(exerciseProp: string) {
    debugLog("toggleExercise", exerciseProp);
    if (expandedExercise === exerciseProp) {
      expandedExercise = null;
    } else {
      expandedExercise = exerciseProp;
    }
  }

  function isExerciseExpanded(expandedExercise: string | null, exerciseProp: string): boolean {
    return expandedExercise === exerciseProp;
  }

  function getExerciseHistory(exerciseName: string, entries: BasesEntry[]): number[] {
    const allValues: number[] = [];
    for (const entry of entries) {
      const metadata = getEntryFileMetadata(entry);
      if (!metadata?.frontmatter) continue;
      const value = metadata.frontmatter[exerciseName];
      if (value) {
        const valueArray = Array.isArray(value) ? value : [value];
        allValues.push(...valueArray.map((v) => sanitizeValue(v)));
      }
    }
    return allValues;
  }

  // Date-grouped exercise history
  interface DateGroupedHistory {
    date: DateTime;
    dateLabel: string;
    values: number[];
  }

  function getExerciseHistoryByDate(exerciseName: string, entries: BasesEntry[]): DateGroupedHistory[] {
    const dateMap = new Map<string, number[]>();

    for (const entry of entries) {
      const metadata = getEntryFileMetadata(entry);
      if (!metadata?.frontmatter) continue;

      // Extract date from filename (format: YYYY-MM-DD.md)
      const filename = entry.file.basename; // Gets filename without extension
      const dateMatch = filename.match(/^(\d{4}-\d{2}-\d{2})$/);

      if (!dateMatch) {
        // Fallback to file creation time if filename doesn't match expected format
        const fileDate = DateTime.fromMillis(entry.file.stat.ctime);
        const dateKey = fileDate.toISODate();
        if (!dateKey) continue;

        const value = metadata.frontmatter[exerciseName];
        if (value) {
          const valueArray = Array.isArray(value) ? value : [value];
          const values = valueArray.map((v) => sanitizeValue(v));

          if (!dateMap.has(dateKey)) {
            dateMap.set(dateKey, []);
          }
          dateMap.get(dateKey)!.push(...values);
        }
        continue;
      }

      const dateKey = dateMatch[1]; // YYYY-MM-DD format

      const value = metadata.frontmatter[exerciseName];
      if (value) {
        const valueArray = Array.isArray(value) ? value : [value];
        const values = valueArray.map((v) => sanitizeValue(v));

        if (!dateMap.has(dateKey)) {
          dateMap.set(dateKey, []);
        }
        dateMap.get(dateKey)!.push(...values);
      }
    }

    // Convert to array and sort by date (most recent first)
    const result: DateGroupedHistory[] = Array.from(dateMap.entries())
      .map(([dateKey, values]) => {
        const date = DateTime.fromISO(dateKey);
        return {
          date,
          dateLabel: formatDateForDisplay(date.toJSDate()),
          values,
        };
      })
      .sort((a, b) => b.date.toMillis() - a.date.toMillis());

    return result;
  }

  function formatDateForDisplay(date: Date): string {
    // Format as "D MMM" (e.g., "5 Nov")
    const day = date.getDate();
    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const month = monthNames[date.getMonth()];
    return `${day} ${month}`;
  }

  const CHART_SEGMENT_COLORS = ["#CCF1FF", "#E0D7FF", "#FBCCE1", "#FAFFC7", "#D7EEFF"];

  function getColorForValueByRank(value: number, uniqueValues: number[]): string {
    // Find the rank of this value (smallest = 0, second smallest = 1, etc.)
    const sortedUnique = [...uniqueValues].sort((a, b) => a - b);
    const rank = sortedUnique.indexOf(value);

    // If rank is beyond available colors, return white
    if (rank >= CHART_SEGMENT_COLORS.length) {
      return "white";
    }

    return CHART_SEGMENT_COLORS[rank];
  }

  function getSegmentWidth(value: number, minValue: number, maxValue: number): number {
    // Scale segment width from 32px (min value = 100%) to 64px (max value = 200%)
    if (maxValue === minValue) {
      return 32; // Default width if all values are same
    }
    const normalized = (value - minValue) / (maxValue - minValue); // 0 to 1
    return 32 + normalized * 32; // Min 32px, max 64px
  }

  function getExerciseSetCount(exercise: PropertyDisplay) {
    return exercise.exerciseData?.currentValues.length ?? 0;
  }
</script>

<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<div class="gym-container" tabindex="0" role="region" aria-label="Gym view">
  <div class="header-section">
    <button class="btn-new-exercise" onclick={handleCreateNewExercise} disabled={todayFileExists}>
      {buttonLabel}
    </button>
  </div>

  {#if propertyDisplays.length === 0}
    <div class="empty-state">
      <p>No properties found. Make sure your base has defined properties.</p>
    </div>
  {:else}
    {#each propertyDisplays as display (display.prop)}
      {#if display.type === "exercise" && display.exerciseData}
        <!-- Exercise form for List-type properties -->
        <div
          class="exercise-card"
          class:collapsed={!isExerciseExpanded(expandedExercise, display.exerciseData.prop)}
          class:exercise-started={getExerciseSetCount(display) > 0}
          class:exercise-finished={getExerciseSetCount(display) >= 3}
        >
          <!-- svelte-ignore a11y_click_events_have_key_events -->
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <div
            class="exercise-header"
            onclick={() => (display.exerciseData ? toggleExercise(display.exerciseData.prop) : undefined)}
            role="button"
            tabindex="0"
          >
            <h3 class="exercise-name">
              <span class="exercise-title">
                {display.exerciseData.label}
                <span class="sets-count">({getExerciseSetCount(display)} sets)</span>
              </span>
              {#if showTimer && isExerciseExpanded(expandedExercise, display.exerciseData.prop)}
                <span class="timer">{elapsedTime}</span>
              {/if}
            </h3>
            <span class="accordion-icon">{isExerciseExpanded(expandedExercise, display.exerciseData.prop) ? "▼" : "▶"}</span>
          </div>

          {#if isExerciseExpanded(expandedExercise, display.exerciseData.prop)}
            <!-- Recent options as radio buttons -->
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
                      onchange={() =>
                        display.exerciseData ? handleRadioChange(display.exerciseData.prop, option.toString()) : undefined}
                    />
                    <span>{option}</span>
                  </label>
                {/each}
                <div class="radio-label">
                  <input
                    type="text"
                    class="text-input"
                    placeholder="Enter new value..."
                    value={customValues.get(display.exerciseData.prop) || ""}
                    oninput={(e) =>
                      display.exerciseData
                        ? handleCustomValueChange(display.exerciseData.prop, e.currentTarget.value)
                        : undefined}
                  />
                </div>
                <button
                  class="btn-submit"
                  onclick={() => (display.exerciseData ? handleAddValue(display.exerciseData) : undefined)}
                >
                  Submit
                </button>
              </div>
            </div>
            <div class="current-values">
              <span class="section-label">Current values:</span>
              {#if display.exerciseData.currentValues.length > 0}
                <div class="values-list">
                  {#each display.exerciseData.currentValues as value, index}
                    <div class="value-item">
                      <span class="value-text">{value}</span>
                      <button
                        class="btn-remove"
                        onclick={() => handleRemoveValue(display.exerciseData, index)}
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

            <!-- Mini-graph showing exercise history -->
            {#if display.exerciseData}
              {@const historyByDate = getExerciseHistoryByDate(display.exerciseData.prop, entries)}
              {#if historyByDate.length > 0}
                {@const allValues = historyByDate.flatMap((d) => d.values)}
                {@const uniqueValues = [...new Set(allValues)]}
                {@const minVal = allValues.length > 0 ? Math.min(...allValues) : 0}
                {@const maxVal = allValues.length > 0 ? Math.max(...allValues) : 0}
                <div class="mini-graph-section">
                  <span class="section-label">History:</span>
                  <div class="mini-graph">
                    {#each historyByDate as dateGroup}
                      <div class="date-row">
                        <span class="date-label">{dateGroup.dateLabel}</span>
                        <div class="date-segments">
                          {#each dateGroup.values as value}
                            <div
                              class="mini-segment"
                              style="width: {getSegmentWidth(value, minVal, maxVal)}px; background-color: {getColorForValueByRank(
                                value,
                                uniqueValues
                              )};"
                              title={value.toString()}
                            >
                              <span class="segment-value">{value}</span>
                            </div>
                          {/each}
                        </div>
                      </div>
                    {/each}
                  </div>
                </div>
              {/if}
            {/if}
          {/if}
        </div>
      {:else if display.type === "property" && display.propertyData}
        <!-- Regular property display (non-List types) -->
        {#if display.propertyData.type === "property"}
          <div class="property-display">
            <div class="property">
              <span class="property-label">{display.propertyData.label}</span>
              <span class="property-value" use:renderPropertyValue={display.propertyData.value}></span>
            </div>
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

  .header-section {
    padding-bottom: 1rem;
    border-bottom: 1px solid var(--background-modifier-border);
  }

  .btn-new-exercise {
    padding: 0.6rem 1.2rem;
    border: none;
    border-radius: 6px;
    background-color: var(--interactive-accent);
    color: var(--text-on-accent);
    font-weight: 600;
    font-size: 1rem;
    cursor: pointer;
    transition: opacity 0.2s;
  }

  .btn-new-exercise:hover:not(:disabled) {
    opacity: 0.9;
  }

  .btn-new-exercise:active:not(:disabled) {
    transform: scale(0.98);
  }

  .btn-new-exercise:disabled {
    opacity: 0.5;
    cursor: not-allowed;
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

  .exercise-card {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    margin-bottom: 1rem;
    padding: 1rem;
    border: 1px solid var(--background-modifier-border);
    border-radius: 8px;
    background-color: var(--background-primary);
    transition: all 0.2s ease;
  }

  .exercise-card.collapsed {
    padding: 0.75rem 1rem;
  }

  .exercise-header {
    cursor: pointer;
    display: flex;
    justify-content: space-between;
    align-items: center;
    user-select: none;
  }

  .exercise-header:hover {
    opacity: 0.8;
  }

  .exercise-name {
    margin: 0;
    font-size: 1.25rem;
    font-weight: 600;
    color: var(--text-normal);
    padding-bottom: 0.5rem;
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex: 1;
    border-bottom: none;
  }

  .exercise-card:not(.collapsed) .exercise-name {
    border-bottom: 2px solid var(--interactive-accent);
    margin-bottom: 1rem;
  }

  .exercise-title {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .exercise-started {
    background-color: hsl(58, 73%, 95%);
  }

  .exercise-finished {
    background-color: hsl(120, 73%, 95%);
  }

  .sets-count {
    font-size: 0.9rem;
    font-weight: 400;
    color: var(--text-muted);
  }

  .accordion-icon {
    font-size: 1rem;
    color: var(--text-muted);
    transition: transform 0.2s ease;
  }

  .timer {
    font-size: 0.9rem;
    font-weight: 500;
    color: var(--text-accent);
    background-color: var(--background-modifier-border);
    padding: 0.25rem 0.75rem;
    border-radius: 4px;
    font-family: var(--font-monospace);
  }

  .section-label {
    display: block;
    font-weight: 500;
    color: var(--text-normal);
    margin-bottom: 0.5rem;
    font-size: 0.95rem;
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

  .radio-group {
    display: flex;
    flex-wrap: wrap;
    gap: 1rem;
    align-items: center;
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

  .mini-graph-section {
    margin-top: 1rem;
    padding-top: 1rem;
    border-top: 1px solid var(--background-modifier-border);
  }

  .mini-graph {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    padding: 0.5rem 0;
  }

  .date-row {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  .date-label {
    font-size: 0.85rem;
    font-weight: 500;
    color: var(--text-normal);
    min-width: 50px;
    flex-shrink: 0;
  }

  .date-segments {
    display: flex;
    gap: 2px;
    flex-wrap: wrap;
    align-items: center;
  }

  .mini-segment {
    height: 28px;
    border-radius: 4px;
    transition:
      opacity 0.2s,
      transform 0.2s;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    position: relative;
    padding: 0 0.5rem;
    flex-shrink: 0;
  }

  .mini-segment:hover {
    opacity: 0.85;
    transform: scale(1.05);
  }

  .segment-value {
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--text-normal);
    white-space: nowrap;
    opacity: 0.9;
  }

  .mini-segment:hover .segment-value {
    opacity: 1;
  }
</style>
