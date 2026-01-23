<script lang="ts">
  import { RenderContext, Value, Component, MarkdownRenderer } from "obsidian";
  import { EditorView } from "@codemirror/view";
  import { EditorState } from "@codemirror/state";

  interface Props {
    renderContext: RenderContext;

    id: string;
    value?: Value;
    onchange: (newValue: string) => void;
  }

  let props: Props = $props();
  let isEditMode = $state(false);
  let editorContainer = $state<HTMLDivElement>();
  let editorView: EditorView | undefined;
  let longPressTimer: number | undefined;
  let component = new Component();

  function getTextAreaRowsCount(content: string | undefined): number {
    if (!content) return 1;

    const newLines = (content.match(/\n/g) || []).length;
    const linesPerContent = content.length / 50 + 1;
    return Math.max(linesPerContent, newLines, 1);
  }

  function createEditor() {
    if (!editorContainer) return;

    const initialContent = props.value?.toString() || "";
    const app = props.renderContext.app;

    // Build extensions array
    const extensions: any[] = [
      EditorView.lineWrapping,
      // Handle blur to exit edit mode
      EditorView.domEventHandlers({
        blur: (event, view) => {
          // Small delay to allow click events to process
          setTimeout(() => {
            exitEditMode();
          }, 100);
          return false;
        }
      }),
      // Use Obsidian's theme
      EditorView.theme({
        "&": {
          fontSize: "var(--font-text-size)",
          fontFamily: "var(--font-text)",
        },
        ".cm-content": {
          padding: "0.5rem",
        },
        ".cm-line": {
          padding: "0",
        }
      })
    ];

    // Try to get Obsidian's markdown mode
    try {
      // @ts-ignore - internal API
      if (app.vault?.adapter?.basePath) {
        // Access internal editor extensions if available
        // @ts-ignore
        const editorExtensions = app.vault.getConfig?.('editorExtensions');
        if (Array.isArray(editorExtensions)) {
          extensions.push(...editorExtensions);
        }
      }
    } catch (e) {
      console.log("Using basic editor setup (Obsidian extensions not available)");
    }

    const state = EditorState.create({
      doc: initialContent,
      extensions,
    });

    editorView = new EditorView({
      state,
      parent: editorContainer,
    });

    // Focus the editor
    editorView.focus();
  }

  function enterEditMode() {
    isEditMode = true;
    // Create the editor after the container is rendered
    setTimeout(() => {
      createEditor();
    }, 0);
  }

  function exitEditMode() {
    if (!editorView) return;

    isEditMode = false;
    const newValue = editorView.state.doc.toString();

    // Destroy the editor
    editorView.destroy();
    editorView = undefined;

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
  <div
    bind:this={editorContainer}
    id={props.id}
    class="editor-container"
  ></div>
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
  .editor-container {
    width: 100%;
    border: 1px solid var(--background-modifier-border);
    border-radius: 4px;
    background-color: var(--background-primary);
    min-height: 3em;
  }

  .editor-container :global(.cm-editor) {
    background-color: var(--background-primary);
    color: var(--text-normal);
    font-family: var(--font-text);
    font-size: var(--font-text-size);
  }

  .editor-container :global(.cm-focused) {
    outline: none;
  }

  .editor-container:has(:global(.cm-focused)) {
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
