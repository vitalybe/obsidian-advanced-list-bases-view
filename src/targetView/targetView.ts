import { BasesView, QueryController, type BasesEntry } from "obsidian";
import type { BasesPropertyId, ViewOption } from "obsidian";
import { mount, unmount } from "svelte";
import { writable, type Writable } from "svelte/store";
import TargetView from "./targetView.svelte";

export interface TargetViewStoreData {
  entries: BasesEntry[];
  properties: BasesPropertyId[];
}

export const TargetsViewType = "targets-view";
export class TargetsView extends BasesView {
  type = TargetsViewType;
  containerEl: HTMLElement;
  private component?: Record<string, any>;
  private targetViewStore: Writable<TargetViewStoreData>;

  private debugLog(message: string, ...args: unknown[]): void {
    console.log(`[ListAdvancedView] ${message}`, ...args);
  }

  constructor(controller: QueryController, scrollEl: HTMLElement) {
    super(controller);
    this.containerEl = scrollEl.createDiv({ cls: "is-loading", attr: { tabIndex: 0 } });
    // Initialize store with empty data
    this.targetViewStore = writable({ entries: [], properties: [] });
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
      this.component = mount(TargetView, {
        target: this.containerEl,
        props: {
          targetViewStore: this.targetViewStore,
          config: this.config,
          app: this.app,
          renderContext: this.app.renderContext,
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

    if (!this.component) {
      this.initializeComponent();
    }

    const entries = this.data.data;
    const properties = this.config?.getOrder() || [];

    this.debugLog("Updating component props", {
      entries: entries.length,
      properties: properties.length,
    });

    // Update store - component stays mounted and reacts to changes
    this.targetViewStore.set({ entries, properties });
  }

  static getViewOptions(): ViewOption[] {
    return [];
  }
}
