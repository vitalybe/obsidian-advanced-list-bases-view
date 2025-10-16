import type { TFile } from "obsidian";

export type PropertyData =
  | {
      type: "template";
      prop: string;
      templateContent: string;
      filePath: string;
    }
  | {
      type: "property";
      prop: string;
      label: string;
      value: any;
    }
  | {
      type: "error";
      prop: string;
      message: string;
    };
