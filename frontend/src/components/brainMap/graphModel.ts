/**
 * Pure graph model for the 3D brain map.
 *
 * Builds nodes + links from the real second-brain stores (memories,
 * conversations, tasks) AND from sorted files on disk (context index).
 */

import type { BrainFolder } from "../../api/brain";
import type { MemoryCategory, ScopedMemoryEntry } from "../../api/memory";
import type { ConversationSummary } from "../../api/conversationsStore";
import type { Task } from "../../api/tasks";

export type BrainNodeKind =
  | "root"
  | "category"
  | "memory"
  | "conversation"
  | "task"
  | "folder"
  | "file";

export interface BrainNodePreview {
  /** One-line context under the title (profile, excerpt, summary). */
  subtitle?: string;
  /** Short list — file names, keywords, etc. */
  items?: string[];
  /** Count of list items not shown (e.g. more files in folder). */
  itemOverflow?: number;
  /** Footer line — counts, path hint, category scope. */
  meta?: string;
}

export interface BrainNode {
  id: string;
  kind: BrainNodeKind;
  label: string;
  detail: string;
  color: number;
  radius: number;
  conversationId?: string;
  /** SQLite task id — used to resolve mail/calendar/chat open targets. */
  taskId?: number;
  /** SQLite memory id — used to resolve memory open targets. */
  memoryId?: number;
  /** Absolute path for file nodes (sorted documents on disk). */
  filePath?: string;
  folderName?: string;
  /** Rich hover content — built at graph construction time. */
  preview?: BrainNodePreview;
}

export interface BrainLink {
  source: string;
  target: string;
  restLength: number;
}

export interface BrainGraph {
  nodes: BrainNode[];
  links: BrainLink[];
}

export const ROOT_NODE_ID = "root:you";
export const TASKS_HUB_ID = "hub:tasks";
export const FILES_HUB_ID = "hub:files";
export const CONVERSATIONS_HUB_ID = "hub:conversations";

const MAX_MEMORIES = 150;
const MAX_CONVERSATIONS = 40;
const MAX_TASKS = 50;
const MAX_FOLDERS = 35;
const MAX_FILES_PER_FOLDER = 15;

const ROOT_COLOR = 0x3730a3;
const CONVERSATION_COLOR = 0x38bdf8;
const TASK_COLOR = 0xf97316;
const TASKS_HUB_COLOR = 0xf59e0b;
const FILES_HUB_COLOR = 0x6366f1;
const FOLDER_COLOR = 0x4f46e5;
const FILE_COLOR = 0x6366f1;

export const CATEGORY_COLORS: Record<MemoryCategory, number> = {
  identity: 0x60a5fa,
  preferences: 0xf472b6,
  projects: 0x34d399,
  context: 0xfbbf24,
  notes: 0x4f46e5,
  relationships: 0xfb7185,
  wishes: 0x2dd4bf,
};

const CATEGORY_LABELS: Record<MemoryCategory, string> = {
  identity: "Identity",
  preferences: "Preferences",
  projects: "Projects",
  context: "Context",
  notes: "Notes",
  relationships: "Relationships",
  wishes: "Wishes",
};

/** Localized strings for graph nodes. Kept out of the pure model so it stays i18n-agnostic. */
export interface BrainGraphLabels {
  you: string;
  rootDetail: string;
  yourFiles: string;
  filesDetail: string;
  tasks: string;
  tasksDetail: string;
  conversations: string;
  conversationsDetail: string;
  untitledConversation: string;
  noSummary: string;
  category: (category: MemoryCategory) => string;
  categoryDetail: (category: MemoryCategory) => string;
  filesInFolder: (count: number) => string;
  hoverMoreItems: (count: number) => string;
  memoriesInCategory: (count: number) => string;
  filesInHub: (fileCount: number, folderCount: number) => string;
  openTasksInHub: (count: number) => string;
  conversationsLinked: (count: number) => string;
  fileInFolder: (folderName: string) => string;
}

const DEFAULT_BRAIN_GRAPH_LABELS: BrainGraphLabels = {
  you: "You",
  rootDetail: "The center of your second brain — chat memories, tasks, and files on your computer.",
  yourFiles: "Your files",
  filesDetail: "Documents the assistant has sorted on your computer — grouped by folder.",
  tasks: "Tasks",
  tasksDetail: "Open action items — created in chat, meetings, or by hand.",
  conversations: "Conversations",
  conversationsDetail: "Chats the assistant summarized — linked to memories and tasks.",
  untitledConversation: "Untitled conversation",
  noSummary: "No summary yet.",
  category: (category) => CATEGORY_LABELS[category],
  categoryDetail: (category) =>
    `${CATEGORY_LABELS[category]} — facts the assistant remembers in this area.`,
  filesInFolder: (count) => `${count} file${count === 1 ? "" : "s"} in this folder.`,
  hoverMoreItems: (count) => `+${count} more`,
  memoriesInCategory: (count) => `${count} memor${count === 1 ? "y" : "ies"} in this area`,
  filesInHub: (fileCount, folderCount) =>
    `${fileCount} file${fileCount === 1 ? "" : "s"} across ${folderCount} folder${folderCount === 1 ? "" : "s"}`,
  openTasksInHub: (count) => `${count} open task${count === 1 ? "" : "s"}`,
  conversationsLinked: (count) => `${count} conversation${count === 1 ? "" : "s"}`,
  fileInFolder: (folderName) => `In ${folderName}`,
};

