import { BasesView, MarkdownRenderer, QueryController, ViewOption } from "obsidian";

export const ListAdvancedType = "list-advanced";
export class ListAdvancedView extends BasesView {
  type = ListAdvancedType;
  scrollEl: HTMLElement;
  containerEl: HTMLElement;

  private debugLog(message: string, ...args: unknown[]): void {
    console.log(`[ListAdvancedView] ${message}`, ...args);
  }

  constructor(controller: QueryController, scrollEl: HTMLElement) {
    super(controller);
    this.scrollEl = scrollEl;
    this.containerEl = scrollEl.createDiv({ cls: "bases-advanced-list-container is-loading", attr: { tabIndex: 0 } });
  }

  onload(): void {}

  onunload() {}

  onResize(): void {}

  public focus(): void {
    this.containerEl.focus({ preventScroll: true });
  }

  public onDataUpdated(): void {
    this.debugLog("onDataUpdated");
    this.containerEl.removeClass("is-loading");
    void this.renderList();
  }

  private async renderList(): Promise<void> {
    // Clear existing content
    this.containerEl.empty();

    if (!this.data || !this.data.data) {
      return;
    }

    const entries = this.data.data;
    const properties = this.data.properties || [];

    this.debugLog(`Rendering ${entries.length} entries: `, entries);

    // Render each entry
    for (let index = 0; index < entries.length; index++) {
      const entry = entries[index];
      const entryEl = this.containerEl.createDiv("bases-list-entry");

      // Render each property
      properties.forEach((prop) => {
        try {
          const value = entry.getValue(prop);
          if (value && value.isTruthy()) {
            const propLineEl = entryEl.createDiv("bases-list-property");

            // Add property label
            const labelEl = propLineEl.createSpan("bases-list-property-label");
            labelEl.textContent = this.config.getDisplayName(prop) + ": ";

            // Add property value
            const valueEl = propLineEl.createSpan("bases-list-property-value");
            value.renderTo(valueEl, this.app.renderContext);
          }
        } catch (error) {
          console.error(`Error rendering property ${prop}:`, error);
        }
      });

      // Add meta-bind input
      const metaBindEl = entryEl.createDiv("bases-list-meta-bind");
      const filePath = entry.file.path;
      const metaBindMarkdown = `\`\`\`meta-bind
INPUT[textArea:${filePath}#md-title]
\`\`\``;

      try {
        await MarkdownRenderer.render(
          this.app,
          metaBindMarkdown,
          metaBindEl,
          filePath,
          this
        );
      } catch (error) {
        console.error(`Error rendering meta-bind for ${filePath}:`, error);
      }

      // Add horizontal rule between entries (but not after the last one)
      if (index < entries.length - 1) {
        this.containerEl.createEl("hr");
      }
    }
  }

  public setEphemeralState(state: unknown): void {}

  public getEphemeralState(): unknown {
    return {};
  }

  static getViewOptions(): ViewOption[] {
    return [];
  }
}

/** Wrapper for Object.hasOwn which performs type narrowing. */
function hasOwnProperty<K extends PropertyKey>(o: unknown, v: K): o is Record<K, unknown> {
  return o != null && typeof o === "object" && Object.hasOwn(o, v);
}
