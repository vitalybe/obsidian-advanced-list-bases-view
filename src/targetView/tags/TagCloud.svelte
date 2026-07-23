<script lang="ts">
  import { buildTagCloud } from "./tagModel";
  import { setTagState } from "./tagWrites";
  import type { TagCloudProps } from "./tagComponentProps";
  import type { TagCloudItem } from "./tagTypes";

  let { app, listFile, vocabulary, entryTagLists, filters, onannounce }: TagCloudProps =
    $props();

  let cloud = $derived(buildTagCloud(vocabulary, entryTagLists, filters));

  // Click toggles include: neutral/exclude -> include, include -> neutral.
  // Wave 1 adds the full gesture set (e.g. a modifier or menu for exclude).
  function handleClick(item: TagCloudItem): void {
    if (!listFile) return;
    const next = item.state === "include" ? "neutral" : "include";
    setTagState(app, listFile, item.name, next);
    onannounce(
      next === "include"
        ? `Filtering to ${item.label}`
        : `Removed ${item.label} filter`,
    );
  }
</script>

<div class="alb-tag-cloud">
  {#each cloud as item (item.name)}
    <button
      type="button"
      class="alb-tag-pill"
      class:alb-tag-pill--zero={item.count === 0}
      class:alb-tag-pill--include={item.state === "include"}
      class:alb-tag-pill--exclude={item.state === "exclude"}
      class:alb-tag-pill--selected={item.state !== "neutral"}
      onclick={() => handleClick(item)}
      aria-pressed={item.state !== "neutral"}
    >
      {#if item.state === "include"}
        <span class="alb-tag-pill__icon" aria-hidden="true">✓</span>
      {:else if item.state === "exclude"}
        <span class="alb-tag-pill__icon" aria-hidden="true">⊘</span>
      {/if}
      <span class="alb-tag-pill__label">{item.label}</span>
      <span class="alb-tag-pill__count">{item.count}</span>
    </button>
  {/each}
</div>
