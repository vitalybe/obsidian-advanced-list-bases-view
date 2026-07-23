<script lang="ts">
  import TagPicker from "./TagPicker.svelte";
  import { removeEntryTag } from "./tagWrites";
  import type { EntryTagsProps } from "./tagComponentProps";

  // Tags arrive as a prop, derived upstream from the metadata cache. Do NOT
  // register a metadataCache.on listener here - with N cards each already
  // carrying a GroupsAndTargetsSelector listener, N more would matter on
  // mobile.
  let { app, entry, listFile, tags, vocabulary, onannounce }: EntryTagsProps =
    $props();

  let pickerOpen = $state(false);
  let addButtonEl = $state<HTMLButtonElement>();

  function handleRemove(tag: string): void {
    removeEntryTag(app, entry.file, tag);
    onannounce(`Removed ${tag} from ${entry.file.basename}`);
  }
</script>

<div class="alb-tag-section property">
  <label
    class="alb-tag-section__label property-label"
    for={`${entry.file.path}-md_tags`}>Tags</label
  >
  <div class="alb-entrytags-row" id={`${entry.file.path}-md_tags`}>
    {#each tags as tag (tag)}
      <button
        type="button"
        class="alb-tag-pill alb-tag-pill--selected"
        onclick={() => handleRemove(tag)}
        aria-label={`Remove tag ${tag}`}
      >
        <span class="alb-tag-pill__label">{tag}</span>
      </button>
    {/each}
    <button
      type="button"
      class="alb-tag-pill alb-entrytags-add"
      bind:this={addButtonEl}
      onclick={() => (pickerOpen = !pickerOpen)}
      aria-label="Add tag"
      aria-haspopup="dialog"
      aria-expanded={pickerOpen}
    >
      +
    </button>
    {#if pickerOpen}
      <TagPicker
        {app}
        file={entry.file}
        {listFile}
        {vocabulary}
        currentTags={tags}
        anchorEl={addButtonEl ?? null}
        onclose={() => (pickerOpen = false)}
        {onannounce}
      />
    {/if}
  </div>
</div>
