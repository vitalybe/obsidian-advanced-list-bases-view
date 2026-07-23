<script lang="ts">
  import {
    MarkdownRenderer,
    TFile,
    type App,
    type BasesPropertyId,
    type BasesEntry,
    type BasesViewConfig,
    type FrontMatterCache,
    type RenderContext,
    parsePropertyId,
    Component,
    Value,
    ListValue,
  } from "obsidian";
  import type { PropertyData } from "../types";
  import type { Writable } from "svelte/store";
  import GroupsAndTargetsSelector from "./GroupsAndTargetsSelector.svelte";
  import EditableTextarea from "./EditableTextarea.svelte";
  import { EMPTY_ROSTER, formatTarget, type Roster } from "./targetTypes";
  import { TargetRoster } from "./targetRoster";
  import type { TargetViewStoreData } from "./targetView.ts";
  import TagCloud from "./tags/TagCloud.svelte";
  import EntryTags from "./tags/EntryTags.svelte";
  import {
    countActiveTagFilters,
    describeTagFilters,
    matchesTagFilters,
    readEntryTags,
    readListTagState,
    resolveListFile,
  } from "./tags/tagModel";
  import { TAGS_PROPERTY } from "./tags/tagTypes";
  import { clearTagFilters as clearTagFiltersWrite } from "./tags/tagWrites";

  interface Props {
    targetViewStore: Writable<TargetViewStoreData>;
    config?: BasesViewConfig;
    app: App;
    renderContext: RenderContext;
    component: Component;
  }

  // Props with defaults to prevent undefined errors
  let {
    targetViewStore,
    config = undefined,
    app,
    renderContext,
    component,
  }: Props = $props();

  // Subscribe to store to get reactive values
  let storeData = $derived($targetViewStore);
  let entries = $derived(storeData.entries);
  let properties = $derived(storeData.properties);

  const LIST_TARGET_PROPERTY = "md_list_target";
  const TARGETS_PROPERTY = "md_targets";
  const TARGETS_DONE_PROPERTY = "md_targets_done";
  const IS_DONE_PROPERTY = "md_is_done";
  const LENGTH_MINUTES_PROPERTY = "md_length_minutes";
  const LENGTH_FILTER_PROPERTY = "md_list_length_filter";
  const LINK_FILTER_PROPERTY = "md_list_link_filter";
  const LENGTH_VALUE_PROPERTY = "md_list_length_value";
  const DEFAULT_LENGTH_VALUE = 3;

  // Reactive data structure for entries
  let entryData = $state<
    Array<{
      entry: BasesEntry;
      filledProperties: PropertyData[];
      emptyProperties: PropertyData[];
      fileContent: string;
      hasTagsProperty: boolean;
      imageUrl: string | null;
    }>
  >([]);

  const IMAGE_EXT_RE = /\.(png|jpe?g|gif|webp|svg|bmp|avif)(\?[^\s)"']*)?$/i;

  function resolveWikiImage(
    linkPath: string,
    sourcePath: string,
  ): string | null {
    const f = app.metadataCache.getFirstLinkpathDest(linkPath, sourcePath);
    if (f) return app.vault.getResourcePath(f);
    return null;
  }

  function findImageInText(text: string, sourcePath: string): string | null {
    if (!text) return null;
    const mdImg = text.match(/!\[[^\]]*\]\((https?:\/\/[^\s)]+)\)/);
    if (mdImg) return mdImg[1];
    const wiki = text.match(
      /!\[\[([^\]|]+?\.(?:png|jpe?g|gif|webp|svg|bmp|avif))(?:\|[^\]]*)?\]\]/i,
    );
    if (wiki) {
      const resolved = resolveWikiImage(wiki[1], sourcePath);
      if (resolved) return resolved;
    }
    const urlMatch = text.match(
      /(https?:\/\/[^\s)"']+?\.(?:png|jpe?g|gif|webp|svg|bmp|avif)(?:\?[^\s)"']*)?)/i,
    );
    if (urlMatch) return urlMatch[1];
    return null;
  }

  function findImageInValue(raw: unknown, sourcePath: string): string | null {
    if (raw == null) return null;
    if (Array.isArray(raw)) {
      for (const item of raw) {
        const found = findImageInValue(item, sourcePath);
        if (found) return found;
      }
      return null;
    }
    const str = String(raw).trim();
    if (!str) return null;
    const fromText = findImageInText(str, sourcePath);
    if (fromText) return fromText;
    if (/^https?:\/\//i.test(str) && IMAGE_EXT_RE.test(str)) return str;
    if (IMAGE_EXT_RE.test(str) && !str.includes(" ")) {
      const resolved = resolveWikiImage(str, sourcePath);
      if (resolved) return resolved;
    }
    return null;
  }

  function extractEntryImage(
    entry: BasesEntry,
    filledProperties: PropertyData[],
    fileContent: string,
  ): string | null {
    const sourcePath = entry.file.path;

    const fm = app.metadataCache.getFileCache(entry.file)?.frontmatter;
    if (fm) {
      const preferredKeys = ["md_image", "md_thumbnail", "md_thumb", "image"];
      for (const key of preferredKeys) {
        if (key in fm) {
          const found = findImageInValue(fm[key], sourcePath);
          if (found) return found;
        }
      }
      for (const key of Object.keys(fm)) {
        if (preferredKeys.includes(key)) continue;
        const found = findImageInValue(fm[key], sourcePath);
        if (found) return found;
      }
    }

    for (const p of filledProperties) {
      let str: string;
      try {
        str = p.value.toString();
      } catch {
        continue;
      }
      const found = findImageInValue(str, sourcePath);
      if (found) return found;
    }

    return findImageInText(fileContent, sourcePath);
  }

  // Tag state, derived from the metadata cache rather than written +
  // mirrored into local $state like the other filters below. Today's
  // cycleTagState (now deleted) wrote frontmatter and waited for Bases to
  // re-run the query; if the base's own filter didn't reference the tag
  // keys, that refresh could simply never fire. Deriving straight from the
  // cache means any write - from this view, the note's frontmatter editor,
  // another device via sync - shows up immediately. See the metaVersion
  // effect below for how the cache-change signal gets in.
  let metaVersion = $state(0);
  let entryPaths = $derived(
    new Set(entryData.map((ed) => ed.entry.file.path)),
  );
  let listFile = $derived.by(() => {
    void metaVersion;
    return resolveListFile(app);
  });
  let listTagState = $derived.by(() => {
    void metaVersion;
    void entries;
    return readListTagState(app, listFile);
  });
  let listTags = $derived(listTagState.vocabulary);
  let tagFilters = $derived(listTagState.filters);
  let activeTagFilterCount = $derived(countActiveTagFilters(tagFilters));
  let entryTagsByPath = $derived.by(() => {
    void metaVersion;
    const map = new Map<string, string[]>();
    for (const ed of entryData) {
      map.set(ed.entry.file.path, readEntryTags(app, ed.entry.file));
    }
    return map;
  });
  let entryTagLists = $derived([...entryTagsByPath.values()]);
  // True when md_tags is in the view's configured property order, regardless
  // of whether any note currently has a value for it. This is the signal that
  // lets a user bootstrap: entryData's per-entry hasTagsProperty is false for
  // a note with no md_tags at all, so gating solely on it would hide the "+"
  // button on a list where nothing is tagged yet - leaving no way to add a
  // first tag from the UI.
  let tagsPropertyConfigured = $derived(
    properties.some((p) => parsePropertyId(p).propertyName === TAGS_PROPERTY),
  );
  let tagsEnabled = $derived(
    tagsPropertyConfigured ||
      listTags.length > 0 ||
      entryTagLists.some((t) => t.length > 0),
  );

  // Bumps metaVersion on relevant metadata-cache changes. Also listens to
  // file-open/active-leaf-change because resolveListFile reads
  // activeEditor, which is not itself reactive. The effect body below reads
  // nothing reactive - listFile/entryPaths are read inside the event
  // callbacks, which run outside the effect's tracking context - so this
  // should register exactly once per mount. NOT yet confirmed against a
  // running Obsidian; if it turns out to re-register on every data update,
  // wrap the callback reads in untrack().
  $effect(() => {
    const metaRef = app.metadataCache.on("changed", (file) => {
      if (file.path === listFile?.path || entryPaths.has(file.path)) {
        metaVersion++;
      }
    });
    const openRef = app.workspace.on("file-open", () => {
      metaVersion++;
    });
    const leafRef = app.workspace.on("active-leaf-change", () => {
      metaVersion++;
    });
    return () => {
      app.metadataCache.offref(metaRef);
      app.workspace.offref(openRef);
      app.workspace.offref(leafRef);
    };
  });

  let visibleEntryData = $derived.by(() => {
    return entryData.filter((ed) => {
      const tags = entryTagsByPath.get(ed.entry.file.path) ?? [];
      if (!matchesTagFilters(tags, tagFilters)) return false;

      if (lengthFilter !== "all") {
        const len = getEntryLengthMinutes(ed.entry);
        if (lengthFilter === "below") {
          // Length below the value; no known length (0 / text item) counts too.
          if (len !== null && len >= lengthValue) return false;
        } else if (lengthFilter === "above") {
          // Only items with a length above the value; unknown length excluded.
          if (len === null || len <= lengthValue) return false;
        }
      }

      if (linkFilter !== "all") {
        const hasLink = extractEntryLink(ed.entry) !== null;
        if (linkFilter === "link" && !hasLink) return false;
        if (linkFilter === "text" && hasLink) return false;
      }

      return true;
    });
  });

  // Track active target
  let activeTarget = $state<string | undefined>(undefined);
  // Groups/people roster loaded from the config note (see loader effect below).
  let roster = $state<Roster>(EMPTY_ROSTER);
  // Derived so it recomputes when the roster loads asynchronously (otherwise the
  // chip would be stuck on the raw value computed during processEntries).
  let activeTargetLabel = $derived.by(() => {
    let result: string | undefined = undefined;
    if (activeTarget) {
      const target = roster.targets.find((t) => t.value === activeTarget);
      // Fall back to the raw value so the chip never blanks on an empty roster.
      result = target ? formatTarget(target) : activeTarget;
    }
    return result;
  });

  // Filter state: "all", "filled", "empty"
  let targetFilter = $state<"all" | "filled" | "empty">("all");

  // Length filter: "all" (any), "below" (length < value, which also covers
  // items with 0 / no known length), "above" (length > value; items without a
  // length never match). Link filter: "all", "link" (only items that carry a
  // link), "text" (only items without a link).
  let lengthFilter = $state<"all" | "below" | "above">("all");
  let linkFilter = $state<"all" | "link" | "text">("all");
  let lengthValue = $state<number>(DEFAULT_LENGTH_VALUE);

  // Search state
  let searchValue = $state<string>("");
  let showSearch = $state<boolean>(false);
  let searchInputEl = $state<HTMLInputElement | null>(null);

  // Reactively process entries when they change
  $effect(() => {
    async function processEntriesEffect() {
      entryData = await processEntries(entries, properties);
    }

    processEntriesEffect();
  });

  // Reactively update search value when active file changes
  $effect(() => {
    // Access active file to create reactive dependency
    const activeFile = app.workspace.activeEditor?.file;
    if (activeFile) {
      // Update search state from file frontmatter when active file changes
      updateSearchStateFromFile();
    }
  });

  // Loads the roster from the config note (md_targets_source_path on the active
  // list note, else the default note). Reloaded on each data update so it
  // settles once the active file and config note are available.
  $effect(() => {
    // Re-run when entries change (data-update cycle).
    void entries;
    const activeFile = app.workspace.activeEditor?.file ?? undefined;
    let cancelled = false;
    TargetRoster.load(app, activeFile).then((loaded) => {
      if (!cancelled) roster = loaded;
    });
    return () => {
      cancelled = true;
    };
  });

  function debugLog(message: string, ...args: unknown[]): void {
    console.log(`[ListAdvancedView ListView.svelte] ${message}`, ...args);
  }

  function isPropertyValueFilled(value: Value): boolean {
    if (!value) return false;

    // Check if it's truthy
    if (!value.isTruthy()) return false;

    // Check if it's an empty list
    if (value instanceof ListValue) {
      return value.length() > 0;
    }

    // Check if it's an empty string by converting to string
    const stringValue = value.toString();
    if (stringValue.trim().length === 0) {
      return false;
    }

    return true;
  }

  function isPropertyValueEmpty(value: Value): boolean {
    if (!value) return true;

    // Check if it's falsy
    if (!value.isTruthy()) return true;

    // Check if it's an empty list
    if (value instanceof ListValue) {
      return value.length() === 0;
    }

    // Check if it's an empty string by converting to string
    const stringValue = value.toString();
    if (stringValue.trim().length === 0) {
      return true;
    }

    return false;
  }

  function separatePropertiesByValue(properties: PropertyData[]): {
    filledProperties: PropertyData[];
    emptyProperties: PropertyData[];
  } {
    const filledProperties = properties.filter((p) =>
      isPropertyValueFilled(p.value),
    );
    const emptyProperties = properties.filter((p) =>
      isPropertyValueEmpty(p.value),
    );

    return { filledProperties, emptyProperties };
  }

  async function readFileContent(file: TFile): Promise<string> {
    try {
      const content = await app.vault.read(file);
      // Remove frontmatter if present
      const frontmatterRegex = /^---\s*\n[\s\S]*?\n---\s*\n/;
      const contentWithoutFrontmatter = content.replace(frontmatterRegex, "");
      // Get first 300 characters
      return contentWithoutFrontmatter.trim().substring(0, 300);
    } catch (error) {
      console.error(`Error reading file ${file.path}:`, error);
      return "";
    }
  }

  async function processEntry(
    entry: BasesEntry,
    properties: BasesPropertyId[],
  ): Promise<{
    entry: BasesEntry;
    filledProperties: PropertyData[];
    emptyProperties: PropertyData[];
    fileContent: string;
    hasTagsProperty: boolean;
    imageUrl: string | null;
  }> {
    const props = await Promise.all(
      properties.map(async (prop) => await processProperty(entry, prop)),
    );
    const validProps = props.filter((p) => p !== null) as PropertyData[];

    const hasTagsProperty = validProps.some(
      (p) => p.propertyName === "md_tags",
    );
    const propsWithoutTags = validProps.filter(
      (p) => p.propertyName !== "md_tags",
    );

    const { filledProperties, emptyProperties } =
      separatePropertiesByValue(propsWithoutTags);
    const fileContent = await readFileContent(entry.file);
    // remove embedded bases, e.g.: ![[Inbox/_data/base.base#OmniSingleItem|base]]
    const fileContentWithoutEmbeddedBases = fileContent.replace(
      /!\[\[.+?\.base.+?\]\]/g,
      "",
    );
    console.log("fileContent", fileContentWithoutEmbeddedBases);

    const imageUrl = extractEntryImage(
      entry,
      filledProperties,
      fileContentWithoutEmbeddedBases,
    );

    return {
      entry,
      filledProperties,
      emptyProperties,
      fileContent: fileContentWithoutEmbeddedBases,
      hasTagsProperty,
      imageUrl,
    };
  }

  async function processEntries(
    entries: BasesEntry[],
    properties: BasesPropertyId[],
  ) {
    debugLog("processEntries");
    const entryData = await Promise.all(
      entries.map((entry) => processEntry(entry, properties)),
    );

    // Update active target info (activeTargetLabel derives from this + roster)
    activeTarget = getActiveFileTarget();
    debugLog("Updated activeTarget:", activeTarget);

    // Update filter state from file frontmatter
    updateFilterStateFromFile();

    // Update search value from file frontmatter
    updateSearchStateFromFile();

    // Update length/link filter state from file frontmatter
    updateExtraFiltersStateFromFile();

    return entryData;
  }

  function updateExtraFiltersStateFromFile() {
    const fm = getActiveFileMetadata()?.frontmatter;
    const lf = fm?.[LENGTH_FILTER_PROPERTY];
    lengthFilter = lf === "below" || lf === "above" ? lf : "all";
    const kf = fm?.[LINK_FILTER_PROPERTY];
    linkFilter = kf === "link" || kf === "text" ? kf : "all";
    const val = Number(fm?.[LENGTH_VALUE_PROPERTY]);
    lengthValue =
      Number.isFinite(val) && val >= 0 ? val : DEFAULT_LENGTH_VALUE;
  }

  async function processProperty(
    entry: BasesEntry,
    prop: BasesPropertyId,
  ): Promise<PropertyData | null> {
    try {
      const value = entry.getValue(prop);
      // Return null only if property doesn't exist, not if it's empty
      if (value === null || value === undefined) return null;

      const propParsed = parsePropertyId(prop);

      // Return property data even if value is empty
      return {
        type: "property",
        propertyFull: prop,
        propertyName: propParsed.name,
        propertyType: propParsed.type,
        label: config?.getDisplayName(prop) || prop,
        value: value,
      };
    } catch (error) {
      console.error(`Error processing property ${prop}:`, error);
      return null;
    }
  }

  function getActiveFileMetadata(): FrontMatterCache | undefined {
    let metadata: FrontMatterCache | undefined;

    const activeFile = app.workspace.activeEditor?.file;
    if (activeFile) {
      metadata = app.metadataCache.getFileCache(activeFile) ?? undefined;
    }

    return metadata;
  }

  function renderPropertyValue(element: HTMLElement, value: any) {
    // Render property value when element is mounted
    if (value && renderContext) {
      value.renderTo(element, renderContext);
    }

    return {
      update(newValue: any) {
        // Clear and re-render if value changes
        element.empty();
        if (newValue && renderContext) {
          newValue.renderTo(element, renderContext);
        }
      },
      destroy() {
        // Clean up if needed
        element.empty();
      },
    };
  }


  function getActiveFileTarget(): string | undefined {
    let target: string | undefined;

    const activeFileMetadata = getActiveFileMetadata();
    const targets = activeFileMetadata?.frontmatter?.[LIST_TARGET_PROPERTY];
    debugLog("getActiveFileTarget", targets);
    if (targets) {
      if (Array.isArray(targets)) {
        target = targets[0];
      } else {
        target = targets;
      }
    }

    return target;
  }

  function determineFilterState(
    showHasTargets: boolean | undefined,
    showEmptyTargets: boolean | undefined,
  ): "all" | "filled" | "empty" {
    if (showHasTargets && showEmptyTargets) {
      return "all";
    } else if (showHasTargets) {
      return "filled";
    } else if (showEmptyTargets) {
      return "empty";
    }
    return "all";
  }

  function updateFilterStateFromFile() {
    const activeFileMetadata = getActiveFileMetadata();
    if (!activeFileMetadata?.frontmatter) {
      targetFilter = "all";
      return;
    }

    const showHasTargets = activeFileMetadata.frontmatter[
      "check_show_has_targets"
    ] as boolean | undefined;
    const showEmptyTargets = activeFileMetadata.frontmatter[
      "check_show_empty_targets"
    ] as boolean | undefined;

    targetFilter = determineFilterState(showHasTargets, showEmptyTargets);
  }

  function updateSearchStateFromFile() {
    const activeFileMetadata = getActiveFileMetadata();
    if (!activeFileMetadata?.frontmatter) {
      searchValue = "";
      return;
    }

    const search = activeFileMetadata.frontmatter["md_list_search"] as
      | string
      | undefined;
    searchValue = search || "";
  }

  function getEntryLengthMinutes(entry: BasesEntry): number | null {
    const value = entry.getValue(`note.${LENGTH_MINUTES_PROPERTY}`) as
      | (Value & { data: unknown })
      | null;
    if (!value || !value.isTruthy()) return null;
    const num = Number((value as any).data);
    return Number.isFinite(num) ? num : null;
  }

  function extractEntryBackupLink(entry: BasesEntry): string | null {
    for (const prop of ["note.reddit_backup_link", "note.md_backup_link"]) {
      const value = entry.getValue(prop);
      if (value && value.isTruthy()) {
        const str = value.toString().trim();
        if (str.length > 0) return str;
      }
    }
    return null;
  }

  function extractEntryLink(entry: BasesEntry): string | null {
    // Check md_link first (dedicated link property)
    const mdLink = entry.getValue("note.md_link");
    if (mdLink && mdLink.isTruthy()) {
      const linkStr = mdLink.toString().trim();
      if (linkStr.length > 0) return linkStr;
    }

    // Check md_title for markdown links like [text](url)
    const mdTitle = entry.getValue("note.md_title");
    if (mdTitle && mdTitle.isTruthy()) {
      const titleStr = mdTitle.toString();
      const markdownLinkMatch = titleStr.match(
        /\[.*?\]\((https?:\/\/[^\s)]+)\)/,
      );
      if (markdownLinkMatch) return markdownLinkMatch[1];
      // Check for bare URLs
      const urlMatch = titleStr.match(/(https?:\/\/[^\s]+)/);
      if (urlMatch) return urlMatch[1];
    }

    return null;
  }

  function openRedditUrl(entry: BasesEntry) {
    const redditUrl = entry.getValue("note.reddit_url");
    if (redditUrl) {
      window.open(redditUrl.toString(), "_blank");
    }
  }

  function addActiveTargetToEntry(entry: BasesEntry) {
    const activeTarget = getActiveFileTarget();
    if (!activeTarget) return;

    app.fileManager.processFrontMatter(entry.file, (frontmatter) => {
      const targets = (frontmatter[TARGETS_DONE_PROPERTY] as string[]) ?? [];
      if (!targets.includes(activeTarget)) {
        targets.push(activeTarget);
      }
      frontmatter[TARGETS_DONE_PROPERTY] = targets;
    });
  }

  function handleWatch(entry: BasesEntry) {
    const link = extractEntryLink(entry);
    if (!link) return;

    addActiveTargetToEntry(entry);
    setTimeout(() => {
      window.open(link, "_blank");
    }, 100);
  }

  function normalizeTargetsArray(targets: unknown[] | unknown): string[] {
    if (Array.isArray(targets)) {
      return targets;
    }
    return targets ? [targets.toString()] : [];
  }

  function toggleTargetInArray(
    targets: string[],
    target: string,
    shouldRemove: boolean,
  ): string[] {
    if (shouldRemove) {
      const index = targets.indexOf(target);
      if (index > -1) {
        targets.splice(index, 1);
      }
    } else {
      if (!targets.includes(target)) {
        targets.push(target);
      }
    }
    return targets;
  }

  function handleMarkAsRead(entry: BasesEntry) {
    const activeTarget = getActiveFileTarget();
    if (!activeTarget) return;

    const isRead = isEntryMarkedAsRead(entry);

    app.fileManager.processFrontMatter(entry.file, (frontmatter) => {
      const targetsOriginal =
        (frontmatter[TARGETS_DONE_PROPERTY] as unknown[] | unknown) ?? [];
      const targets = normalizeTargetsArray(targetsOriginal);
      const updatedTargets = toggleTargetInArray(targets, activeTarget, isRead);
      frontmatter[TARGETS_DONE_PROPERTY] = updatedTargets;
    });
  }

  function handleRemove(entry: BasesEntry) {
    const isDone = isEntryMarkedAsDone(entry);

    app.fileManager.processFrontMatter(entry.file, (frontmatter) => {
      frontmatter[IS_DONE_PROPERTY] = !isDone;
    });
  }

  function updateListTargetProperty(activeFile: TFile, selectedTarget: string) {
    app.fileManager.processFrontMatter(activeFile, (frontmatter) => {
      if (selectedTarget === "") {
        // Remove the property if "None" is selected
        frontmatter[LIST_TARGET_PROPERTY] = null;
      } else {
        // Set the target as an array with the selected value
        frontmatter[LIST_TARGET_PROPERTY] = selectedTarget;
      }
    });
  }

  function handleFilterSelect(event: Event) {
    const select = event.target as HTMLSelectElement;
    const selectedTarget = select.value;

    const activeFile = app.workspace.activeEditor?.file;
    if (!activeFile) return;

    updateListTargetProperty(activeFile, selectedTarget);
  }

  function getBooleanValue(entry: BasesEntry, prop: BasesPropertyId): boolean {
    const value: { data: boolean } | undefined = entry.getValue(prop) as any;
    return value?.data ?? false;
  }

  function extractTargetsDoneArray(entry: BasesEntry): string[] {
    const targetsDone: (Value & { data: string[] | string }) | null =
      entry.getValue(`note.${TARGETS_DONE_PROPERTY}`) as any;

    if (!targetsDone || !targetsDone.isTruthy()) {
      return [];
    }

    return Array.isArray(targetsDone.data)
      ? targetsDone.data
      : [targetsDone.data];
  }

  function isEntryMarkedAsRead(entry: BasesEntry): boolean {
    const activeTarget = getActiveFileTarget();
    if (!activeTarget) return false;

    const targetsDoneArray = extractTargetsDoneArray(entry);
    return targetsDoneArray.some((t: any) => t.toString() === activeTarget);
  }

  function isEntryMarkedAsDone(entry: BasesEntry): boolean {
    return getBooleanValue(entry, `note.${IS_DONE_PROPERTY}`);
  }

  function getFilterFrontmatterValues(
    filterValue: "all" | "filled" | "empty",
  ): {
    showHasTargets: boolean;
    showEmptyTargets: boolean;
  } {
    if (filterValue === "all") {
      return { showHasTargets: true, showEmptyTargets: true };
    } else if (filterValue === "filled") {
      return { showHasTargets: true, showEmptyTargets: false };
    } else {
      // filterValue === "empty"
      return { showHasTargets: false, showEmptyTargets: true };
    }
  }

  function handleTargetFilterChange(event: Event) {
    const select = event.target as HTMLSelectElement;
    const filterValue = select.value as "all" | "filled" | "empty";

    const activeFile = app.workspace.activeEditor?.file;
    if (!activeFile) return;

    const { showHasTargets, showEmptyTargets } =
      getFilterFrontmatterValues(filterValue);

    app.fileManager.processFrontMatter(activeFile, (frontmatter) => {
      frontmatter["check_show_has_targets"] = showHasTargets;
      frontmatter["check_show_empty_targets"] = showEmptyTargets;
    });

    // Update local state
    targetFilter = filterValue;
  }

  function handleLengthFilterChange(event: Event) {
    const select = event.target as HTMLSelectElement;
    const value = select.value as "all" | "below" | "above";

    const activeFile = app.workspace.activeEditor?.file;
    if (!activeFile) return;

    app.fileManager.processFrontMatter(activeFile, (frontmatter) => {
      if (value === "all") {
        delete frontmatter[LENGTH_FILTER_PROPERTY];
      } else {
        frontmatter[LENGTH_FILTER_PROPERTY] = value;
      }
    });

    lengthFilter = value;
  }

  function handleLengthValueChange(event: Event) {
    const input = event.target as HTMLInputElement;
    const parsed = Number(input.value);
    const value =
      Number.isFinite(parsed) && parsed >= 0 ? parsed : DEFAULT_LENGTH_VALUE;

    const activeFile = app.workspace.activeEditor?.file;
    if (!activeFile) return;

    app.fileManager.processFrontMatter(activeFile, (frontmatter) => {
      frontmatter[LENGTH_VALUE_PROPERTY] = value;
    });

    lengthValue = value;
  }

  function handleLinkFilterChange(event: Event) {
    const select = event.target as HTMLSelectElement;
    const value = select.value as "all" | "link" | "text";

    const activeFile = app.workspace.activeEditor?.file;
    if (!activeFile) return;

    app.fileManager.processFrontMatter(activeFile, (frontmatter) => {
      if (value === "all") {
        delete frontmatter[LINK_FILTER_PROPERTY];
      } else {
        frontmatter[LINK_FILTER_PROPERTY] = value;
      }
    });

    linkFilter = value;
  }

  function handleSearchChange(event: Event) {
    const input = event.target as HTMLInputElement;
    const newValue = input.value;

    const activeFile = app.workspace.activeEditor?.file;
    if (!activeFile) return;

    app.fileManager.processFrontMatter(activeFile, (frontmatter) => {
      if (newValue.trim() === "") {
        // Remove the property if empty
        delete frontmatter["md_list_search"];
      } else {
        frontmatter["md_list_search"] = newValue;
      }
    });

    // Update local state
    searchValue = newValue;
  }

  function getEntryClasses(entry: BasesEntry): string {
    return [
      getBooleanValue(entry, "formula.fnzShouldShowRulesCombined") === false
        ? "entry-about-to-disappear"
        : "",
      getBooleanValue(entry, "formula.fnzTargetsEmptyTargets")
        ? "entry-targets-empty"
        : "",
    ].join(" ");
  }

  function handlePropertyChange(
    entry: BasesEntry,
    propertyName: string,
    newValue: string,
  ) {
    app.fileManager.processFrontMatter(entry.file, (frontmatter) => {
      frontmatter[propertyName] = newValue;
    });
  }

  async function handleFileContentClick(entry: BasesEntry) {
    const leaf = app.workspace.getLeaf(false);
    await leaf.openFile(entry.file);
  }

  function getPropertyUrl(propData: PropertyData): string | null {
    try {
      const str = propData.value.toString().trim();
      if (/^https?:\/\//i.test(str)) return str;
    } catch {}
    return null;
  }

  function isOmniList(): boolean {
    const metadata = getActiveFileMetadata();
    if (!metadata?.frontmatter) return false;

    const mdListType = metadata.frontmatter["md_list_type"];
    return !!mdListType;
  }

  // Single screen-reader live region for the whole view. Tag components
  // report through their onannounce prop rather than creating their own
  // region - multiple polite regions interleave unpredictably.
  let announceMessage = $state("");
  let announceTimer: number | undefined;
  function announce(msg: string): void {
    if (announceTimer !== undefined) window.clearTimeout(announceTimer);
    announceTimer = window.setTimeout(() => {
      announceMessage = msg;
    }, 250);
  }

  $effect(() => {
    const shown = visibleEntryData.length;
    const total = entryData.length;
    const tagPart =
      activeTagFilterCount > 0 ? `, ${describeTagFilters(tagFilters)}` : "";
    announce(`${shown} of ${total} notes shown${tagPart}`);
  });

  function handleClearTagFilters(): void {
    if (!listFile) return;
    clearTagFiltersWrite(app, listFile);
    announce("Tag filters cleared");
  }

  // Summarizes ALL active filters (tag, length, link, target, search), since
  // any of them can be the reason the result set is empty - not just tags.
  let activeFilterSummary = $derived.by(() => {
    const parts: string[] = [];
    if (activeTagFilterCount > 0) parts.push(describeTagFilters(tagFilters));
    if (lengthFilter !== "all") {
      parts.push(`length ${lengthFilter} ${lengthValue} min`);
    }
    if (linkFilter !== "all") {
      parts.push(linkFilter === "link" ? "with link" : "text only");
    }
    if (targetFilter !== "all") {
      parts.push(`targets: ${targetFilter}`);
    }
    if (searchValue.trim()) {
      parts.push(`search "${searchValue.trim()}"`);
    }
    return parts.join(", ");
  });
</script>

<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<div class="list-container" tabindex="0" role="region" aria-label="List view">
  <div class="alb-sr-only" role="status" aria-live="polite">{announceMessage}</div>
  {#if isOmniList()}
    <div class="filters-container">
      <label for="active-target-select">Select your target:</label>
      <select
        id="active-target-select"
        value={activeTarget || ""}
        onchange={handleFilterSelect}
      >
        <option value="">All</option>
        {#each roster.targets as target}
          <option value={target.value}>{formatTarget(target)}</option>
        {/each}
      </select>

      <div class="target-filter-group">
        <label for="target-filter-select" class="filter-label">Show:</label>
        <select
          id="target-filter-select"
          value={targetFilter}
          onchange={handleTargetFilterChange}
        >
          <option value="all">All</option>
          <option value="filled">Filled Targets</option>
          <option value="empty">Empty Targets</option>
        </select>
      </div>

      <div class="target-filter-group">
        <label for="length-filter-select" class="filter-label">Length:</label>
        <select
          id="length-filter-select"
          value={lengthFilter}
          onchange={handleLengthFilterChange}
        >
          <option value="all">All</option>
          <option value="below">Below</option>
          <option value="above">Above</option>
        </select>
        {#if lengthFilter !== "all"}
          <input
            id="length-value-input"
            class="length-value-input"
            type="number"
            min="0"
            step="1"
            value={lengthValue}
            onchange={handleLengthValueChange}
            aria-label="Length in minutes"
          />
          <span class="filter-unit">min</span>
        {/if}
      </div>

      <div class="target-filter-group">
        <label for="link-filter-select" class="filter-label">Link:</label>
        <select
          id="link-filter-select"
          value={linkFilter}
          onchange={handleLinkFilterChange}
        >
          <option value="all">All</option>
          <option value="link">With link</option>
          <option value="text">Text only</option>
        </select>
      </div>

      {#if tagsEnabled}
        <div class="filter-separator"></div>
        <div class="filter-tag-slot">
          <TagCloud
            {app}
            {listFile}
            vocabulary={listTags}
            {entryTagLists}
            filters={tagFilters}
            onannounce={announce}
          />
        </div>
        <div class="filter-separator"></div>
      {/if}

      <div class="search-group">
        {#if showSearch || searchValue}
          <label for="list-search-input">Search:</label>
          <input
            id="list-search-input"
            type="text"
            class="search-input"
            placeholder="Search..."
            value={searchValue}
            oninput={handleSearchChange}
            bind:this={searchInputEl}
            onblur={() => {
              if (!searchValue) showSearch = false;
            }}
          />
        {:else}
          <button
            class="search-toggle-btn"
            aria-label="Search"
            onclick={() => {
              showSearch = true;
              setTimeout(() => searchInputEl?.focus(), 0);
            }}
          >
            🔍
          </button>
        {/if}
      </div>
    </div>
  {/if}

  <div class="cards-grid">
    {#each visibleEntryData as { entry, filledProperties, emptyProperties, fileContent, imageUrl } (entry.file.path)}
      {@const entryTags = entryTagsByPath.get(entry.file.path) ?? []}
      {@const entryLink = extractEntryLink(entry)}
      {@const entryLength = getEntryLengthMinutes(entry)}
      {@const backupLink = extractEntryBackupLink(entry)}
      <div class="card {getEntryClasses(entry)}">
        <button
          class="card-image-area"
          class:card-image-empty={!imageUrl}
          aria-label={`Open ${entry.file.basename}`}
          onclick={() => handleFileContentClick(entry)}
        >
          {#if imageUrl}
            <img src={imageUrl} alt="" loading="lazy" />
          {:else}
            <span class="card-image-placeholder">📄</span>
          {/if}
        </button>
        <div class="card-body">
          {#each filledProperties.filter((p) => !getPropertyUrl(p)) as propData (propData.propertyFull)}
            <div class="property">
              <label
                class="property-label"
                for={`${entry.file.path}-${propData.propertyFull}`}
                >{propData.label}</label
              >
              {#if propData.propertyType === "note"}
                <EditableTextarea
                  {renderContext}
                  {app}
                  sourcePath={entry.file.path}
                  id={`${entry.file.path}-${propData.propertyFull}`}
                  value={propData.value}
                  onchange={(newValue) =>
                    handlePropertyChange(
                      entry,
                      propData.propertyName,
                      newValue,
                    )}
                />
              {:else}
                <span
                  class="property-value"
                  use:renderPropertyValue={propData.value}
                ></span>
              {/if}
            </div>
          {/each}
          {#if filledProperties.some((p) => getPropertyUrl(p))}
            <div class="link-properties-row">
              {#each filledProperties.filter((p) => getPropertyUrl(p)) as propData (propData.propertyFull)}
                <a
                  class="link-property"
                  href={getPropertyUrl(propData)}
                  target="_blank"
                  rel="noopener"
                >{propData.label}</a>
              {/each}
            </div>
          {/if}
          {#if tagsEnabled}
            <EntryTags
              {app}
              {entry}
              {listFile}
              tags={entryTags}
              vocabulary={listTags}
              onannounce={announce}
            />
          {/if}
          {#if entryLength !== null || backupLink}
            <div class="card-meta-row">
              {#if entryLength !== null}
                <span class="card-meta-badge">⏱️ {entryLength} min</span>
              {/if}
              {#if backupLink}
                <a
                  class="card-meta-link"
                  href={backupLink}
                  target="_blank"
                  rel="noopener"
                >
                  💾 Backup
                </a>
              {/if}
            </div>
          {/if}
          <div class="target-controls">
            <GroupsAndTargetsSelector
              {entry}
              {app}
              groups={roster.groups}
              targets={roster.targets}
              propertyName="md_targets"
              label="Targets:"
            />
          </div>
          {#if emptyProperties.length > 0}
            <div class="empty-properties-container">
              {#each emptyProperties as propData (propData.propertyFull)}
                <span class="empty-property-label">{propData.label}</span>
              {/each}
            </div>
          {/if}
        </div>
        <div class="actions-container">
          {#if activeTarget}
            <span class="active-target-chip">{activeTargetLabel}</span>
            {#if entryLink}
              <button class="btn-primary" onclick={() => handleWatch(entry)}>
                Watch
              </button>
            {/if}
            <button class="btn-regular" onclick={() => handleMarkAsRead(entry)}>
              {isEntryMarkedAsRead(entry) ? "Unmark" : "Mark Read"}
            </button>
          {/if}
          {#if entryLink}
            <button class="btn-regular" onclick={() => openRedditUrl(entry)}>
              Open
            </button>
          {/if}
          <button class="btn-destructive" onclick={() => handleRemove(entry)}>
            {isEntryMarkedAsDone(entry) ? "Restore" : "Remove"}
          </button>
        </div>
      </div>
    {/each}
  </div>

  {#if visibleEntryData.length === 0 && entryData.length > 0}
    <div class="no-results">
      <p>
        No notes match the current filters{#if activeFilterSummary}
          : {activeFilterSummary}{/if}.
      </p>
      {#if activeTagFilterCount > 0 && listFile}
        <button type="button" onclick={handleClearTagFilters}>
          Clear tag filters
        </button>
      {/if}
    </div>
  {/if}
</div>

<style>
  .list-container {
    padding: 1rem;
  }

  .list-container:focus {
    outline: none;
  }

  .filters-container {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.75rem;
    margin-bottom: 1.5rem;
    padding-bottom: 1rem;
    border-bottom: 1px solid var(--background-modifier-border);
  }

  .filters-container label {
    font-weight: 500;
    color: var(--text-normal);
  }

  .filters-container select {
    padding: 0 0.8rem;
    border: 1px solid var(--background-modifier-border);
    border-radius: 4px;
    background-color: var(--background-primary);
    color: var(--text-normal);
    cursor: pointer;
    font-size: 0.85rem;
  }

  .filters-container select:focus {
    outline: none;
    border-color: var(--interactive-accent);
  }

  .search-group {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .search-toggle-btn {
    padding: 0.3rem 0.6rem;
    border: 1px solid var(--background-modifier-border);
    border-radius: 4px;
    background-color: var(--background-primary);
    color: var(--text-normal);
    cursor: pointer;
    font-size: 0.9rem;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.08);
  }

  .search-toggle-btn:hover {
    border-color: var(--interactive-accent);
  }

  .search-group label {
    font-weight: 500;
    color: var(--text-normal);
    white-space: nowrap;
  }

  .search-input {
    padding: 0.4rem 0.8rem;
    border: 1px solid var(--background-modifier-border);
    border-radius: 4px;
    background-color: var(--background-primary);
    color: var(--text-normal);
    font-size: 0.95rem;
    min-width: 200px;
  }

  .search-input:focus {
    outline: none;
    border-color: var(--interactive-accent);
  }

  .target-filter-group {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-wrap: wrap;
  }

  .filter-label {
    font-weight: 500;
    color: var(--text-normal);
    white-space: nowrap;
  }

  .length-value-input {
    width: 4rem;
    padding: 0 0.4rem;
    border: 1px solid var(--background-modifier-border);
    border-radius: 4px;
    background-color: var(--background-primary);
    color: var(--text-normal);
    font-size: 0.85rem;
  }

  .length-value-input:focus {
    outline: none;
    border-color: var(--interactive-accent);
  }

  .filter-unit {
    font-weight: 500;
    color: var(--text-muted);
    white-space: nowrap;
  }

  .cards-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
    gap: 0.75rem;
  }

  .card {
    display: flex;
    flex-direction: column;
    padding: 0;
    background-color: var(--background-primary);
    border: 1px solid var(--background-modifier-border);
    border-radius: 8px;
    overflow: hidden;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
    transition:
      box-shadow 0.15s ease,
      transform 0.15s ease;
  }

  .card:hover {
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.12);
  }

  .card-image-area {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 180px;
    padding: 0;
    border: none;
    border-bottom: 1px solid var(--background-modifier-border);
    background-color: var(--background-secondary);
    cursor: pointer;
    overflow: hidden;
  }

  .card-image-empty {
    height: auto;
    min-height: 2rem;
  }

  .card-image-area img {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }

  .card-image-area:hover img {
    transform: scale(1.02);
    transition: transform 0.2s ease;
  }

  .card-image-placeholder {
    font-size: 2.5rem;
    opacity: 0.35;
  }

  .card-body {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    padding: 0 5px;
    flex: 1;
  }

  .card-entry-about-to-disappear,
  .entry-about-to-disappear {
    opacity: 0.5;
  }

  .entry-targets-empty {
    background-color: hsla(2, 88%, 59%, 0.15);
    border-color: hsla(2, 88%, 59%, 0.5);
  }

  .entry-targets-empty .card-image-area {
    background-color: hsla(2, 88%, 59%, 0.1);
  }

  .property {
    display: flex;
    flex-direction: column;
    margin-bottom: 0.1rem;
    gap: 0.1rem;
  }

  .property-label {
    font-weight: 600;
    font-size: 0.85rem;
  }

  .error {
    color: var(--text-error);
    font-style: italic;
  }

  .actions-container {
    display: flex;
    gap: 0.3rem;
    padding: 0.45rem 0.6rem 0.55rem 0.6rem;
    border-top: 1px solid var(--background-modifier-border);
    flex-wrap: wrap;
    align-items: center;
    margin-top: auto;
  }

  .active-target-chip {
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--text-muted);
    padding: 0.15rem 0.1rem 0.15rem 0;
    white-space: nowrap;
  }

  .btn-primary,
  .btn-regular,
  .btn-destructive {
    padding: 0.25rem 0.55rem;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-size: 0.78rem;
    font-weight: 500;
    transition: opacity 0.2s;
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
  }

  .btn-primary {
    background-color: var(--interactive-accent);
    color: var(--text-on-accent);
  }

  .btn-primary:disabled {
    opacity: 0.4;
    cursor: not-allowed;
    filter: grayscale(0.7);
  }

  .btn-regular {
    background-color: var(--background-modifier-border);
    color: var(--text-normal);
  }

  .btn-destructive {
    background-color: var(--text-error);
    color: var(--text-on-accent);
  }

  .target-controls {
    display: flex;
    flex-direction: row;
    gap: 0.5rem;
    align-items: start;
    flex-wrap: wrap;
  }

  .link-properties-row {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
    align-items: center;
  }

  .card-meta-row {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
    align-items: center;
    margin: 0.2rem 0;
  }

  .card-meta-badge {
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--text-muted);
    padding: 0.1rem 0.45rem;
    border-radius: 4px;
    background-color: var(--background-secondary);
    white-space: nowrap;
  }

  .card-meta-link {
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--link-color, var(--interactive-accent));
    text-decoration: none;
    padding: 0.1rem 0.45rem;
    border-radius: 4px;
    background-color: var(--background-secondary);
    white-space: nowrap;
  }

  .card-meta-link:hover {
    text-decoration: underline;
    background-color: var(--background-modifier-hover);
  }

  .link-property {
    font-size: 0.8rem;
    font-weight: 500;
    color: var(--link-color, var(--interactive-accent));
    text-decoration: none;
    padding: 0.15rem 0.4rem;
    border-radius: 4px;
    background-color: var(--background-secondary);
  }

  .link-property:hover {
    text-decoration: underline;
    background-color: var(--background-modifier-hover);
  }

  .empty-properties-container {
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem;
    margin-top: 0.35rem;
    padding-top: 0.3rem;
    border-top: 1px solid var(--background-modifier-border);
    opacity: 0.55;
  }

  .empty-property-label {
    font-size: 0.7rem;
    color: var(--text-muted);
    font-weight: 500;
    text-decoration: line-through;
  }

  .filter-separator {
    width: 1px;
    align-self: stretch;
    background-color: var(--background-modifier-border);
    margin: 0 0.25rem;
  }

  .filter-tag-slot {
    flex: 1 1 auto;
    min-width: 0;
  }

  .no-results {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 0.5rem;
    padding: 2rem 1rem;
    color: var(--text-muted);
    text-align: left;
  }

  .no-results button {
    padding: 0.3rem 0.7rem;
    border: 1px solid var(--background-modifier-border);
    border-radius: 4px;
    background-color: var(--background-primary);
    color: var(--text-normal);
    cursor: pointer;
    font-size: 0.85rem;
  }

  .no-results button:hover {
    border-color: var(--interactive-accent);
  }
</style>
