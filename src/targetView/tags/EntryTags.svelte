<script lang="ts">
  import { Notice, type TFile } from "obsidian";
  import TagPicker from "./TagPicker.svelte";
  import { TAGS_PROPERTY, LIST_TAGS_PROPERTY } from "./tagTypes";
  import {
    findExistingTag,
    hasTag,
    isValidTagName,
    normalizeTagInput,
    normalizeTagList,
    sameTag,
    tagKey,
  } from "./tagModel";
  import type { EntryTagsProps } from "./tagComponentProps";

  // Tags arrive as a prop, derived upstream from the metadata cache. Do NOT
  // register a metadataCache.on listener here - with N cards each already
  // carrying a GroupsAndTargetsSelector listener, N more would matter on
  // mobile. Writes round-trip: write -> metadataCache "changed" -> parent
  // bumps its counter -> new `tags`/`vocabulary` props land here.
  let { app, entry, listFile, tags, vocabulary, onannounce }: EntryTagsProps =
    $props();

  let pickerOpen = $state(false);
  let addButtonEl = $state<HTMLButtonElement>();

  function idSafe(raw: string): string {
    return raw.replace(/\s+/g, "_").replace(/[^\w-]/g, "-");
  }

  // `entry` is stable for the lifetime of this component instance (keyed by
  // entry.file.path in targetView.svelte's #each), but derive rather than
  // const so Svelte doesn't warn about reading a prop outside a reactive
  // context.
  let pickerId = $derived(`alb-tagpicker-${idSafe(entry.file.path)}`);

  // -------------------------------------------------------------------
  // Write serialization.
  //
  // A stay-open panel lets a user fire several writes to this file within
  // one gesture (pick, pick, create). `processFrontMatter` is async, and
  // concurrent calls on the same file can clobber each other, so every
  // write below funnels through this single promise chain.
  //
  // tagWrites.ts's addEntryTag/removeEntryTag/addToVocabulary are typed
  // `: void` and never `return` the processFrontMatter call, so there is no
  // promise to chain on if they're called directly - awaiting their result
  // resolves immediately regardless of whether the actual write finished,
  // which would defeat serialization entirely. The three helpers below
  // reimplement the exact same read-modify-write logic (same tagModel
  // helpers, same TAGS_PROPERTY/LIST_TAGS_PROPERTY keys) but return the
  // real completion promise so `enqueue` can serialize on it.
  // -------------------------------------------------------------------
  let writeQueue: Promise<void> = Promise.resolve();
  function enqueue(op: () => Promise<void>): void {
    writeQueue = writeQueue.then(op).catch((e) => console.error("[EntryTags]", e));
  }

  function writeAddEntryTag(tag: string): Promise<void> {
    const normalized = normalizeTagInput(tag);
    if (normalized === null || !isValidTagName(normalized)) return Promise.resolve();
    return app.fileManager.processFrontMatter(entry.file, (fm) => {
      const current = normalizeTagList(fm[TAGS_PROPERTY]);
      if (hasTag(current, normalized)) return;
      current.push(normalized);
      fm[TAGS_PROPERTY] = current;
    });
  }

  function writeRemoveEntryTag(tag: string): Promise<void> {
    return app.fileManager.processFrontMatter(entry.file, (fm) => {
      const current = normalizeTagList(fm[TAGS_PROPERTY]);
      if (!hasTag(current, tag)) return;
      fm[TAGS_PROPERTY] = current.filter((t) => !sameTag(t, tag));
    });
  }

  function writeAddToVocabulary(target: TFile, tag: string): Promise<void> {
    const normalized = normalizeTagInput(tag);
    if (normalized === null || !isValidTagName(normalized)) return Promise.resolve();
    return app.fileManager.processFrontMatter(target, (fm) => {
      const current = normalizeTagList(fm[LIST_TAGS_PROPERTY]);
      if (hasTag(current, normalized)) return;
      current.push(normalized);
      fm[LIST_TAGS_PROPERTY] = current;
    });
  }

  // Vocabulary the parent hasn't caught up to yet (a Create just landed).
  // Unioned into what the picker sees so the just-created tag doesn't
  // briefly render as an orphan; self-heals once `vocabulary` includes it.
  let pendingVocabAdds = $state<string[]>([]);

  $effect(() => {
    const real = vocabulary;
    if (pendingVocabAdds.length === 0) return;
    const stillPending = pendingVocabAdds.filter(
      (t) => !real.some((v) => sameTag(v, t)),
    );
    if (stillPending.length !== pendingVocabAdds.length) {
      pendingVocabAdds = stillPending;
    }
  });

  let effectiveVocabulary = $derived.by(() => {
    if (pendingVocabAdds.length === 0) return vocabulary;
    const seen = new Set(vocabulary.map((t) => tagKey(t)));
    const extra = pendingVocabAdds.filter((t) => !seen.has(tagKey(t)));
    return extra.length === 0 ? vocabulary : [...vocabulary, ...extra];
  });

  // Removing a tag that currently holds focus must not strand the focus
  // ring - move focus to the "+" trigger first.
  function handleRemove(tag: string, event: MouseEvent): void {
    const btn = event.currentTarget as HTMLElement | null;
    if (btn && document.activeElement === btn) {
      addButtonEl?.focus();
    }
    enqueue(() => writeRemoveEntryTag(tag));
    onannounce(`Removed ${tag} from ${entry.file.basename}`);
  }

  // Shared by the picker's plain rows (apply) and its already-applied ☑
  // rows (toggle off) - a single choke point so both paths serialize
  // through the same queue as the pill's own remove button.
  function handleToggle(tag: string, applied: boolean): void {
    if (applied) {
      enqueue(() => writeRemoveEntryTag(tag));
      onannounce(`Removed ${tag} from ${entry.file.basename}`);
    } else {
      enqueue(() => writeAddEntryTag(tag));
      onannounce(`Added ${tag} to ${entry.file.basename}`);
    }
  }

  function handleCreate(name: string): void {
    const normalized = normalizeTagInput(name);
    if (normalized === null || !isValidTagName(normalized)) return;

    // Collision guard: reuse an existing tag rather than forking the
    // vocabulary (`work` typed against an existing `Work` should apply
    // `Work`). TagPicker already keeps this case out of its own Create
    // affordance; this is a defensive second check.
    const existing =
      findExistingTag(effectiveVocabulary, normalized) ??
      findExistingTag(tags, normalized);
    if (existing) {
      handleToggle(existing, hasTag(tags, existing));
      return;
    }

    if (listFile) {
      pendingVocabAdds = [...pendingVocabAdds, normalized];
      // Vocabulary first, then the entry tag - so a re-render mid-flight
      // never shows the new tag as a (vocabulary-less) orphan.
      enqueue(() => writeAddToVocabulary(listFile, normalized));
      enqueue(() => writeAddEntryTag(normalized));
      onannounce(`Created ${normalized} and added it to ${entry.file.basename}`);
    } else {
      enqueue(() => writeAddEntryTag(normalized));
      onannounce(`Added ${normalized} to ${entry.file.basename}`);
      new Notice(
        `Added "${normalized}" to ${entry.file.basename}, but couldn't add it to the list's tag vocabulary - no active list note.`,
      );
    }
  }
