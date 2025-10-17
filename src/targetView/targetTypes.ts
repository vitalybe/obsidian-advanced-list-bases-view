export enum GroupsEnum {
  KIDS = "Kids",
  ANIMALS = "Animals",
  ADULTS = "Adults",
}

export interface DefinedTarget {
  value: string;
  icon: string;
  groups: GroupsEnum[];
}

export const ALL_GROUPS = [
  { value: GroupsEnum.KIDS, label: "Kids" },
  { value: GroupsEnum.ANIMALS, label: "Animals" },
  { value: GroupsEnum.ADULTS, label: "Adults" },
];

export const ALL_TARGETS: DefinedTarget[] = [
  { value: "Eli", icon: "👦🏻", groups: [GroupsEnum.KIDS, GroupsEnum.ANIMALS] },
  { value: "Emily", icon: "👧🏽", groups: [GroupsEnum.KIDS, GroupsEnum.ANIMALS] },
  { value: "Lia", icon: "👧🏼", groups: [GroupsEnum.KIDS, GroupsEnum.ANIMALS] },
  { value: "Inga", icon: "👸🏻", groups: [GroupsEnum.ADULTS] },
  { value: "Esty", icon: "🌸", groups: [GroupsEnum.ADULTS, GroupsEnum.ANIMALS] },
  { value: "Pub", icon: "🍺", groups: [GroupsEnum.ADULTS] },
  { value: "Vitaly", icon: "👨🏻", groups: [GroupsEnum.ADULTS] },
];
