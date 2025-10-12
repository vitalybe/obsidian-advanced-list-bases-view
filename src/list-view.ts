import { BasesView, QueryController } from "obsidian";
import type { ViewOption } from "obsidian";
import ListView from "./ListView.svelte";

export const ListAdvancedType = "list-advanced";
export class ListAdvancedView extends BasesView {
  type = ListAdvancedType;
  containerEl: HTMLElement;
  private component?: ListView;

  private debugLog(message: string, ...args: unknown[]): void {
    console.log(`[ListAdvancedView] ${message}`, ...args);
  }

  constructor(controller: QueryController, scrollEl: HTMLElement) {
    super(controller);
    this.containerEl = scrollEl.createDiv({ cls: "is-loading", attr: { tabIndex: 0 } });
  }

  onload(): void {
    // Create Svelte component once on load
    this.debugLog("onload");
    this.initializeComponent();
  }

  onunload() {
    this.debugLog("onunload");
    // Only destroy on unload
    if (this.component) {
      this.component.$destroy();
      this.component = undefined;
    }
  }

  onResize(): void {}

  public focus(): void {
    this.containerEl.focus({ preventScroll: true });
  }

  public onDataUpdated(): void {
    this.debugLog("onDataUpdated");
    this.containerEl.removeClass("is-loading");
    this.updateComponent();
  }

  private initializeComponent(): void {
    if (!this.app || !this.config) {
      this.debugLog("Cannot initialize - app or config not ready");
      return;
    }

    if (this.component) {
      this.debugLog("Component already initialized");
      return;
    }

    try {
      this.debugLog("Creating Svelte component once");
      this.component = new ListView({
        target: this.containerEl,
        props: {
          entries: [],
          properties: [],
          config: this.config,
          app: this.app,
          renderContext: this.app.renderContext || undefined,
          component: this,
        },
      });
      this.debugLog("Svelte component created");
    } catch (error) {
      console.error("Error creating Svelte component:", error);
    }
  }

  private updateComponent(): void {
    if (!this.data || !this.data.data) {
      this.debugLog("No data available");
      return;
    }

    // Initialize component if it doesn't exist yet
    if (!this.component) {
      this.initializeComponent();
      if (!this.component) return;
    }

    const entries = this.data.data;
    const properties = this.config?.getOrder() || [];

    this.debugLog("Updating component props", {
      entries: entries.length,
      properties: properties.length,
    });

    // Update props - Svelte's reactivity will handle the DOM updates
    this.component.$set({
      entries: entries,
      properties: properties,
    });
  }

  static getViewOptions(): ViewOption[] {
    return [];
  }
}
