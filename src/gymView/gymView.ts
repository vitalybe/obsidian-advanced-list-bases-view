import { BasesView, QueryController, type BasesEntry } from "obsidian";
import type { BasesPropertyId, ViewOption } from "obsidian";
import { mount, unmount } from "svelte";
import { writable, type Writable } from "svelte/store";
import ListView from "./gymView.svelte";

export const GymViewType = "gym-view";
export class GymView extends BasesView {
  type = GymViewType;
  containerEl: HTMLElement;
  private component?: Record<string, any>;
  private entriesStore: Writable<BasesEntry[]>;
  private propertiesStore: Writable<BasesPropertyId[]>;

  private debugLog(message: string, ...args: unknown[]): void {
    console.log(`[GymView] ${message}`, ...args);
  }

  constructor(controller: QueryController, scrollEl: HTMLElement) {
    super(controller);
    this.containerEl = scrollEl.createDiv({ cls: "is-loading", attr: { tabIndex: 0 } });
    // Initialize stores with empty data
    this.entriesStore = writable([]);
    this.propertiesStore = writable([]);
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
          entries: this.entriesStore,
          properties: this.propertiesStore,
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

    if(!this.component) {
      this.initializeComponent();
    }

    const entries = this.data.data;
    const properties = this.config?.getOrder() || [];

    this.debugLog("Updating component props", {
      entries: entries.length,
      properties: properties.length,
    });

    // Update stores - component stays mounted and reacts to changes
    this.entriesStore.set(entries);
    this.propertiesStore.set(properties);
  }

  static getViewOptions(): ViewOption[] {
    return [];
  }
}
