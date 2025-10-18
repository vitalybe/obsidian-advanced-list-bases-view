<script lang="ts">
  import { RenderContext, Value } from "obsidian";

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

  function renderPropertyValue(element: HTMLElement, value: Value | undefined) {
    
    if (value && props.renderContext) {
      console.log("Rendering value:", value);
      if(value.isTruthy()) {
        value.renderTo(element, props.renderContext);
      } else {
        element.setText("(none)");
      }
    }

    return {
      update(newValue: any) {
        // Clear and re-render if value changes
        element.empty();
        if (newValue && props.renderContext) {
          newValue.renderTo(element, props.renderContext);
        }
      },
      destroy() {
        // Clean up if needed
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
    font-family: var(--font-interface);
    font-size: 0.9rem;
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
    font-family: var(--font-interface);
    font-size: 0.9rem;
    white-space: pre-wrap;
    word-wrap: break-word;
    cursor: pointer;
    transition: background-color 0.2s;
  }

  .property-view:hover {
    background-color: var(--background-modifier-hover);
  }

  .property-view:focus {
    outline: none;
    border-color: var(--interactive-accent);
  }
</style>
