<script lang="ts">
  import type { App, BasesEntry, BasesPropertyId, FrontMatterCache } from "obsidian";

  export let entry: BasesEntry;
  export let app: App;

  enum GroupsEnum {
    KIDS = "Kids",
    ANIMALS = "Animals",
    ADULTS = "Adults",
  }

  interface DefinedTarget {
    value: string;
    icon: string;
    groups: GroupsEnum[];
  }

  const ALL_GROUPS = [
    { value: GroupsEnum.KIDS, label: "Kids" },
    { value: GroupsEnum.ANIMALS, label: "Animals" },
    { value: GroupsEnum.ADULTS, label: "Adults" },
  ];

  const ALL_TARGETS = [
    { value: "Eli", icon: "👦🏻", groups: [GroupsEnum.KIDS, GroupsEnum.ANIMALS] },
    { value: "Emily", icon: "👧🏽", groups: [GroupsEnum.KIDS, GroupsEnum.ANIMALS] },
    { value: "Lia", icon: "👧🏼", groups: [GroupsEnum.KIDS, GroupsEnum.ANIMALS] },
    { value: "Inga", icon: "👸🏻", groups: [GroupsEnum.ADULTS] },
    { value: "Esty", icon: "🌸", groups: [GroupsEnum.ADULTS, GroupsEnum.ANIMALS] },
    { value: "Pub", icon: "🍺", groups: [GroupsEnum.ADULTS] },
    { value: "Vitaly", icon: "👨🏻", groups: [GroupsEnum.ADULTS] },
  ];

  const TARGETS_PROPERTY = "md_targets";

  function getEntryFileMetadata(entry: BasesEntry): FrontMatterCache | undefined {
    let metadata: FrontMatterCache | undefined;
    const entryFile = entry.file;
    metadata = app.metadataCache.getFileCache(entryFile) ?? undefined;
    return metadata;
  }

  function getEntryTargets(entry: BasesEntry): string[] {
    const entryFileMetadata = getEntryFileMetadata(entry);
    if (!entryFileMetadata) return [];
    return entryFileMetadata.frontmatter?.[TARGETS_PROPERTY] ?? [];
  }

  function getTargetValue(entry: BasesEntry, target: DefinedTarget): boolean {
    const targets = getEntryTargets(entry);
    return targets.includes(target.value);
  }

  function formatTarget(target: DefinedTarget): string {
    return `${target.icon} ${target.value}`;
  }

  function handleTargetChange(entry: BasesEntry, target: DefinedTarget) {
    app.fileManager.processFrontMatter(entry.file, (frontmatter) => {
      const targets = (frontmatter[TARGETS_PROPERTY] as string[]) ?? [];
      const index = targets.indexOf(target.value);
      if (index > -1) {
        targets.splice(index, 1);
      } else {
        targets.push(target.value);
      }
      frontmatter[TARGETS_PROPERTY] = targets;
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
    const members = getGroupMembers(group);
    const isFullySelected = isGroupFullySelected(entry, group);

    app.fileManager.processFrontMatter(entry.file, (frontmatter) => {
      let targets = (frontmatter[TARGETS_PROPERTY] as string[]) ?? [];

      if (isFullySelected) {
        targets = targets.filter((t) => !members.some((m) => m.value === t));
      } else {
        members.forEach((member) => {
          if (!targets.includes(member.value)) {
            targets.push(member.value);
          }
        });
      }

      frontmatter[TARGETS_PROPERTY] = targets;
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
</script>

<div class="groups-container">
  {#each ALL_GROUPS as group}
    <div class="groups-row">
      <div class="targets-row">
        <button class="btn-regular" on:click={() => handleGroupClick(entry, group.value)}>
          <div class="checkbox-icon {getGroupCheckboxIconClass(entry, group.value)}" />
          <span>{group.label}</span>
        </button>
        {#each getGroupMembers(group.value) as target}
          <label class="checkbox-label">
            <input
              type="checkbox"
              checked={getTargetValue(entry, target)}
              on:change={() => handleTargetChange(entry, target)}
            />
            <span>{formatTarget(target)}</span>
          </label>
        {/each}
      </div>
    </div>
  {/each}
</div>

<style>
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
