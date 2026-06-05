<script lang="ts">
  import type { App, BasesEntry, FrontMatterCache } from "obsidian";
  import { formatTarget, type DefinedTarget, type GroupDef } from "./targetTypes";

  let {
    entry,
    app,
    groups,
    targets,
    propertyName = "md_targets",
    donePropertyName = "md_targets_done",
    label = "Targets:",
  }: {
    entry: BasesEntry;
    app: App;
    groups: GroupDef[];
    targets: DefinedTarget[];
    propertyName?: string;
    donePropertyName?: string;
    label?: string;
  } = $props();

  let isOpen = $state(false);
  let rootEl = $state<HTMLDivElement>();

  // Close the panel when clicking outside of it. The listener is registered only
  // while open so we don't leak one document handler per card.
  $effect(() => {
    if (!isOpen) return;
    const onDocClick = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (rootEl && target && !rootEl.contains(target)) {
        isOpen = false;
      }
    };
    document.addEventListener("click", onDocClick);
    return () => document.removeEventListener("click", onDocClick);
  });

  function getEntryFileMetadata(): FrontMatterCache | undefined {
    return app.metadataCache.getFileCache(entry.file) ?? undefined;
  }

  // Frontmatter values may be a list or a bare scalar (e.g. `md_targets: Eli`).
  // Normalize to an array so both reads and writes are safe.
  function asStringArray(value: unknown): string[] {
    let result: string[];
    if (Array.isArray(value)) {
      result = value as string[];
    } else {
      result = value === undefined || value === null ? [] : [value as string];
    }
    return result;
  }

  function readList(key: string): string[] {
    return asStringArray(getEntryFileMetadata()?.frontmatter?.[key]);
  }

  // getFileCache is not a Svelte signal, so bump a counter when this entry's
  // metadata changes (after a processFrontMatter write) to recompute the lists.
  let metaVersion = $state(0);
  $effect(() => {
    const ref = app.metadataCache.on("changed", (file) => {
      if (file.path === entry.file.path) metaVersion++;
    });
    return () => app.metadataCache.offref(ref);
  });

  let activeValues = $derived.by(() => {
    void metaVersion;
    return readList(propertyName);
  });
  let doneValues = $derived.by(() => {
    void metaVersion;
    return readList(donePropertyName);
  });

  type TargetState = "none" | "active" | "done";

  function getTargetState(target: DefinedTarget): TargetState {
    let result: TargetState = "none";
    if (doneValues.includes(target.value)) {
      result = "done";
    } else if (activeValues.includes(target.value)) {
      result = "active";
    }
    return result;
  }

  function isChecked(target: DefinedTarget): boolean {
    return getTargetState(target) !== "none";
  }

  function getSelectedTargetsDisplay(): string {
    const active = activeValues
      .filter((value) => !doneValues.includes(value))
      .map((value) => formatTargetValue(value));
    const done = doneValues.map((value) => `👁️ ${formatTargetValue(value)}`);
    return [...active, ...done].join(", ");
  }

  function formatTargetValue(value: string): string {
    const target = targets.find((t) => t.value === value);
    return target ? formatTarget(target) : value;
  }

  function removeValue(list: string[], value: string): void {
    const index = list.indexOf(value);
    if (index > -1) list.splice(index, 1);
  }

  // Left checkbox: none -> active; active/done -> cleared from both lists.
  function toggleActive(target: DefinedTarget): void {
    const state = getTargetState(target);
    app.fileManager.processFrontMatter(entry.file, (frontmatter) => {
      const activeList = asStringArray(frontmatter[propertyName]);
      const doneList = asStringArray(frontmatter[donePropertyName]);
      if (state === "none") {
        if (!activeList.includes(target.value)) activeList.push(target.value);
      } else {
        removeValue(activeList, target.value);
        removeValue(doneList, target.value);
      }
      frontmatter[propertyName] = activeList;
      frontmatter[donePropertyName] = doneList;
    });
  }

  // Right eye: only meaningful when checked. active -> done; done -> active.
  function toggleDone(target: DefinedTarget): void {
    const state = getTargetState(target);
    if (state === "none") return;
    app.fileManager.processFrontMatter(entry.file, (frontmatter) => {
      const activeList = asStringArray(frontmatter[propertyName]);
      const doneList = asStringArray(frontmatter[donePropertyName]);
      if (state === "done") {
        removeValue(doneList, target.value);
      } else {
        // Done items remain in the active list too.
        if (!activeList.includes(target.value)) activeList.push(target.value);
        if (!doneList.includes(target.value)) doneList.push(target.value);
      }
      frontmatter[propertyName] = activeList;
      frontmatter[donePropertyName] = doneList;
    });
  }

  function getGroupMembers(group: GroupDef): DefinedTarget[] {
    return targets.filter((target) => target.groups.includes(group.value));
  }

  function isGroupFullySelected(group: GroupDef): boolean {
    const members = getGroupMembers(group);
    return members.length > 0 && members.every((member) => isChecked(member));
  }

  function isGroupPartiallySelected(group: GroupDef): boolean {
    return getGroupMembers(group).some((member) => isChecked(member));
  }

  function getGroupCheckboxIconClass(group: GroupDef): string {
    let className = "checkbox-icon-unchecked";
    if (isGroupFullySelected(group)) {
      className = "checkbox-icon-checked";
    } else if (isGroupPartiallySelected(group)) {
      className = "checkbox-icon-partially-checked";
    }
    return className;
  }

  // Group checkbox bulk-toggles its members. Deselecting also clears done.
  function handleGroupClick(group: GroupDef): void {
    const members = getGroupMembers(group);
    const fullySelected = isGroupFullySelected(group);
    app.fileManager.processFrontMatter(entry.file, (frontmatter) => {
      let activeList = asStringArray(frontmatter[propertyName]);
      let doneList = asStringArray(frontmatter[donePropertyName]);
      if (fullySelected) {
        const memberValues = new Set(members.map((m) => m.value));
        activeList = activeList.filter((value) => !memberValues.has(value));
        doneList = doneList.filter((value) => !memberValues.has(value));
      } else {
        members.forEach((member) => {
          if (!activeList.includes(member.value)) activeList.push(member.value);
        });
      }
      frontmatter[propertyName] = activeList;
      frontmatter[donePropertyName] = doneList;
    });
  }

  let summary = $derived.by(() => {
    const display = getSelectedTargetsDisplay();
    return display.trim() === "" ? "(none)" : display;
  });

  const noTargets = $derived(summary === "(none)");
