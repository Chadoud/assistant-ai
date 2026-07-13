/**
 * API client for second-brain graph sources (sorted files on disk).
 */

import { z } from "zod";
import { requestValidated } from "./client";

const BrainFileSchema = z.object({
  path: z.string(),
  name: z.string(),
  excerpt: z.string(),
  updated_at: z.number(),
});

const BrainFolderSchema = z.object({
  folder_name: z.string(),
  file_count: z.number(),
  profile: z.string(),
  keywords: z.array(z.string()),
  updated_at: z.number(),
  files: z.array(BrainFileSchema),
});

export type BrainFolder = z.infer<typeof BrainFolderSchema>;

const BrainFilesResponseSchema = z.object({
  folders: z.array(BrainFolderSchema),
  folder_count: z.number(),
  file_count: z.number(),
});

type BrainFilesResponse = z.infer<typeof BrainFilesResponseSchema>;

export function fetchBrainFiles(
  maxFolders = 35,
  maxFilesPerFolder = 15,
): Promise<BrainFilesResponse> {
  return requestValidated(
    `/brain/files?max_folders=${maxFolders}&max_files_per_folder=${maxFilesPerFolder}`,
    BrainFilesResponseSchema,
  );
}
