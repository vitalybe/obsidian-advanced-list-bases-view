<script lang="ts">
  import { Menu, setTooltip } from "obsidian";
  import { buildTagCloud, countActiveTagFilters } from "./tagModel";
  import { setTagState, clearTagFilters } from "./tagWrites";
  import type { TagCloudProps } from "./tagComponentProps";
  import type { TagCloudItem, TagState } from "./tagTypes";

  let { app, listFile, vocabulary, entryTagLists, filters, onannounce }: TagCloudProps =
    $props();

  let cloud = $derived(buildTagCloud(vocabulary, entryTagLists, filters));
  let activeFilterCount = $derived(countActiveTagFilters(filters));

  // Overflow: collapse to a default item count (never a CSS row clamp - row
  // count isn't knowable without a ResizeObserver + per-pill offsetTop
  // measurement). When collapsed, active (non-neutral) items are always
  // promoted to the front so an active filter can never hide behind the
  // fold, even if that means showing more than DEFAULT_VISIBLE items.
  // `expanded` is ephemeral component state - never persisted.
  const DEFAULT_VISIBLE = 12;
  let expanded = $state(false);

  let activeItems = $derived(cloud.filter((item) => item.state !== "neutral"));
  let neutralItems = $derived(cloud.filter((item) => item.state === "neutral"));
  let collapseThreshold = $derived(Math.max(DEFAULT_VISIBLE, activeItems.length));

  let visibleItems = $derived(
    expanded || cloud.length <= collapseThreshold
      ? cloud
      : [...activeItems, ...neutralItems].slice(0, collapseThreshold),
  );
  let hiddenCount = $derived(cloud.length - visibleItems.length);
  let showOverflowChip = $derived(
    cloud.length > DEFAULT_VISIBLE && (expanded || hiddenCount > 0),
  );

  // Long-press (touch) detection, mirroring EditableTextarea's pattern:
  // 500ms hold opens the same Menu as right-click; moving the finger before
  // then cancels it so it doesn't fight scrolling.
  let longPressTimer: number | undefined;
  let longPressFired = false;

  function clearLongPressTimer(): void {
    if (longPressTimer !== undefined) {
      window.clearTimeout(longPressTimer);
      longPressTimer = undefined;
    }
  }

  function handleTouchStart(event: TouchEvent, item: TagCloudItem): void {
    if (!listFile) return;
    const touch = event.touches[0];
    const x = touch?.clientX ?? 0;
    const y = touch?.clientY ?? 0;
    longPressFired = false;
    longPressTimer = window.setTimeout(() => {
      longPressFired = true;
      openMenu(item, { x, y });
    }, 500);
  }

  function handleTouchEnd(): void {
    clearLongPressTimer();
  }

  function handleTouchMove(): void {
    clearLongPressTimer();
  }

  function announceState(item: TagCloudItem, next: TagState): void {
    if (next === "include") onannounce(`${item.label} included`);
    else if (next === "exclude") onannounce(`${item.label} excluded`);
    else onannounce(`${item.label} filter cleared`);
  }

  // Left click / Enter / Space: toggle include. neutral/exclude -> include,
  // include -> neutral. Exclude is reachable only through the menu.
  function handleClick(item: TagCloudItem): void {
    if (!listFile) return;
    if (longPressFired) {
      // A long-press already opened the menu for this gesture; swallow the
      // synthesized click that follows touchend so it doesn't also toggle.
      longPressFired = false;
      return;
    }
    const next: TagState = item.state === "include" ? "neutral" : "include";
    setTagState(app, listFile, item.name, next);
    announceState(item, next);
  }

  function applyMenuState(item: TagCloudItem, next: TagState): void {
    if (!listFile) return;
    setTagState(app, listFile, item.name, next);
    announceState(item, next);
  }

  function openMenu(item: TagCloudItem, at: MouseEvent | { x: number; y: number }): void {
    if (!listFile) return;
    const menu = new Menu();
    menu.addItem((mi) =>
      mi
        .setTitle("Include only")
        .setChecked(item.state === "include")
        .onClick(() => applyMenuState(item, "include")),
    );
    menu.addItem((mi) =>
      mi
        .setTitle("Exclude")
        .setChecked(item.state === "exclude")
        .onClick(() => applyMenuState(item, "exclude")),
    );
    menu.addSeparator();
    menu.addItem((mi) =>
      mi
        .setTitle("Clear")
        .setDisabled(item.state === "neutral")
        .onClick(() => applyMenuState(item, "neutral")),
    );
    if (at instanceof MouseEvent) {
      menu.showAtMouseEvent(at);
    } else {
      menu.showAtPosition(at);
    }
  }

  // Right click, the ContextMenu key, and Shift+F10 all dispatch a native
  // "contextmenu" event at the focused/clicked element - no separate keydown
  // handling needed. preventDefault so mobile Safari's native text-selection
  // callout doesn't also fire on a long-press-triggered contextmenu.
  function handleContextMenu(event: MouseEvent, item: TagCloudItem): void {
    event.preventDefault();
    if (!listFile) return;
    if (longPressFired) {
      longPressFired = false;
      return;
    }
    openMenu(item, event);
  }

  function handleClear(): void {
    if (!listFile) return;
    clearTagFilters(app, listFile);
    onannounce("Tag filters cleared");
  }

  function accessibleName(item: TagCloudItem): string {
    const noun = item.count === 1 ? "note" : "notes";
    const stateText =
      item.state === "include"
        ? "included in filter"
        : item.state === "exclude"
          ? "excluded from filter"
          : "not filtered";
    return `${item.label}, ${item.count} ${noun}, ${stateText}`;
  }

  function tooltipText(item: TagCloudItem): string {
    const noun = item.count === 1 ? "note" : "notes";
    const clickHint = item.state === "include" ? "Click to remove filter" : "Click to include";
    return `${item.label} · ${item.count} ${noun} · ${clickHint}, right-click for options`;
  }

  const DISABLED_REASON = "Open this list note to change tag filters";

  // Native title (not Obsidian's setTooltip) so the disabled explanation is
  // always available, even if setTooltip declines to attach to a disabled
  // button in some environment.
  function tooltip(node: HTMLElement, text: string | undefined): { update(t: string | undefined): void } {
    if (text) setTooltip(node, text);
    return {
      update(newText: string | undefined): void {
        if (newText) setTooltip(node, newText);
      },
    };
  }
