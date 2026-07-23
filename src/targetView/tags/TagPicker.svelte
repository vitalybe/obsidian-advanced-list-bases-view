<script lang="ts">
  import { untrack } from "svelte";
  import { findExistingTag, hasTag, isValidTagName, tagKey } from "./tagModel";

  // Prop shape is declared inline rather than in tagComponentProps.ts: this
  // component performs no writes, reporting picks and creates up to EntryTags
  // via callbacks so every write funnels through that component's single
  // write-serialization queue (see EntryTags.svelte). EntryTags is the only
  // importer, so the contract only needs to hold between the two files.
  let {
    id,
    vocabulary,
    currentTags,
    anchorEl,
    onclose,
    ontoggle,
    oncreate,
  }: {
    id: string;
    vocabulary: string[];
    currentTags: string[];
    anchorEl: HTMLElement | null;
    onclose: () => void;
    ontoggle: (tag: string, applied: boolean) => void;
    oncreate: (name: string) => void;
  } = $props();

  let query = $state("");
  let panelEl = $state<HTMLDivElement>();
  let inputEl = $state<HTMLInputElement>();
  let panelPos = $state({ top: 0, left: 0 });
  let activeIndex = $state(0);
  let optionRefs: Record<string, HTMLElement> = {};

  // `id` is stable for the lifetime of this component instance, but derive
  // rather than const so Svelte doesn't warn about reading a prop outside a
  // reactive context.
  let listboxId = $derived(`${id}-listbox`);

  function idSafe(raw: string): string {
    return raw.replace(/\s+/g, "_").replace(/[^\w-]/g, "-");
  }

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

  const PANEL_MARGIN = 8;
  const PANEL_MIN_WIDTH = 220;

  // Anchored `position: fixed` from the trigger's rect. Deliberately does NOT
  // copy the trigger's width (it's a ~26px "+" pill) - min-width plus
  // anchoring `left` only. Flips above the trigger when there's no room
  // below but there is above, and clamps horizontally so it isn't cut off on
  // a narrow phone.
  function updatePanelPosition(): void {
    if (!anchorEl) return;
    const rect = anchorEl.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const width = panelEl?.offsetWidth ?? PANEL_MIN_WIDTH;
    const height = panelEl?.offsetHeight ?? 0;

    let left = rect.left;
    const maxLeft = vw - width - PANEL_MARGIN;
    if (left > maxLeft) left = maxLeft;
    if (left < PANEL_MARGIN) left = PANEL_MARGIN;

    const spaceBelow = vh - rect.bottom;
    const spaceAbove = rect.top;
    const fitsBelow = height === 0 || spaceBelow >= height + 4;
    const fitsAbove = spaceAbove >= height + 4;

    let top: number;
    if (!fitsBelow && fitsAbove) {
      top = rect.top - height - 4;
    } else {
      top = rect.bottom + 4;
    }
    if (top < PANEL_MARGIN) top = PANEL_MARGIN;

    panelPos = { top, left };
  }

  function isAnchorVisible(): boolean {
    if (!anchorEl) return false;
    const rect = anchorEl.getBoundingClientRect();
    return (
      rect.bottom > 0 &&
      rect.top < window.innerHeight &&
      rect.right > 0 &&
      rect.left < window.innerWidth
    );
  }

  // Keep the portaled panel anchored to the trigger while open. Capture
  // phase so scrolling any inner scroller (not just the window) repositions
  // us. If the anchor scrolls out of the viewport entirely, close instead of
  // floating over unrelated cards.
  $effect(() => {
    updatePanelPosition();
    const reposition = () => {
      if (!isAnchorVisible()) {
        onclose();
        return;
      }
      updatePanelPosition();
    };
    window.addEventListener("scroll", reposition, true);
    window.addEventListener("resize", reposition);
    return () => {
      window.removeEventListener("scroll", reposition, true);
      window.removeEventListener("resize", reposition);
    };
  });

  // Re-measure whenever the row count changes - the list growing/shrinking
  // as you type can change whether the panel still fits below the trigger.
  $effect(() => {
    void rows.length;
    updatePanelPosition();
  });

  // Do not autofocus on touch: it pops the virtual keyboard immediately,
  // covering the list before the user has seen it.
  $effect(() => {
    const canHover = window.matchMedia("(hover: hover)").matches;
    if (canHover) inputEl?.focus();
  });

  // Close on outside pointerdown (not click - Obsidian's mobile WebView
  // doesn't reliably bubble a click from taps on non-interactive body
  // regions, which would leave the panel stuck open). The panel lives in
  // <body>, so check both the anchor and the panel. Registration is
  // deferred one tick so the pointerdown that opened the picker doesn't
  // immediately close it.
  $effect(() => {
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (anchorEl?.contains(target)) return;
      if (panelEl?.contains(target)) return;
      onclose();
    };
    const timer = window.setTimeout(() => {
      document.addEventListener("pointerdown", onPointerDown);
    }, 0);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  });

  // Tab is not intercepted - close only when focus actually leaves the
  // panel for somewhere else. A null relatedTarget (common on mouse-driven
  // blur in some browsers) is ambiguous, so leave that to the pointerdown
  // outside-close above rather than double-handling it here.
  function handleFocusOut(event: FocusEvent): void {
    const related = event.relatedTarget as Node | null;
    if (related === null) return;
    if (panelEl?.contains(related)) return;
    onclose();
  }

  // Union of vocabulary and the note's own tags (orphans included),
  // vocabulary order first. `vocabulary` here is already the caller's
  // effective vocabulary (real + any not-yet-round-tripped creates).
  let allOptions = $derived.by(() => {
    const seen = new Set<string>();
    const result: string[] = [];
    for (const t of vocabulary) {
      const key = tagKey(t);
      if (seen.has(key)) continue;
      seen.add(key);
      result.push(t);
    }
    for (const t of currentTags) {
      const key = tagKey(t);
      if (seen.has(key)) continue;
      seen.add(key);
      result.push(t);
    }
    return result;
  });

  let normalizedQuery = $derived(query.trim());
  let existingMatch = $derived(
    normalizedQuery === "" ? undefined : findExistingTag(allOptions, normalizedQuery),
  );
  let showCreateRow = $derived(normalizedQuery !== "" && !existingMatch);
  let createIsValid = $derived(isValidTagName(normalizedQuery));

  // unapplied before applied, preserving relative (vocabulary-first) order.
  function partition(list: string[]): string[] {
    const unapplied = list.filter((t) => !hasTag(currentTags, t));
    const applied = list.filter((t) => hasTag(currentTags, t));
    return [...unapplied, ...applied];
  }

  // Substring match, not prefix-only (tags are compound like `deep-work`).
  // Ordered exact > prefix > other-substring, each bucket internally
  // unapplied-before-applied, vocabulary order preserved within a bucket.
  let filteredOptions = $derived.by(() => {
    const qKey = tagKey(query);
    if (qKey === "") return partition(allOptions);
    const matched = allOptions.filter((t) => tagKey(t).includes(qKey));
    const exact = matched.filter((t) => tagKey(t) === qKey);
    const prefix = matched.filter((t) => tagKey(t) !== qKey && tagKey(t).startsWith(qKey));
    const rest = matched.filter((t) => tagKey(t) !== qKey && !tagKey(t).startsWith(qKey));
    return [...partition(exact), ...partition(prefix), ...partition(rest)];
  });

  type OptionRow = { kind: "option"; tag: string; applied: boolean; id: string };
  type CreateRow = { kind: "create"; id: string };
  type Row = OptionRow | CreateRow;

  let rows = $derived.by(() => {
    const optionRows: Row[] = filteredOptions.map((tag) => ({
      kind: "option",
      tag,
      applied: hasTag(currentTags, tag),
      id: `${id}-opt-${idSafe(tagKey(tag))}`,
    }));
    if (showCreateRow) optionRows.push({ kind: "create", id: `${id}-create` });
    return optionRows;
  });

  let activeId = $derived(
    activeIndex >= 0 && activeIndex < rows.length ? rows[activeIndex].id : undefined,
  );

  // Never auto-highlight Create when a real match exists: default to the
  // best real match (index 0). Create only becomes the default when the
  // result list is otherwise empty - a reflexive Enter can then never fire
  // a create it didn't mean to.
  function resetActiveIndex(): void {
    untrack(() => {
      if (filteredOptions.length > 0) activeIndex = 0;
      else if (showCreateRow) activeIndex = 0;
      else activeIndex = -1;
    });
  }

  $effect(() => {
    void query;
    resetActiveIndex();
  });

  function scrollActiveIntoView(): void {
    const rowId = activeId;
    if (!rowId) return;
    optionRefs[rowId]?.scrollIntoView({ block: "nearest" });
  }

  function moveActive(delta: number): void {
    if (rows.length === 0) return;
    if (activeIndex < 0) {
      activeIndex = delta > 0 ? 0 : rows.length - 1;
    } else {
      activeIndex = (activeIndex + delta + rows.length) % rows.length;
    }
    scrollActiveIntoView();
  }

  function commitRow(row: Row): void {
    if (row.kind === "option") {
      ontoggle(row.tag, row.applied);
    } else {
      if (!createIsValid) return; // non-activating while invalid
      oncreate(normalizedQuery);
    }
    query = "";
    inputEl?.focus();
  }

  function commitActiveOrSingle(): void {
    if (activeIndex >= 0 && activeIndex < rows.length) {
      commitRow(rows[activeIndex]);
      return;
    }
    // Nothing highlighted: take the single result if there's exactly one,
    // otherwise never guess.
    if (rows.length === 1) commitRow(rows[0]);
  }

  function handleKeydown(event: KeyboardEvent): void {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      moveActive(1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      moveActive(-1);
    } else if (event.key === "Home") {
      event.preventDefault();
      if (rows.length > 0) {
        activeIndex = 0;
        scrollActiveIntoView();
      }
    } else if (event.key === "End") {
      event.preventDefault();
      if (rows.length > 0) {
        activeIndex = rows.length - 1;
        scrollActiveIntoView();
      }
    } else if (event.key === "Enter") {
      event.preventDefault();
      commitActiveOrSingle();
    } else if (event.key === "Escape") {
      // Also stopPropagation - otherwise Esc bubbles and Obsidian closes the
      // pane underneath.
      event.preventDefault();
      event.stopPropagation();
      onclose();
      anchorEl?.focus();
    } else if (event.key === "Backspace" && query === "") {
      // No-op: an empty query must never delete the last applied tag.
    }
  }
