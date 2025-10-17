import { type BasesPropertyId } from "obsidian";

export interface PropertyData {
  type: "property";
  propertyFull: BasesPropertyId;
  propertyName: string;
  propertyType: string;
  label: string;
  value: any;
}
