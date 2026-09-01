export const WORKSPACE_ENCODING_HEADER: string;
export const GZIP_ENCODING: string;
export function compressionAvailable(): boolean;
export function gzipText(text: string): Promise<Uint8Array>;
export function gunzipToText(bytes: Uint8Array | ArrayBuffer, maxBytes: number): Promise<string>;
export class WorkspaceTooLargeError extends Error { code: string }
