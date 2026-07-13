import { DEFAULT_SORT_OUTPUT_FOLDER_LABEL } from "../constants";

/**
 * Default sort output path string when Electron `getDefaultOutputDir` is unavailable (e.g. plain browser).
 * Matches backend `pathlib.Path(...).expanduser()` — same convention as the desktop app.
 */
export function defaultSortOutputPathForBackend(): string {
  return `~/Documents/${DEFAULT_SORT_OUTPUT_FOLDER_LABEL}`;
}