</script>

<div class="target-dropdown" bind:this={rootEl}>
  <button
    class="dropdown-trigger"
    class:no-targets={noTargets}
    onclick={() => (isOpen = !isOpen)}
    aria-expanded={isOpen}
  >
    <b>{label}</b>
    <span class="trigger-summary">{summary}</span>
    <span class="trigger-caret">{isOpen ? "▲" : "▼"}</span>
  </button>

  {#if isOpen}
    <div class="dropdown-panel">
      {#if groups.length === 0}
        <div class="dropdown-empty">
          No targets configured. Set <code>md_targets_source_path</code> on the
          list note, or create <code>Meta/Targets.md</code>.
        </div>
      {/if}
      {#each groups as group (group.value)}
        {@const members = getGroupMembers(group)}
        {#if members.length > 0}
          <div class="group-section">
            <button
              class="group-header"
              onclick={() => handleGroupClick(group)}
            >
              <span class="checkbox-icon {getGroupCheckboxIconClass(group)}"
              ></span>
              <span class="group-label">{group.label}</span>
            </button>
            <div class="member-list">
              {#each members as target (target.value)}
                {@const state = getTargetState(target)}
                <div class="member-row" class:done={state === "done"}>
                  <button
                    class="member-checkbox"
                    onclick={() => toggleActive(target)}
                    aria-pressed={state !== "none"}
                    aria-label={state === "none"
                      ? "Add target"
                      : "Remove target"}
                  >
                    {state === "none" ? "☐" : "☑"}
                  </button>
                  <span class="member-label">{formatTarget(target)}</span>
                  <button
                    class="member-eye"
                    class:eye-done={state === "done"}
                    disabled={state === "none"}
                    onclick={() => toggleDone(target)}
                    aria-label={state === "done"
                      ? "Mark not done"
                      : "Mark done"}
                  >
                    👁️
                  </button>
                </div>
              {/each}
            </div>
          </div>
        {/if}
      {/each}
    </div>
  {/if}
</div>

<style>
  .target-dropdown {
    position: relative;
    margin-bottom: 0.5rem;
  }

  .dropdown-trigger {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    width: 100%;
    padding: 0.4rem 0.6rem;
    border: 1px solid var(--background-modifier-border);
    border-radius: 6px;
    background-color: var(--background-primary);
    color: var(--text-normal);
    cursor: pointer;
    font-size: 0.85rem;
    text-align: left;
    transition: background-color 0.15s;
  }

  .dropdown-trigger:hover {
    background-color: var(--background-modifier-hover);
  }

  .trigger-summary {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--text-normal);
  }

  .no-targets .trigger-summary {
    color: var(--text-muted);
  }

  .trigger-caret {
    color: var(--text-muted);
    font-size: 0.7rem;
  }

  .dropdown-panel {
    position: absolute;
    z-index: 30;
    top: calc(100% + 4px);
    left: 0;
    right: 0;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    max-height: 320px;
    overflow-y: auto;
    padding: 0.6rem;
    border: 1px solid var(--background-modifier-border);
    border-radius: 6px;
    background-color: var(--background-primary);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  }

  .dropdown-empty {
    font-size: 0.8rem;
    color: var(--text-muted);
  }

  .group-section {
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
  }

  .group-header {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.3rem 0.4rem;
    border: none;
    border-radius: 4px;
    background-color: var(--background-secondary);
    color: var(--text-normal);
    cursor: pointer;
    font-weight: 600;
    font-size: 0.85rem;
  }

  .group-header:hover {
    background-color: var(--background-modifier-hover);
  }

  .member-list {
    display: flex;
    flex-direction: column;
    gap: 0.1rem;
    padding-left: 0.4rem;
  }

  .member-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.15rem 0.3rem;
    border-radius: 4px;
  }

  .member-row:hover {
    background-color: var(--background-modifier-hover);
  }

  .member-row.done .member-label {
    opacity: 0.6;
  }

  .member-checkbox {
    background: none;
    border: none;
    box-shadow: none;
    padding: 0;
    cursor: pointer;
    font-size: 1.4rem;
    line-height: 1;
    color: var(--text-normal);
  }

  .member-label {
    flex: 1;
    font-size: 0.9rem;
  }

  .member-eye {
    background: none;
    border: none;
    box-shadow: none;
    padding: 0 0.2rem;
    cursor: pointer;
    font-size: 0.95rem;
    line-height: 1;
    opacity: 0.25;
    filter: grayscale(1);
    transition: opacity 0.15s;
  }

  .member-eye.eye-done {
    opacity: 1;
    filter: none;
  }

  .member-eye:disabled {
    visibility: hidden;
    cursor: default;
  }

  .checkbox-icon {
    width: 1rem;
    height: 1rem;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 4px;
    font-size: 0.9rem;
    line-height: 1;
  }

  .checkbox-icon-unchecked::before {
    content: "";
    width: 0.9rem;
    height: 0.9rem;
    border: 1px solid var(--background-modifier-border);
    border-radius: 100%;
    background-color: var(--background-primary);
    display: inline-block;
  }

  .checkbox-icon-checked::before {
    content: "🟢";
  }

  .checkbox-icon-partially-checked::before {
    content: "🟡";
  }
</style>
