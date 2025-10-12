import type { TFile } from "obsidian";

export interface ListEntry {
  getValue(prop: string): any;
  file: TFile;
}

export interface Config {
  getOrder(): string[] | null;
  getDisplayName(prop: string): string;
}

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
