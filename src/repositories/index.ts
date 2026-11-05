import type { DataConfiguration } from "@/config/runtime";
import type { RegistrationRepository } from "./registration-repository";

export async function createRegistrationRepository(configuration: DataConfiguration): Promise<RegistrationRepository> {
  if (configuration.mode === "demo") {
    const { DemoRegistrationRepository } = await import("./demo-repository");
    return new DemoRegistrationRepository();
  }
  if (configuration.mode === "supabase") {
    const { HttpRegistrationRepository } = await import("./http-repository");
    return new HttpRegistrationRepository();
  }
  throw new Error("Layanan pendaftaran belum dikonfigurasi.");
}
