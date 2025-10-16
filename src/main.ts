import { Plugin, TFile } from "obsidian";
import { TargetsView, TargetsViewType } from "./targetView/targetView";
import { GymView, GymViewType } from "./gymView/gymView";

export default class ObsidianAdvancedListPlugin extends Plugin {
  async onload() {
    console.log("onload");
    this.registerBasesView(TargetsViewType, {
      name: "Targets",
      icon: "lucide-target",
      factory: (controller, containerEl) => new TargetsView(controller, containerEl),
      options: TargetsView.getViewOptions,
    });

    this.registerBasesView(GymViewType, {
      name: "Gym",
      icon: "lucide-dumbbell",
      factory: (controller, containerEl) => new GymView(controller, containerEl),
      options: GymView.getViewOptions,
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
