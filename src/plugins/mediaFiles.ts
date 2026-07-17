import { registerPlugin } from "@capacitor/core";

export type MediaFilesPayload = {
  /** Raw base64 or data-URL base64 */
  data: string;
  filename: string;
  mimeType: string;
};

export interface MediaFilesPlugin {
  save(options: MediaFilesPayload): Promise<{ uri?: string; filename?: string }>;
  share(options: MediaFilesPayload): Promise<{ shared?: boolean }>;
}

export const MediaFiles = registerPlugin<MediaFilesPlugin>("MediaFiles");
