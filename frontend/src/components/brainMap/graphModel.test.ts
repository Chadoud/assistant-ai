import { describe, expect, it } from "vitest";
import { buildBrainGraph, isLayoutAnchor, ROOT_NODE_ID } from "./graphModel";
import type { ScopedMemoryEntry } from "../../api/memory";
import type { ConversationSummary } from "../../api/conversationsStore";
import type { Task } from "../../api/tasks";

function memory(overrides: Partial<ScopedMemoryEntry> = {}): ScopedMemoryEntry {
  return {
    id: 1,
    category: "projects",
    key: "current_project",
    value: "Building the AI file manager",
    conversation_id: null,
    updated_at: "2026-06-10T10:00:00Z",
    source: "manual",
    reviewed: true,
    ...overrides,
  };
}

function conversation(overrides: Partial<ConversationSummary> = {}): ConversationSummary {
  return {
    id: "c1",
    title: "Planning session",
    summary: "Discussed the roadmap.",
    category: "work",
    emoji: null,
    action_items: [],
    created_at: "2026-06-10T09:00:00Z",
    updated_at: "2026-06-10T09:30:00Z",
    ...overrides,
  };
}

function task(overrides: Partial<Task> = {}): Task {
  return {
    id: 1,
    description: "Ship the brain map",
    due_at: null,
    priority: "normal",
    completed: false,
    completed_at: null,
    source: "manual",
    source_conversation_id: null,
    created_at: "2026-06-10T10:00:00Z",
    updated_at: "2026-06-10T10:00:00Z",
    ...overrides,
  };
}

describe("buildBrainGraph", () => {
  it("always contains the root node", () => {
    const graph = buildBrainGraph({ memories: [], conversations: [], tasks: [] });
    expect(graph.nodes.map((n) => n.id)).toContain(ROOT_NODE_ID);
    expect(graph.links).toHaveLength(0);
  });

  it("links memories to their category hub and the hub to root", () => {
    const graph = buildBrainGraph({ memories: [memory()], conversations: [], tasks: [] });
    expect(graph.links).toContainEqual(
      expect.objectContaining({ source: ROOT_NODE_ID, target: "hub:projects" }),
    );
    expect(graph.links).toContainEqual(
      expect.objectContaining({ source: "hub:projects", target: "memory:1" }),
    );
  });

  it("cross-links memories and tasks to their source conversation", () => {
    const graph = buildBrainGraph({
      memories: [memory({ conversation_id: "c1" })],
      conversations: [conversation()],
      tasks: [task({ source_conversation_id: "c1", source: "conversation" })],
    });
    expect(graph.links).toContainEqual(
      expect.objectContaining({ source: "convo:c1", target: "memory:1" }),
    );
    expect(graph.links).toContainEqual(
      expect.objectContaining({ source: "convo:c1", target: "task:1" }),
    );
  });

  it("ignores conversation references that are not in the loaded set", () => {
    const graph = buildBrainGraph({
      memories: [memory({ conversation_id: "missing" })],
      conversations: [],
      tasks: [],
    });
    const memoryNode = graph.nodes.find((n) => n.id === "memory:1");
    expect(memoryNode?.conversationId).toBeUndefined();
    expect(graph.links.some((l) => l.source.startsWith("convo:"))).toBe(false);
  });

  it("excludes completed tasks and omits the tasks hub when none are open", () => {
    const graph = buildBrainGraph({
      memories: [],
      conversations: [],
      tasks: [task({ completed: true, completed_at: "2026-06-10T11:00:00Z" })],
    });
    expect(graph.nodes.some((n) => n.id === "hub:tasks")).toBe(false);
    expect(graph.nodes.some((n) => n.kind === "task")).toBe(false);
  });

  it("includes sorted files under a Your files hub", () => {
    const graph = buildBrainGraph({
      memories: [],
      conversations: [],
      tasks: [],
      fileFolders: [
        {
          folder_name: "Invoices",
          file_count: 2,
          profile: "Paid bills",
          keywords: ["invoice"],
          updated_at: 1,
          files: [
            {
              path: "C:/docs/Invoices/jan.pdf",
              name: "jan.pdf",
              excerpt: "Electric bill January",
              updated_at: 1,
            },
          ],
        },
      ],
    });
    expect(graph.nodes.some((n) => n.id === "hub:files")).toBe(true);
    expect(graph.nodes.some((n) => n.kind === "folder" && n.label === "Invoices")).toBe(true);
    expect(graph.nodes.some((n) => n.kind === "file" && n.filePath?.includes("jan.pdf"))).toBe(true);
    expect(graph.links.some((l) => l.source === "hub:files")).toBe(true);
    const folderNode = graph.nodes.find((n) => n.kind === "folder");
    expect(folderNode?.preview?.items).toContain("jan.pdf");
    expect(folderNode?.preview?.meta).toMatch(/folder/i);
  });

  it("links conversations through a conversations hub", () => {
    const graph = buildBrainGraph({
      memories: [],
      conversations: [conversation()],
      tasks: [],
    });
    expect(graph.nodes.some((n) => n.id === "hub:conversations")).toBe(true);
    expect(graph.links).toContainEqual(
      expect.objectContaining({ source: "hub:conversations", target: "convo:c1" }),
    );
    expect(graph.links.some((l) => l.source === "root:you" && l.target === "convo:c1")).toBe(false);
  });

  it("stores taskId and memoryId on leaf nodes", () => {
    const graph = buildBrainGraph({
      memories: [memory()],
      conversations: [],
      tasks: [task()],
    });
    expect(graph.nodes.find((n) => n.id === "memory:1")?.memoryId).toBe(1);
    expect(graph.nodes.find((n) => n.id === "task:1")?.taskId).toBe(1);
  });

  it("every link endpoint resolves to a known node", () => {
    const graph = buildBrainGraph({
      memories: [memory(), memory({ id: 2, category: "identity", conversation_id: "c1" })],
      conversations: [conversation()],
      tasks: [task()],
    });
    const ids = new Set(graph.nodes.map((n) => n.id));
    for (const link of graph.links) {
      expect(ids.has(link.source)).toBe(true);
      expect(ids.has(link.target)).toBe(true);
    }
  });
});

describe("isLayoutAnchor", () => {
  it("treats folders and category hubs as draggable anchors", () => {
    expect(isLayoutAnchor({ id: "hub:files", kind: "category" })).toBe(true);
    expect(isLayoutAnchor({ id: "folder:Invoices", kind: "folder" })).toBe(true);
  });

  it("excludes root and leaf nodes", () => {
    expect(isLayoutAnchor({ id: ROOT_NODE_ID, kind: "root" })).toBe(false);
    expect(isLayoutAnchor({ id: "file:abc", kind: "file" })).toBe(false);
    expect(isLayoutAnchor({ id: "memory:1", kind: "memory" })).toBe(false);
  });
});

describe("isLayoutAnchor", () => {
  it("treats folders and category hubs as draggable anchors", () => {
    expect(isLayoutAnchor({ id: "hub:files", kind: "category" })).toBe(true);
    expect(isLayoutAnchor({ id: "folder:Invoices", kind: "folder" })).toBe(true);
  });

  it("excludes root and leaf nodes", () => {
    expect(isLayoutAnchor({ id: ROOT_NODE_ID, kind: "root" })).toBe(false);
    expect(isLayoutAnchor({ id: "file:abc", kind: "file" })).toBe(false);
    expect(isLayoutAnchor({ id: "memory:1", kind: "memory" })).toBe(false);
  });
});
