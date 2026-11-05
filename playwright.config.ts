import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  use: { baseURL: "http://127.0.0.1:3101", trace: "retain-on-failure", channel: process.env.PLAYWRIGHT_CHROME_CHANNEL },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["iPhone 13"], defaultBrowserType: "chromium" } },
  ],
  webServer: [
    { command: "npm run start -- --hostname 127.0.0.1 --port 3101", url: "http://127.0.0.1:3101", reuseExistingServer: false, env: { APP_DATA_MODE: "demo" } },
    { command: "npm run start -- --hostname 127.0.0.1 --port 3102", url: "http://127.0.0.1:3102", reuseExistingServer: false, env: { APP_DATA_MODE: "supabase", SUPABASE_URL: "", SUPABASE_SECRET_KEY: "", SUPABASE_SERVICE_ROLE_KEY: "" } },
    { command: "npm run start -- --hostname 127.0.0.1 --port 3103", url: "http://127.0.0.1:3103", reuseExistingServer: false, env: { APP_DATA_MODE: "supabase", SUPABASE_URL: "http://127.0.0.1:9", SUPABASE_SECRET_KEY: "sb_secret_synthetic_unreachable_backend_key_000000", SUPABASE_EVENT_SLUG: "synthetic-test", SUPABASE_STORAGE_BUCKET: "sai-bumi-team-photos", RATE_LIMIT_SECRET: "" } },
  ],
});
