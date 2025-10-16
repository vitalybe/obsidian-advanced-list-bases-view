<script lang="ts">
  import { type App, type FrontMatterCache } from "obsidian";
  import type { ListEntry, Config } from "../types";

  // Props with defaults to prevent undefined errors
  export let entries: ListEntry[] = [];
  export let properties: string[] = [];
  export let config: Config | undefined = undefined;
  export let app: App;
  export let component: any = undefined;

  // Exercise data structure
  interface ExerciseData {
    name: string;
    currentValues: string[];
    recentOptions: string[]; // Last 3 unique values from past entries
  }

  let exerciseData: ExerciseData[] = [];
  let selectedValues: Map<string, string> = new Map();
  let customValues: Map<string, string> = new Map();

  // Reactively process entries when they change
  $: {
    processEntries(entries);
  }

  function debugLog(message: string, ...args: unknown[]): void {
    console.log(`[GymView ListView.svelte] ${message}`, ...args);
  }

  function sanitizeValue(value: any): string {
    // If it's a number, convert to string
    if (typeof value === 'number') {
      return String(value);
    }

    // If it's a string, remove all non-number characters (keep digits, minus sign, and decimal point)
    if (typeof value === 'string') {
      return value.replace(/[^\d.-]/g, '');
    }

    // Default: convert to string
    return String(value);
  }

  function processEntries(entries: ListEntry[]) {
    debugLog("processEntries", entries.length);

    if (entries.length === 0) {
      exerciseData = [];
      return;
    }

    // Get the first entry (the current one we're editing)
    const firstEntry = entries[0];
    const metadata = getEntryFileMetadata(firstEntry);

    if (!metadata?.frontmatter) {
      exerciseData = [];
      return;
    }

    // Aggregate exercise data from all entries to get history
    const exerciseHistory = aggregateExerciseHistory(entries);

    // Build exercise data for the first entry
    const exercises: ExerciseData[] = [];

    for (const [exerciseName, value] of Object.entries(metadata.frontmatter)) {
      // Skip non-array properties
      if (!Array.isArray(value)) continue;

      // Get current values for this exercise (sanitized)
      const currentValues = value.map(v => sanitizeValue(v));

      // Get recent unique values from history (excluding current entry)
      const recentOptions = getRecentUniqueValues(exerciseName, exerciseHistory, currentValues);

      exercises.push({
        name: exerciseName,
        currentValues,
        recentOptions,
      });
    }

    exerciseData = exercises;
    debugLog("Processed exercises:", exerciseData);
  }

  function aggregateExerciseHistory(entries: ListEntry[]): Map<string, string[][]> {
    const history = new Map<string, string[][]>();

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

        const values = value.map(v => sanitizeValue(v));
        history.get(exerciseName)!.push(values);
      }
    }

    return history;
  }

  function getRecentUniqueValues(
    exerciseName: string,
    history: Map<string, string[][]>,
    currentValues: string[]
  ): string[] {
    const exerciseHistory = history.get(exerciseName);
    if (!exerciseHistory) return [];

    // Flatten all values from history and get unique ones
    const allValues = exerciseHistory.flat();
    const uniqueValues: string[] = [];
    const seen = new Set(currentValues); // Exclude current values

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

  function getEntryFileMetadata(entry: ListEntry): FrontMatterCache | undefined {
    const entryFile = entry.file;
    return app.metadataCache.getFileCache(entryFile) ?? undefined;
  }

  function handleRemoveValue(exercise: ExerciseData, valueIndex: number) {
    debugLog("handleRemoveValue", exercise.name, valueIndex);

    if (entries.length === 0) return;
    const firstEntry = entries[0];

    app.fileManager.processFrontMatter(firstEntry.file, (frontmatter) => {
      const values = frontmatter[exercise.name];
      if (Array.isArray(values)) {
        values.splice(valueIndex, 1);
        frontmatter[exercise.name] = values;
      }
    });
  }

  function handleAddValue(exercise: ExerciseData) {
    debugLog("handleAddValue", exercise.name);

    if (entries.length === 0) return;
    const firstEntry = entries[0];

    // Get the selected or custom value
    const selectedValue = selectedValues.get(exercise.name);
    const customValue = customValues.get(exercise.name);

    const valueToAdd = customValue || selectedValue;

    if (!valueToAdd) {
      debugLog("No value to add");
      return;
    }

    app.fileManager.processFrontMatter(firstEntry.file, (frontmatter) => {
      let values = frontmatter[exercise.name];
      if (!Array.isArray(values)) {
        values = [];
      }
      // Sanitize and convert to number if possible
      const sanitized = sanitizeValue(valueToAdd);
      const numValue = parseFloat(sanitized);
      const finalValue = !isNaN(numValue) ? numValue : sanitized;
      values.push(finalValue);
      frontmatter[exercise.name] = values;
    });

    // Clear the input after adding
    customValues.set(exercise.name, "");
    selectedValues.set(exercise.name, "");
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

<div class="gym-container" tabindex="0" role="region" aria-label="Gym view">
  {#if exerciseData.length === 0}
    <div class="empty-state">
      <p>No gym data found. Make sure your file has exercise properties in the frontmatter.</p>
    </div>
  {:else}
    {#each exerciseData as exercise (exercise.name)}
      <div class="exercise-card">
        <h3 class="exercise-name">{exercise.name}</h3>

        <!-- Current values with remove buttons -->
        <div class="current-values">
          <label class="section-label">Current values:</label>
          {#if exercise.currentValues.length > 0}
            <div class="values-list">
              {#each exercise.currentValues as value, index}
                <div class="value-item">
                  <span class="value-text">{value}</span>
                  <button
                    class="btn-remove"
                    on:click={() => handleRemoveValue(exercise, index)}
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
        {#if exercise.recentOptions.length > 0}
          <div class="recent-options">
            <label class="section-label">Recent values:</label>
            <div class="radio-group">
              {#each exercise.recentOptions as option}
                <label class="radio-label">
                  <input
                    type="radio"
                    name={`exercise-${exercise.name}`}
                    value={option}
                    checked={selectedValues.get(exercise.name) === option}
                    on:change={() => handleRadioChange(exercise.name, option)}
                  />
                  <span>{option}</span>
                </label>
              {/each}
            </div>
          </div>
        {/if}

        <!-- Custom value input -->
        <div class="custom-input">
          <label class="section-label">New value:</label>
          <div class="input-row">
            <input
              type="text"
              class="text-input"
              placeholder="Enter new value..."
              value={customValues.get(exercise.name) || ""}
              on:input={(e) => handleCustomValueChange(exercise.name, e.currentTarget.value)}
            />
            <button
              class="btn-submit"
              on:click={() => handleAddValue(exercise)}
            >
              Submit
            </button>
          </div>
        </div>
      </div>
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