</script>

<div class="alb-tag-section">
  <label
    class="alb-tag-section__label"
    for={`${entry.file.path}-md_tags`}>Tags</label
  >
  <div class="alb-entrytags-row" id={`${entry.file.path}-md_tags`}>
    {#each tags as tag (tag)}
      <span class="alb-tag-pill alb-tag-pill--selected alb-entrytags-pill">
        <span class="alb-tag-pill__label">{tag}</span>
        <button
          type="button"
          class="alb-entrytags-remove"
          aria-label={`Remove tag ${tag}`}
          onclick={(event) => handleRemove(tag, event)}
        >
          ×
        </button>
      </span>
    {/each}
    <button
      type="button"
      class="alb-tag-pill alb-entrytags-add"
      bind:this={addButtonEl}
      onclick={() => (pickerOpen = !pickerOpen)}
      aria-label="Add tag"
      aria-haspopup="dialog"
      aria-expanded={pickerOpen}
      aria-controls={pickerId}
    >
      +
    </button>
    {#if pickerOpen}
      <TagPicker
        id={pickerId}
        vocabulary={effectiveVocabulary}
        currentTags={tags}
        anchorEl={addButtonEl ?? null}
        onclose={() => (pickerOpen = false)}
        ontoggle={handleToggle}
        oncreate={handleCreate}
      />
    {/if}
  </div>
</div>