const CONVERSATIONS_HUB_COLOR = 0x0ea5e9;

export function isMapHubNode(node: Pick<BrainNode, "id" | "kind">): boolean {
  return node.kind === "root" || node.kind === "category";
}

/** Nodes the user may drag to rearrange the map (folders + category hubs; not root or leaves). */
export function isLayoutAnchor(node: Pick<BrainNode, "id" | "kind">): boolean {
  if (node.id === ROOT_NODE_ID || node.kind === "root") return false;
  return node.kind === "category" || node.kind === "folder";
}

const ROOT_HUB_DISTANCE = 62;
const HUB_LEAF_DISTANCE = 26;
const ROOT_FILES_DISTANCE = 72;
const FOLDER_FILE_DISTANCE = 22;
const CROSS_LINK_DISTANCE = 36;

const HOVER_PREVIEW_ITEMS = 6;

function previewItems(names: string[], total: number): Pick<BrainNodePreview, "items" | "itemOverflow"> {
  const items = names.slice(0, HOVER_PREVIEW_ITEMS);
  const overflow = Math.max(0, total - items.length);
  return { items, itemOverflow: overflow > 0 ? overflow : undefined };
}

function truncate(text: string, max = 42): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length <= max ? clean : `${clean.slice(0, max - 1)}…`;
}

function folderNodeId(name: string): string {
  return `folder:${encodeURIComponent(name)}`;
}

function fileNodeId(path: string): string {
  let hash = 0;
  for (let i = 0; i < path.length; i++) {
    hash = (Math.imul(31, hash) + path.charCodeAt(i)) | 0;
  }
  return `file:${(hash >>> 0).toString(16)}`;
}

