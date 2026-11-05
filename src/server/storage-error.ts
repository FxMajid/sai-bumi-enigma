import "server-only";
import { z } from "zod";

/** SDK statusCode can be the API's named code rather than the HTTP number. */
export function isDuplicateStorageError(error: unknown): boolean {
  const parsed = z.object({
    status: z.number().optional(),
    statusCode: z.union([z.string(), z.number()]).optional(),
    code: z.string().optional(),
  }).safeParse(error);
  if (!parsed.success) return false;
  return parsed.data.status === 409 || String(parsed.data.statusCode) === "409"
    || ["ResourceAlreadyExists", "KeyAlreadyExists"].includes(parsed.data.code ?? String(parsed.data.statusCode));
}