</script>

<div class="alb-tag-cloud" role="group" aria-label="Tag filters">
  {#each visibleItems as item (item.name)}
    <button
      type="button"
      class="alb-tag-pill"
      class:alb-tagcloud-untagged={item.isUntagged}
      class:alb-tag-pill--zero={item.count === 0}
      class:alb-tag-pill--include={item.state === "include"}
      class:alb-tag-pill--exclude={item.state === "exclude"}
      class:alb-tag-pill--selected={item.state !== "neutral"}
      disabled={!listFile}
      aria-disabled={listFile ? undefined : "true"}
      aria-haspopup="menu"
      aria-label={accessibleName(item)}
      title={listFile ? undefined : DISABLED_REASON}
      use:tooltip={listFile ? tooltipText(item) : undefined}
      onclick={() => handleClick(item)}
      oncontextmenu={(event) => handleContextMenu(event, item)}
      ontouchstart={(event) => handleTouchStart(event, item)}
      ontouchend={handleTouchEnd}
      ontouchmove={handleTouchMove}
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

  {#if showOverflowChip}
    <button
      type="button"
      class="alb-tag-pill alb-tagcloud-more-chip"
      aria-expanded={expanded}
      onclick={() => (expanded = !expanded)}
    >
      {expanded ? "Show less" : `+${hiddenCount} more`}
    </button>
  {/if}

  {#if activeFilterCount > 0}
    <button
      type="button"
      class="alb-tag-pill alb-tagcloud-clear-chip"
      disabled={!listFile}
      aria-disabled={listFile ? undefined : "true"}
      onclick={handleClear}
    >
      ✕ Clear ({activeFilterCount})
    </button>
  {/if}
</div>
