import { App, TFile, parseYaml } from "obsidian";
import {
  DEFAULT_TARGETS_SOURCE_PATH,
  EMPTY_ROSTER,
  ROSTER_GROUPS_KEY,
  ROSTER_PEOPLE_KEY,
  TARGETS_SOURCE_PATH_PROPERTY,
  type DefinedTarget,
  type GroupDef,
  type Roster,
} from "./targetTypes";

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---/;

// Loads the groups/people roster from a vault config note. The note path comes
// from the active list note's `md_targets_source_path` frontmatter, falling back
// to DEFAULT_TARGETS_SOURCE_PATH. The config note is read with vault.read +
// parseYaml (not metadataCache) so nested arrays-of-objects parse reliably.
export class TargetRoster {
  static async load(app: App, activeFile: TFile | undefined): Promise<Roster> {
    const file = TargetRoster.resolveConfigFile(app, activeFile);
    if (!file) return EMPTY_ROSTER;

    let roster: Roster = EMPTY_ROSTER;
    try {
      const content = await app.vault.read(file);
      const frontmatter = TargetRoster.parseFrontmatter(content);
      if (frontmatter) {
        roster = {
          groups: TargetRoster.normalizeGroups(frontmatter[ROSTER_GROUPS_KEY]),
          targets: TargetRoster.normalizeTargets(frontmatter[ROSTER_PEOPLE_KEY]),
        };
      }
    } catch (error) {
      console.error("[TargetRoster] Failed to load roster", error);
    }
    return roster;
  }

  private static resolveConfigFile(
    app: App,
    activeFile: TFile | undefined,
  ): TFile | undefined {
    const configuredPath = TargetRoster.getConfiguredPath(app, activeFile);
    let file = TargetRoster.getFileAtPath(
      app,
      configuredPath ?? DEFAULT_TARGETS_SOURCE_PATH,
    );
    // A configured-but-invalid path still falls back to the default note.
    if (!file && configuredPath) {
      file = TargetRoster.getFileAtPath(app, DEFAULT_TARGETS_SOURCE_PATH);
    }
    return file;
  }

  private static getConfiguredPath(
    app: App,
    activeFile: TFile | undefined,
  ): string | undefined {
    if (!activeFile) return undefined;
    const frontmatter = app.metadataCache.getFileCache(activeFile)?.frontmatter;
    const value = frontmatter?.[TARGETS_SOURCE_PATH_PROPERTY];
    const isUsable = typeof value === "string" && value.trim() !== "";
    return isUsable ? value.trim() : undefined;
  }

  private static getFileAtPath(app: App, path: string): TFile | undefined {
    const file = app.vault.getAbstractFileByPath(path);
    return file instanceof TFile ? file : undefined;
  }

  private static parseFrontmatter(
    content: string,
  ): Record<string, unknown> | undefined {
    // Strip a leading UTF-8 BOM so the frontmatter still anchors at offset 0.
    const match = content.replace(/^\uFEFF/, "").match(FRONTMATTER_RE);
    if (!match) return undefined;

    let result: Record<string, unknown> | undefined;
    try {
      const parsed: unknown = parseYaml(match[1]);
      result =
        parsed && typeof parsed === "object"
          ? (parsed as Record<string, unknown>)
          : undefined;
    } catch (error) {
      console.error("[TargetRoster] Failed to parse YAML frontmatter", error);
    }
    return result;
  }

  private static normalizeGroups(raw: unknown): GroupDef[] {
    if (!Array.isArray(raw)) return [];

    const groups: GroupDef[] = [];
    for (const item of raw) {
      if (typeof item === "string") {
        groups.push({ value: item, label: item });
      } else if (item && typeof item === "object") {
        const obj = item as Record<string, unknown>;
        if (typeof obj.value === "string") {
          const label = typeof obj.label === "string" ? obj.label : obj.value;
          groups.push({ value: obj.value, label });
        }
      }
    }
    return groups;
  }

  private static normalizeTargets(raw: unknown): DefinedTarget[] {
    if (!Array.isArray(raw)) return [];

    const targets: DefinedTarget[] = [];
    for (const item of raw) {
      if (item && typeof item === "object") {
        const obj = item as Record<string, unknown>;
        if (typeof obj.value === "string") {
          targets.push({
            value: obj.value,
            icon: typeof obj.icon === "string" ? obj.icon : "",
            groups: TargetRoster.coerceStringArray(obj.groups),
          });
        }
      }
    }
    return targets;
  }

  private static coerceStringArray(raw: unknown): string[] {
    let result: string[] = [];
    if (Array.isArray(raw)) {
      result = raw.filter((g): g is string => typeof g === "string");
    } else if (typeof raw === "string") {
      result = [raw];
    }
    return result;
  }
}
