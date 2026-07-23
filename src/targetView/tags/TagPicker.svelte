<script lang="ts">
  import { findExistingTag, isValidTagName } from "./tagModel";
  import { addEntryTag, addToVocabulary } from "./tagWrites";
  import type { TagPickerProps } from "./tagComponentProps";

  let {
    app,
    file,
    listFile,
    vocabulary,
    currentTags,
    anchorEl,
    onclose,
    onannounce,
  }: TagPickerProps = $props();

  let query = $state("");
  let panelEl = $state<HTMLDivElement>();
  let inputEl = $state<HTMLInputElement>();
  let panelPos = $state({ top: 0, left: 0 });

  // Render the panel under <body> so it escapes the card's overflow:hidden,
  // mirroring GroupsAndTargetsSelector's portal action.
  function portal(node: HTMLElement): { destroy: () => void } {
    document.body.appendChild(node);
    return {
      destroy() {
        node.remove();
      },
    };
  }

  function updatePanelPosition(): void {
    if (!anchorEl) return;
    const rect = anchorEl.getBoundingClientRect();
    panelPos = { top: rect.bottom + 4, left: rect.left };
  }

  $effect(() => {
    updatePanelPosition();
    inputEl?.focus();
    const reposition = () => updatePanelPosition();
    window.addEventListener("scroll", reposition, true);
    window.addEventListener("resize", reposition);
    return () => {
      window.removeEventListener("scroll", reposition, true);
      window.removeEventListener("resize", reposition);
    };
  });

  // Close on outside click. The panel lives in <body>, so also check the
  // anchor (clicking the "+" trigger again should just let its own handler
  // toggle, not double-fire here).
  $effect(() => {
    const onDocClick = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      const inside = panelEl?.contains(target) || anchorEl?.contains(target);
      if (!inside) onclose();
    };
    // Defer registration one tick so the click that opened the picker
    // doesn't immediately close it.
    const timer = window.setTimeout(() => {
      document.addEventListener("click", onDocClick);
    }, 0);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("click", onDocClick);
    };
  });

  let filteredOptions = $derived.by(() => {
    const q = query.trim().toLowerCase();
    return vocabulary.filter((t) => {
      if (currentTags.some((c) => c.toLowerCase() === t.toLowerCase())) {
        return false;
      }
      return q === "" || t.toLowerCase().includes(q);
    });
  });

  let canCreate = $derived.by(() => {
    const trimmed = query.trim();
    return trimmed !== "" && !findExistingTag(vocabulary, trimmed) && isValidTagName(trimmed);
  });

  function pick(tag: string): void {
    addEntryTag(app, file, tag);
    onannounce(`Added ${tag} to ${file.basename}`);
    query = "";
    onclose();
  }

  function createNew(): void {
    const trimmed = query.trim();
    if (!isValidTagName(trimmed)) return;
    if (listFile) addToVocabulary(app, listFile, trimmed);
    addEntryTag(app, file, trimmed);
    onannounce(`Added ${trimmed} to ${file.basename}`);
    query = "";
    onclose();
  }

  function handleKeydown(event: KeyboardEvent): void {
    if (event.key === "Enter") {
      event.preventDefault();
      const existing = findExistingTag(vocabulary, query);
      if (existing) pick(existing);
      else if (canCreate) createNew();
    } else if (event.key === "Escape") {
      event.preventDefault();
      onclose();
    }
  }
</script>

<div
  class="alb-tagpicker-panel"
  use:portal
  bind:this={panelEl}
  style="top: {panelPos.top}px; left: {panelPos.left}px;"
  role="dialog"
  aria-label="Add tag"
>
  <input
    class="alb-tagpicker-input"
    type="text"
    placeholder="Add a tag..."
    bind:value={query}
    bind:this={inputEl}
    onkeydown={handleKeydown}
  />
  <div class="alb-tagpicker-list">
    {#each filteredOptions as tag (tag)}
      <button
        type="button"
        class="alb-tagpicker-option"
        onclick={() => pick(tag)}
      >
        {tag}
      </button>
    {/each}
    {#if canCreate}
      <button
        type="button"
        class="alb-tagpicker-option alb-tagpicker-create"
        onclick={createNew}
      >
        Create "{query.trim()}"
      </button>
    {/if}
    {#if filteredOptions.length === 0 && !canCreate}
      <div class="alb-tagpicker-empty">
        {query.trim() ? "No matching tags" : "No tags yet - type to create one"}
      </div>
    {/if}
  </div>
</div>
