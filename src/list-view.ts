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

  onload(): void {}

  onunload() {
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
    void this.renderList();
  }

  private async renderList(): Promise<void> {
    if (!this.data || !this.data.data) {
      return;
    }

    const entries = this.data.data;
    const properties = this.config.getOrder() || [];

    // Destroy existing component if it exists
    if (this.component) {
      this.component.$destroy();
    }

    // Create new Svelte component instance
    this.component = new ListView({
      target: this.containerEl,
      props: {
        entries,
        properties,
        config: this.config,
        app: this.app,
        renderContext: this.app.renderContext,
        component: this,
      },
    });
  }

  static getViewOptions(): ViewOption[] {
    return [];
  }
}

/** Wrapper for Object.hasOwn which performs type narrowing. */
function hasOwnProperty<K extends PropertyKey>(o: unknown, v: K): o is Record<K, unknown> {
  return o != null && typeof o === "object" && Object.hasOwn(o, v);
}
