export class HttpJsonError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string);
}
export function readJsonResponse<T>(response: Response, fallback: string): Promise<T>;
