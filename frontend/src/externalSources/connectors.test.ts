import { describe, expect, it } from "vitest";
import { EXTERNAL_SOURCE_CONNECTORS } from "./connectors";
import { EXTERNAL_SOURCE_ACCOUNT_GROUPS } from "./externalSourceAccountGroups";
import { EXTERNAL_SOURCE_IDS, type ExternalSourceId } from "./externalSourceIds";
import { WORKSPACE_SORT_GROUPED_CONNECTOR_IDS, WORKSPACE_SORT_SOURCE_GROUPS } from "./workspaceSortSourceGroups";

const EXPECTED_IDS = [
  "gmail",
  "google-drive",
  "google-calendar",
  "dropbox",
  "onedrive",
  "outlook",
  "notion",
  "s3",
  "slack",
  "whatsapp",
  "icloud",
  "infomaniak",
  "infomaniak-mail",
  "infomaniak-calendar",
] as const;

const WORKSPACE_BLOCK_DISABLED_IDS = new Set<string>([
  "notion",
  "s3",
  "slack",
  "whatsapp",
  "icloud",
  "google-calendar",
  "infomaniak-calendar",
]);

/** Connectors omitted from {@link EXTERNAL_SOURCE_ACCOUNT_GROUPS} (no cards under External sources). */
const EXTERNAL_SOURCE_IDS_HIDDEN_FROM_ACCOUNT_CARDS = new Set<ExternalSourceId>([
  "s3",
  "icloud",
]);

describe("EXTERNAL_SOURCE_CONNECTORS", () => {
  it("registers all connectors in the canonical order", () => {
    const ids = EXTERNAL_SOURCE_CONNECTORS.map((c) => c.id);
    expect(ids).toEqual(EXPECTED_IDS);
  });

  it("exposes a workspace block for each connector that is not temporarily hidden from Workspace", () => {
    for (const c of EXTERNAL_SOURCE_CONNECTORS) {
      if (WORKSPACE_BLOCK_DISABLED_IDS.has(c.id)) {
        expect(c.renderWorkspaceBlock, `connector "${c.id}" should be hidden on Workspace`).toBeNull();
        continue;
      }
      expect(
        c.renderWorkspaceBlock,
        `connector "${c.id}" is missing renderWorkspaceBlock`,
      ).not.toBeNull();
    }
  });

  it("every connector has a renderAccountCard function", () => {
    for (const c of EXTERNAL_SOURCE_CONNECTORS) {
      expect(
        typeof c.renderAccountCard,
        `connector "${c.id}" is missing renderAccountCard`,
      ).toBe("function");
    }
  });

  it("workspace sort sections list each Workspace-visible connector exactly once", () => {
    const groupedList = WORKSPACE_SORT_SOURCE_GROUPS.flatMap((g) => [...g.connectorIds]);
    expect(new Set(groupedList).size).toBe(groupedList.length);
    for (const c of EXTERNAL_SOURCE_CONNECTORS) {
      if (c.renderWorkspaceBlock != null) {
        expect(
          WORKSPACE_SORT_GROUPED_CONNECTOR_IDS.has(c.id),
          `add "${c.id}" to WORKSPACE_SORT_SOURCE_GROUPS or disable its workspace block`,
        ).toBe(true);
      } else {
        expect(WORKSPACE_SORT_GROUPED_CONNECTOR_IDS.has(c.id)).toBe(false);
      }
    }
  });

  it("account groups list each External sources connector once except ids hidden from the grid", () => {
    const flat = EXTERNAL_SOURCE_ACCOUNT_GROUPS.flatMap((g) => [...g.connectorIds]);
    expect(new Set(flat).size).toBe(flat.length);
    for (const id of EXTERNAL_SOURCE_IDS) {
      const count = flat.filter((x) => x === id).length;
      if (EXTERNAL_SOURCE_IDS_HIDDEN_FROM_ACCOUNT_CARDS.has(id)) {
        expect(count).toBe(0);
      } else {
        expect(count).toBe(1);
      }
    }
  });
});
