import "server-only";
import { createClient } from "@supabase/supabase-js";
import { getBackendConfig } from "./config";

export function createBackendClient() {
  const config = getBackendConfig();
  const client = createClient(config.url, config.key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: {
      fetch: (input, init) => fetch(input, { ...init, cache: "no-store", signal: AbortSignal.timeout(10_000) }),
    },
  });
  return { client, config };
}
