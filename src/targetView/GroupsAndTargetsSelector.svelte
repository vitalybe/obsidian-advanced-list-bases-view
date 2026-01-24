<script lang="ts">
  import type { App, BasesEntry, BasesPropertyId, FrontMatterCache } from "obsidian";
  import { GroupsEnum, ALL_GROUPS, ALL_TARGETS, type DefinedTarget } from "./targetTypes";

  let {
    entry,
    app,
    propertyName = "md_targets",
    donePropertyName = "md_targets_done",
    label = "Targets:",
    initiallyExpanded = false,
  }: {
    entry: BasesEntry;
    app: App;
    propertyName?: string;
    donePropertyName?: string;
    label?: string;
    initiallyExpanded?: boolean;
  } = $props();

  // Internal expansion state - can be overridden by user
  let isExpanded = $state(false);
  let userHasInteracted = $state(false);

  // Update internal state when initiallyExpanded prop changes
  $effect(() => {
    // Only update if user hasn't manually interacted
    if (!userHasInteracted) {
      isExpanded = initiallyExpanded;
    }
  });

  function toggleExpansion() {
    userHasInteracted = true;
    isExpanded = !isExpanded;
  }

  function getEntryFileMetadata(entry: BasesEntry): FrontMatterCache | undefined {
    let metadata: FrontMatterCache | undefined;
    const entryFile = entry.file;
    metadata = app.metadataCache.getFileCache(entryFile) ?? undefined;
    return metadata;
  }

  function getEntryTargets(entry: BasesEntry): string[] {
    const entryFileMetadata = getEntryFileMetadata(entry);
    if (!entryFileMetadata) return [];
    const result = entryFileMetadata.frontmatter?.[propertyName] ?? [];
    return Array.isArray(result) ? result : [result];
  }

  function getEntryDoneTargets(entry: BasesEntry): string[] {
    const entryFileMetadata = getEntryFileMetadata(entry);
    if (!entryFileMetadata) return [];
    const result = entryFileMetadata.frontmatter?.[donePropertyName] ?? [];
    return Array.isArray(result) ? result : [result];
  }

  type TargetState = "none" | "active" | "done";

  function getTargetState(entry: BasesEntry, target: DefinedTarget): TargetState {
    const targets = getEntryTargets(entry);
    const doneTargets = getEntryDoneTargets(entry);

    if (doneTargets.includes(target.value)) {
      return "done";
    } else if (targets.includes(target.value)) {
      return "active";
    } else {
      return "none";
    }
  }

  function getTargetValue(entry: BasesEntry, target: DefinedTarget): boolean {
    const targets = getEntryTargets(entry);
    return targets.includes(target.value);
  }

  function formatTarget(target: DefinedTarget): string {
    return `${target.icon} ${target.value}`;
  }

  function getSelectedTargetsDisplay(): string {
    const activeTargets = getEntryTargets(entry).map((entryTarget) => {
      const target = ALL_TARGETS.find((t) => t.value === entryTarget);
      return target ? formatTarget(target) : entryTarget;
    });

    const doneTargets = getEntryDoneTargets(entry).map((entryTarget) => {
      const target = ALL_TARGETS.find((t) => t.value === entryTarget);
      const formatted = target ? formatTarget(target) : entryTarget;
      return `👁️ ${formatted}`;
    });

    return [...activeTargets, ...doneTargets].join(", ");
  }

  function handleTargetChange(entry: BasesEntry, target: DefinedTarget) {
    // Mark as user-interacted to prevent auto-collapse
    userHasInteracted = true;
    // Auto-expand if collapsed when user modifies targets
    if (!isExpanded) {
      isExpanded = true;
    }

    const currentState = getTargetState(entry, target);

    app.fileManager.processFrontMatter(entry.file, (frontmatter) => {
      const targets = (frontmatter[propertyName] as string[]) ?? [];
      const doneTargets = (frontmatter[donePropertyName] as string[]) ?? [];

      // Cycle through states: none → active → done → none
      if (currentState === "none") {
        // Add to active targets
        if (!targets.includes(target.value)) {
          targets.push(target.value);
        }
      } else if (currentState === "active") {
        // Move from active to done
        if (!doneTargets.includes(target.value)) {
          doneTargets.push(target.value);
        }
      } else if (currentState === "done") {
        // Remove from done (back to none)
        const indexTargets = targets.indexOf(target.value);
        if (indexTargets > -1) {
          targets.splice(indexTargets, 1);
        }

        const indexDoneTargets = doneTargets.indexOf(target.value);
        if (indexDoneTargets > -1) {
          doneTargets.splice(indexDoneTargets, 1);
        }
      }

      console.log("targets", targets, "doneTargets", doneTargets);
      frontmatter[propertyName] = targets;
      frontmatter[donePropertyName] = doneTargets;
    });
  }

  function getGroupMembers(group: GroupsEnum) {
    return ALL_TARGETS.filter((target) => target.groups.includes(group));
  }

  function isGroupFullySelected(entry: BasesEntry, group: GroupsEnum): boolean {
    const members = getGroupMembers(group);
    if (members.length === 0) return false;
    return members.every((member) => getTargetValue(entry, member));
  }

  function handleGroupClick(entry: BasesEntry, group: GroupsEnum) {
    // Mark as user-interacted to prevent auto-collapse
    userHasInteracted = true;
    // Auto-expand if collapsed when user modifies targets
    if (!isExpanded) {
      isExpanded = true;
    }

    const members = getGroupMembers(group);
    const isFullySelected = isGroupFullySelected(entry, group);

    app.fileManager.processFrontMatter(entry.file, (frontmatter) => {
      let targets = (frontmatter[propertyName] as string[]) ?? [];

      if (isFullySelected) {
        targets = targets.filter((t) => !members.some((m) => m.value === t));
      } else {
        members.forEach((member) => {
          if (!targets.includes(member.value)) {
            targets.push(member.value);
          }
        });
      }

      frontmatter[propertyName] = targets;
    });
  }

  function getGroupCheckboxIconClass(entry: BasesEntry, group: GroupsEnum): string {
    let className = "checkbox-icon-unchecked";
    if (isGroupFullySelected(entry, group)) {
      className = "checkbox-icon-checked";
    } else if (getGroupMembers(group).some((member) => getTargetValue(entry, member))) {
      className = "checkbox-icon-partially-checked";
    }
    return className;
  }

  let minimizedDisplayedTargets = $derived.by(() => {
    const display = getSelectedTargetsDisplay();
    return display.trim() === "" ? "(none)" : display;
  });

  const noTargets = $derived(minimizedDisplayedTargets === "(none)");