</script>

<div
  class="alb-tagpicker-panel"
  use:portal
  bind:this={panelEl}
  {id}
  style="top: {panelPos.top}px; left: {panelPos.left}px;"
  role="dialog"
  aria-label="Add tag"
  onfocusout={handleFocusOut}
>
  <input
    class="alb-tagpicker-input"
    type="text"
    role="combobox"
    aria-expanded="true"
    aria-controls={listboxId}
    aria-autocomplete="list"
    aria-activedescendant={activeId}
    placeholder="Add a tag..."
    autocapitalize="none"
    autocorrect="off"
    autocomplete="off"
    spellcheck="false"
    bind:value={query}
    bind:this={inputEl}
    onkeydown={handleKeydown}
  />
  <div class="alb-tagpicker-list" role="listbox" id={listboxId}>
    {#each rows as row, index (row.id)}
      {#if row.kind === "option"}
        <button
          type="button"
          id={row.id}
          role="option"
          tabindex="-1"
          aria-selected={index === activeIndex}
          class="alb-tagpicker-option"
          class:alb-tagpicker-option--active={index === activeIndex}
          class:alb-tagpicker-option--applied={row.applied}
          bind:this={optionRefs[row.id]}
          onmousedown={(event) => event.preventDefault()}
          onclick={() => commitRow(row)}
        >
          <span class="alb-tagpicker-option__check" aria-hidden="true"
            >{row.applied ? "☑" : ""}</span
          >
          <span class="alb-tagpicker-option__label">{row.tag}</span>
        </button>
      {:else}
        <div class="alb-tagpicker-separator" role="presentation"></div>
        <button
          type="button"
          id={row.id}
          role="option"
          tabindex="-1"
          aria-selected={index === activeIndex}
          aria-disabled={!createIsValid}
          class="alb-tagpicker-option alb-tagpicker-create"
          class:alb-tagpicker-option--active={index === activeIndex}
          class:alb-tagpicker-create--invalid={!createIsValid}
          bind:this={optionRefs[row.id]}
          onmousedown={(event) => event.preventDefault()}
          onclick={() => commitRow(row)}
        >
          <span class="alb-tagpicker-create__icon" aria-hidden="true">+</span>
          <span>Create "{normalizedQuery}"</span>
          {#if !createIsValid}
            <span class="alb-tagpicker-create__hint"
              >Tags need 2+ characters and no , # [ ] " ' or line breaks</span
            >
          {/if}
        </button>
      {/if}
    {/each}
    {#if rows.length === 0}
      <div class="alb-tagpicker-empty">
        {normalizedQuery ? "No matching tags" : "No tags yet - type to create one"}
      </div>
    {/if}
  </div>
</div>
