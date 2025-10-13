import { Plugin, TFile } from "obsidian";
import { ListAdvancedView } from "./list-view";

export default class ObsidianAdvancedListPlugin extends Plugin {
  async onload() {
    console.log("onload");
    this.registerBasesView("list-advanced", {
      name: "List Advanced",
      icon: "lucide-scroll-text",
      factory: (controller, containerEl) => new ListAdvancedView(controller, containerEl),
      options: ListAdvancedView.getViewOptions,
    });
  }

  onunload() {
    console.log("onunload");
    // NOTE: For debugging hot reloading
    // this.reopenActiveView();
  }

  // Only for hot reloading
  async reopenActiveView() {
    const activeFile = this.app.workspace.activeEditor?.file;
    const activeLeaf = this.app.workspace.activeLeaf;

    if (activeLeaf && activeFile) {
      activeLeaf.detach();
      this.app.workspace.openLinkText(activeFile.path, activeFile.path);
    }
  }
}
