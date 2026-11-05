import { getDataConfiguration } from "@/server/config";
import { createBackendClient } from "@/server/supabase";
import { DemoRegistrationRepository } from "@/repositories/demo-repository";
import { generateRegistrationExcel } from "@/domain/excel-export";
import { registrationSnapshotSchema, type RegistrationSnapshot } from "@/domain/registration";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const config = getDataConfiguration();
    let snapshot: RegistrationSnapshot;

    if (config.mode === "supabase") {
      const { client, config: backendConfig } = createBackendClient();
      const { data, error } = await client.rpc("registration_snapshot", { p_event_slug: backendConfig.eventSlug });
      if (error || !data) throw new Error("Gagal mengambil data dari database.");
      snapshot = registrationSnapshotSchema.parse(data);
    } else {
      const demoRepo = new DemoRegistrationRepository();
      snapshot = await demoRepo.getSnapshot();
      demoRepo.dispose();
    }

    const uint8 = generateRegistrationExcel(snapshot);

    return new Response(uint8 as unknown as BodyInit, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": 'attachment; filename="sai-bumi-enigma-rekap-pendaftaran.xlsx"',
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Gagal mengekspor data Excel.";
    return Response.json({ error: { message } }, { status: 500 });
  }
}
