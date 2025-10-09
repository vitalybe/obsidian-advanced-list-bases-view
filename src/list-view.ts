import { BasesView, MarkdownRenderer, QueryController, TFile, ViewOption } from "obsidian";

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
    // Save scroll position before clearing
    const editor = this.app.workspace.activeEditor?.editor;
    const scrollTop = editor?.getScrollInfo().top || 0;
    this.debugLog("Saving scroll position", scrollTop);

    // Clear existing content
    this.containerEl.empty();

    if (!this.data || !this.data.data) {
      return;
    }

    const entries = this.data.data;
    const properties = this.config.getOrder() || [];

    // Render each entry
    for (let index = 0; index < entries.length; index++) {
      const entry = entries[index];
      const entryEl = this.containerEl.createDiv("bases-list-entry");

      // Render each property
      for (const prop of properties) {
        try {
          const value = entry.getValue(prop);
          if (value && value.isTruthy()) {
            const valueStr = value.toString();

            // Check if this is a dynamic template directive
            if (valueStr.startsWith("!dynamic=")) {
              const templatePath = valueStr.substring("!dynamic=".length);
              const templateEl = entryEl.createDiv("bases-list-template");
              const filePath = entry.file.path;

              try {
                // Read template file
                const templateFile = this.app.vault.getAbstractFileByPath(templatePath);
                if (templateFile && templateFile instanceof TFile) {
                  const templateContent = await this.app.vault.read(templateFile);

                  // Replace placeholder with actual file path
                  const renderedContent = templateContent.replace(/filePathPlaceholder/g, filePath);

                  await MarkdownRenderer.render(this.app, renderedContent, templateEl, filePath, this);
                } else {
                  templateEl.createEl("div", { text: `Template file not found: ${templatePath}` });
                }
              } catch (error) {
                console.error(`Error rendering template for ${filePath}:`, error);
                templateEl.createEl("div", { text: `Error: ${error.message}` });
              }
            } else {
              // Render normal property
              const propLineEl = entryEl.createDiv("bases-list-property");

              // Add property value
              const valueEl = propLineEl.createSpan("bases-list-property-value");
              value.renderTo(valueEl, this.app.renderContext);
            }
          }
        } catch (error) {
          console.error(`Error rendering property ${prop}:`, error);
        }
      }

      // Add horizontal rule between entries (but not after the last one)
      if (index < entries.length - 1) {
        this.containerEl.createEl("hr", { cls: "advanced-list-entry-separator" });
      }
    }

    // Restore scroll position after rendering
    this.debugLog("Restoring scroll position", scrollTop);
    editor?.scrollTo(null, scrollTop);
  }

  static getViewOptions(): ViewOption[] {
    return [];
  }
}

/** Wrapper for Object.hasOwn which performs type narrowing. */
function hasOwnProperty<K extends PropertyKey>(o: unknown, v: K): o is Record<K, unknown> {
  return o != null && typeof o === "object" && Object.hasOwn(o, v);
}
