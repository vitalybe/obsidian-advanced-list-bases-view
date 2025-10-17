import { BasesView, QueryController } from "obsidian";
import type { ViewOption } from "obsidian";
import { mount, unmount } from "svelte";
import ListView from "./targetView.svelte";

export const TargetsViewType = "targets-view";
export class TargetsView extends BasesView {
  type = TargetsViewType;
  containerEl: HTMLElement;
  private component?: Record<string, any>;

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
      unmount(this.component);
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
      this.component = mount(ListView, {
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

    const entries = this.data.data;
    const properties = this.config?.getOrder() || [];

    this.debugLog("Updating component props", {
      entries: entries.length,
      properties: properties.length,
    });

    // In Svelte 5, unmount and remount with new props
    if (this.component) {
      unmount(this.component);
    }

    this.component = mount(ListView, {
      target: this.containerEl,
      props: {
        entries: entries,
        properties: properties,
        config: this.config,
        app: this.app,
        renderContext: this.app.renderContext || undefined,
        component: this,
      },
    });
  }

  static getViewOptions(): ViewOption[] {
    return [];
  }
}
