import { BasesView, QueryController, ViewOption } from "obsidian";

export const ListAdvancedType = "list-advanced";
export class ListAdvancedView extends BasesView {
  type = ListAdvancedType;
  scrollEl: HTMLElement;
  containerEl: HTMLElement;

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
    // TODO: Implement
  }

  public setEphemeralState(state: unknown): void {}

  public getEphemeralState(): unknown {}

  static getViewOptions(): ViewOption[] {
    return [];
  }
}

/** Wrapper for Object.hasOwn which performs type narrowing. */
function hasOwnProperty<K extends PropertyKey>(o: unknown, v: K): o is Record<K, unknown> {
  return o != null && typeof o === "object" && Object.hasOwn(o, v);
}
