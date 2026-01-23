<script lang="ts">
  import { RenderContext, Value, Component, MarkdownRenderer } from "obsidian";

  interface Props {
    renderContext: RenderContext;

    id: string;
    value?: Value;
    onchange: (newValue: string) => void;
  }

  let props: Props = $props();
  let isEditMode = $state(false);
  let textareaElement = $state<HTMLTextAreaElement>();
  let longPressTimer: number | undefined;
  let component = new Component();

  function getTextAreaRowsCount(content: string | undefined): number {
    if (!content) return 1;

    const newLines = (content.match(/\n/g) || []).length;
    const linesPerContent = content.length / 50 + 1;
    return Math.max(linesPerContent, newLines, 1);
  }

  function enterEditMode() {
    isEditMode = true;
    // Focus the textarea after it's rendered
    setTimeout(() => {
      if (textareaElement) {
        textareaElement.focus();
      }
    }, 0);
  }

  function exitEditMode(event: FocusEvent) {
    isEditMode = false;
    const newValue = (event.target as HTMLTextAreaElement).value;
    props.onchange(newValue);
  }

  function handleDoubleClick() {
    enterEditMode();
  }

  function handleTouchStart() {
    longPressTimer = window.setTimeout(() => {
      enterEditMode();
    }, 500);
  }

  function handleTouchEnd() {
    if (longPressTimer) {
      clearTimeout(longPressTimer);
      longPressTimer = undefined;
    }
  }

  function handleTouchMove() {
    // Cancel long press if user moves their finger
    if (longPressTimer) {
      clearTimeout(longPressTimer);
      longPressTimer = undefined;
    }
  }

  async function renderPropertyValue(element: HTMLElement, value: Value | undefined) {
    const renderMarkdown = async (val: Value | undefined) => {
      element.empty();

      if (!val || !props.renderContext) {
        element.setText("");
        return;
      }

      const markdownText = val.toString();

      if (!markdownText || markdownText.trim() === "") {
        element.setText("(empty)");
        return;
      }

      // Render markdown using Obsidian's MarkdownRenderer
      await MarkdownRenderer.render(
        props.renderContext.app,
        markdownText,
        element,
        props.renderContext.sourcePath,
        component
      );
    };

    await renderMarkdown(value);

    return {
      async update(newValue: any) {
        await renderMarkdown(newValue);
      },
      destroy() {
        element.empty();
      },
    };
  }
</script>

{#if isEditMode}
  <textarea
    bind:this={textareaElement}
    id={props.id}
    class="property-input"
    rows={getTextAreaRowsCount(props.value?.toString())}
    value={props.value?.toString() || ""}
    onblur={exitEditMode}
  ></textarea>
{:else}
  <div
    class="property-view"
    role="button"
    tabindex="0"
    ondblclick={handleDoubleClick}
    ontouchstart={handleTouchStart}
    ontouchend={handleTouchEnd}
    ontouchmove={handleTouchMove}
    style="min-height: {getTextAreaRowsCount(props.value?.toString()) * 1.5}em;"
    use:renderPropertyValue={props.value}
  ></div>
{/if}

<style>
  .property-input {
    width: 100%;
    padding: 0.5rem;
    border: 1px solid var(--background-modifier-border);
    border-radius: 4px;
    background-color: var(--background-primary);
    color: var(--text-normal);
    font-family: var(--font-text);
    font-size: var(--font-text-size);
    resize: vertical;
  }

  .property-input:focus {
    outline: none;
    border-color: var(--interactive-accent);
  }

  .property-view {
    width: 100%;
    padding: 0.5rem;
    border: 1px solid var(--background-modifier-border);
    border-radius: 4px;
    background-color: var(--background-secondary);
    color: var(--text-normal);
    cursor: pointer;
    transition: background-color 0.2s;
  }

  .property-view :global(.markdown-rendered) {
    font-family: var(--font-text);
    font-size: var(--font-text-size);
  }

  .property-view :global(p) {
    margin: 0.5em 0;
  }

  .property-view :global(p:first-child) {
    margin-top: 0;
  }

  .property-view :global(p:last-child) {
    margin-bottom: 0;
  }

  .property-view :global(ul) {
    margin: 0.5em 0;
    padding-left: 1.5em;
  }

  .property-view :global(ol) {
    margin: 0.5em 0;
    padding-left: 1.5em;
  }

  .property-view :global(h1) {
    margin: 0.5em 0;
  }

  .property-view :global(h2) {
    margin: 0.5em 0;
  }

  .property-view :global(h3) {
    margin: 0.5em 0;
  }

  .property-view :global(h4) {
    margin: 0.5em 0;
  }

  .property-view :global(h5) {
    margin: 0.5em 0;
  }

  .property-view :global(h6) {
    margin: 0.5em 0;
  }

  .property-view :global(code) {
    background-color: var(--code-background);
    padding: 0.1em 0.3em;
    border-radius: 3px;
  }

  .property-view :global(pre) {
    background-color: var(--code-background);
    padding: 0.5em;
    border-radius: 4px;
    overflow-x: auto;
  }

  .property-view:hover {
    background-color: var(--background-modifier-hover);
  }

  .property-view:focus {
    outline: none;
    border-color: var(--interactive-accent);
  }
</style>