export function buildBrainGraph(
  input: {
    memories: ScopedMemoryEntry[];
    conversations: ConversationSummary[];
    tasks: Task[];
    fileFolders?: BrainFolder[];
  },
  labels: BrainGraphLabels = DEFAULT_BRAIN_GRAPH_LABELS,
): BrainGraph {
  const nodes: BrainNode[] = [];
  const links: BrainLink[] = [];

  nodes.push({
    id: ROOT_NODE_ID,
    kind: "root",
    label: labels.you,
    detail: labels.rootDetail,
    color: ROOT_COLOR,
    radius: 9,
  });

  const conversations = input.conversations
    .filter((c) => (c.title || c.summary || "").trim().length > 0)
    .slice(0, MAX_CONVERSATIONS);
  const conversationIds = new Set(conversations.map((c) => c.id));
  if (conversations.length > 0) {
    nodes.push({
      id: CONVERSATIONS_HUB_ID,
      kind: "category",
      label: labels.conversations,
      detail: labels.conversationsDetail,
      color: CONVERSATIONS_HUB_COLOR,
      radius: 5.5,
      preview: { meta: labels.conversationsLinked(conversations.length) },
    });
    links.push({ source: ROOT_NODE_ID, target: CONVERSATIONS_HUB_ID, restLength: ROOT_HUB_DISTANCE });
  }
  for (const convo of conversations) {
    const summary = (convo.summary || "").trim();
    const title = convo.title || labels.untitledConversation;
    nodes.push({
      id: `convo:${convo.id}`,
      kind: "conversation",
      label: truncate(title, 34),
      detail: summary || title || labels.noSummary,
      color: CONVERSATION_COLOR,
      radius: 3.4,
      conversationId: convo.id,
      preview: {
        subtitle: summary && summary !== title ? truncate(summary, 140) : undefined,
      },
    });
    links.push({
      source: CONVERSATIONS_HUB_ID,
      target: `convo:${convo.id}`,
      restLength: HUB_LEAF_DISTANCE,
    });
  }

  const fileFolders = (input.fileFolders ?? []).slice(0, MAX_FOLDERS);
  let fileNodeCount = 0;
  if (fileFolders.length > 0) {
    nodes.push({
      id: FILES_HUB_ID,
      kind: "category",
      label: labels.yourFiles,
      detail: labels.filesDetail,
      color: FILES_HUB_COLOR,
      radius: 6,
    });
    links.push({ source: ROOT_NODE_ID, target: FILES_HUB_ID, restLength: ROOT_FILES_DISTANCE });

    for (const folder of fileFolders) {
      const fid = folderNodeId(folder.folder_name);
      const profile = folder.profile.trim();
      const fileNames = folder.files.map((f) => f.name);
      nodes.push({
        id: fid,
        kind: "folder",
        label: truncate(folder.folder_name, 32),
        detail: profile ? profile : labels.filesInFolder(folder.file_count),
        color: FOLDER_COLOR,
        radius: 4.8,
        folderName: folder.folder_name,
        preview: {
          subtitle: profile ? truncate(profile, 140) : undefined,
          ...previewItems(fileNames, folder.file_count),
          meta: labels.filesInFolder(folder.file_count),
        },
      });
      links.push({ source: FILES_HUB_ID, target: fid, restLength: HUB_LEAF_DISTANCE + 8 });

      for (const file of folder.files.slice(0, MAX_FILES_PER_FOLDER)) {
        const id = fileNodeId(file.path);
        nodes.push({
          id,
          kind: "file",
          label: truncate(file.name, 36),
          detail: file.excerpt
            ? `${file.name}\n\n${file.excerpt}`
            : file.name,
          color: FILE_COLOR,
          radius: 2.2,
          filePath: file.path,
          folderName: folder.folder_name,
          preview: {
            subtitle: file.excerpt ? truncate(file.excerpt, 140) : undefined,
            meta: labels.fileInFolder(folder.folder_name),
          },
        });
        links.push({ source: fid, target: id, restLength: FOLDER_FILE_DISTANCE });
        fileNodeCount += 1;
      }
    }
  }

  const memories = input.memories.slice(0, MAX_MEMORIES);
  const memoryCountByCategory = new Map<MemoryCategory, number>();
  for (const memory of memories) {
    memoryCountByCategory.set(
      memory.category,
      (memoryCountByCategory.get(memory.category) ?? 0) + 1,
    );
  }
  const usedCategories = new Set<MemoryCategory>(memories.map((m) => m.category));
  for (const category of usedCategories) {
    const count = memoryCountByCategory.get(category) ?? 0;
    nodes.push({
      id: `hub:${category}`,
      kind: "category",
      label: labels.category(category),
      detail: labels.categoryDetail(category),
      color: CATEGORY_COLORS[category],
      radius: 5.5,
      preview: { meta: labels.memoriesInCategory(count) },
    });
    links.push({ source: ROOT_NODE_ID, target: `hub:${category}`, restLength: ROOT_HUB_DISTANCE });
  }

  for (const memory of memories) {
    const id = `memory:${memory.id}`;
    const fromConversation =
      memory.conversation_id && conversationIds.has(memory.conversation_id)
        ? memory.conversation_id
        : undefined;
    nodes.push({
      id,
      kind: "memory",
      label: truncate(memory.value, 38),
      detail: memory.value,
      color: CATEGORY_COLORS[memory.category],
      radius: memory.reviewed ? 2.6 : 2.1,
      conversationId: fromConversation,
      memoryId: memory.id,
      preview: {
        subtitle: memory.value.length > 38 ? truncate(memory.value, 160) : undefined,
      },
    });
    links.push({ source: `hub:${memory.category}`, target: id, restLength: HUB_LEAF_DISTANCE });
    if (fromConversation) {
      links.push({ source: `convo:${fromConversation}`, target: id, restLength: CROSS_LINK_DISTANCE });
    }
  }

  const openTasks = input.tasks.filter((t) => !t.completed).slice(0, MAX_TASKS);
  if (openTasks.length > 0) {
    nodes.push({
      id: TASKS_HUB_ID,
      kind: "category",
      label: labels.tasks,
      detail: labels.tasksDetail,
      color: TASKS_HUB_COLOR,
      radius: 5.5,
      preview: { meta: labels.openTasksInHub(openTasks.length) },
    });
    links.push({ source: ROOT_NODE_ID, target: TASKS_HUB_ID, restLength: ROOT_HUB_DISTANCE });
  }
  for (const task of openTasks) {
    const id = `task:${task.id}`;
    const fromConversation =
      task.source_conversation_id && conversationIds.has(task.source_conversation_id)
        ? task.source_conversation_id
        : undefined;
    nodes.push({
      id,
      kind: "task",
      label: truncate(task.description, 38),
      detail: task.description,
      color: TASK_COLOR,
      radius: 2.4,
      conversationId: fromConversation,
      taskId: task.id,
      preview: {
        subtitle:
          task.description.length > 38 ? truncate(task.description, 140) : undefined,
      },
    });
    links.push({ source: TASKS_HUB_ID, target: id, restLength: HUB_LEAF_DISTANCE });
    if (fromConversation) {
      links.push({ source: `convo:${fromConversation}`, target: id, restLength: CROSS_LINK_DISTANCE });
    }
  }


  const filesHub = nodes.find((n) => n.id === FILES_HUB_ID);
  if (filesHub && fileFolders.length > 0) {
    filesHub.preview = {
      meta: labels.filesInHub(fileNodeCount, fileFolders.length),
    };
  }

  const rootNode = nodes.find((n) => n.id === ROOT_NODE_ID);
  if (rootNode) {
    const parts: string[] = [];
    if (fileNodeCount > 0) parts.push(labels.filesInHub(fileNodeCount, fileFolders.length));
    if (memories.length > 0) parts.push(labels.memoriesInCategory(memories.length));
    if (conversations.length > 0) parts.push(labels.conversationsLinked(conversations.length));
    if (openTasks.length > 0) parts.push(labels.openTasksInHub(openTasks.length));
    rootNode.preview = parts.length > 0 ? { meta: parts.join(" · ") } : undefined;
  }

  return { nodes, links };
}
