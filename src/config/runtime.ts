export type DataConfiguration =
  | { mode: "demo" }
  | { mode: "supabase" }
  | { mode: "unavailable"; reason: "missing-config" | "invalid-mode" };