</script>

<div class="target-container">
  <button class="toggle-targets-btn" class:no-targets={noTargets} onclick={toggleExpansion}>
    {isExpanded ? "▲" : " ▼"}
    <b>{label}</b>
    <span>{minimizedDisplayedTargets}</span>
  </button>
  {#if isExpanded}
    <div class="groups-container">
      {#each ALL_GROUPS as group}
        <div class="groups-row">
          <div class="targets-row">
            <button class="btn-regular" onclick={() => handleGroupClick(entry, group.value)}>
              <div class="checkbox-icon {getGroupCheckboxIconClass(entry, group.value)}"></div>
              <span>{group.label}</span>
            </button>
            {#each getGroupMembers(group.value) as target}
              {@const targetState = getTargetState(entry, target)}
              <label class="checkbox-label" class:done={targetState === "done"}>
                <button
                  class="target-icon-btn"
                  onclick={() => handleTargetChange(entry, target)}
                  aria-label={targetState === "none" ? "Mark as active" : targetState === "active" ? "Mark as done" : "Remove"}
                >
                  {#if targetState === "none"}
                    <span class="target-icon-empty">☐</span>
                  {:else if targetState === "active"}
                    <span class="target-icon-active">☑</span>
                  {:else}
                    <span class="target-icon-done">👁️</span>
                  {/if}
                </button>
                <span>{formatTarget(target)}</span>
              </label>
            {/each}
          </div>
        </div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .target-container {
    background-color: hsl(180, 0%, 97%);
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    margin-bottom: 0.5rem;
    border: 1px solid var(--background-modifier-border);
    border-radius: 6px;
    padding: 0.75rem;
    box-shadow: 1px 1px 4px rgba(0, 0, 0, 0.05);
  }

  .toggle-targets-btn {
    align-self: flex-start;
    display: flex;
    gap: 0.2rem;
    padding: 0.3rem 0.6rem;
    border: 1px solid var(--background-modifier-border);
    border-radius: 4px;
    background-color: var(--background-primary);
    color: var(--text-muted);
    cursor: pointer;
    font-size: 0.85rem;
    transition: all 0.2s;
  }

  .toggle-targets-btn:hover {
    background-color: var(--background-modifier-hover);
    color: var(--text-normal);
  }

  .toggle-targets-btn:active {
    transform: scale(0.98);
  }

  .no-targets {
    color: var(--text-muted);
  }

  .groups-container {
    display: flex;
    flex-direction: row;
    gap: 1rem;
  }

  .groups-row {
    display: flex;
    flex-direction: row;
    gap: 1rem;
    flex-wrap: wrap;
  }

  .targets-row {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    flex-wrap: wrap;
  }

  .checkbox-label {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    cursor: pointer;
    user-select: none;
  }

  .checkbox-label.done {
    opacity: 0.7;
  }

  .target-icon-btn {
    height: 14px;
    width: 14px;
    background: none;
    border: none;
    cursor: pointer;
    padding: 0;
    border: none;
    background: none;
    box-shadow: none;
    border: none;
    font-size: 1rem;
    line-height: 1;
    transition: transform 0.1s;
  }

  .target-icon-empty {
    font-size: 1.8rem;
  }

  .target-icon-active {
    font-size: 1.6rem;
  }

  .target-icon-done {
    font-size: 1rem;
  }

  .btn-regular {
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
    background-color: var(--background-modifier-border);
    color: var(--text-normal);
  }

  .checkbox-icon {
    border: 1px solid var(--background-modifier-border);
    border-radius: 4px;
  }

  .checkbox-icon-unchecked::before {
    content: "";
    background-color: hsla(0, 0%, 100%, 0.6);
    border: 1px solid white;
    width: 1rem;
    height: 1rem;
    border-radius: 100%;
    display: inline-block;
  }

  .checkbox-icon-checked::before {
    content: "🟢";
    color: var(--text-on-accent);
  }

  .checkbox-icon-partially-checked {
    background-color: var(--background-modifier-border);
  }

  .checkbox-icon-partially-checked::before {
    content: "🟡";
    color: var(--text-normal);
  }
</style>
