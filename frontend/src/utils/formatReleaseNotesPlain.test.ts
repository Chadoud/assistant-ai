import { describe, expect, it } from "vitest";
import { formatReleaseNotesPlain } from "./formatReleaseNotesPlain";

describe("formatReleaseNotesPlain", () => {
  it("strips markdown headings, bullets, and bold", () => {
    const input = `### Added

- **Settings → About & help:** Manual **Check for updates** with status.

### Fixed

- **To Do / mail sync:** Security emails are no longer tasks.`;

    expect(formatReleaseNotesPlain(input)).toBe(
      "Added\n\n• Settings → About & help: Manual Check for updates with status.\n\nFixed\n\n• To Do / mail sync: Security emails are no longer tasks.",
    );
  });
});
