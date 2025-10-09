import { Plugin } from "obsidian";
import { ListAdvancedView } from "./list-view";

export default class ObsidianAdvancedListPlugin extends Plugin {
  async onload() {
    this.registerBasesView("list-advanced", {
      name: "List Advanced",
      icon: "lucide-scroll-text",
      factory: (controller, containerEl) => new ListAdvancedView(controller, containerEl),
      options: ListAdvancedView.getViewOptions,
    });
  }

  onunload() {}
}
