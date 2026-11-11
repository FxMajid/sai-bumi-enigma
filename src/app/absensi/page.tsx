import { AttendanceApp } from "@/components/attendance-app";
import { SiteHeader } from "@/components/site-header";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Absensi Agent — The Sai Bumi Enigma",
  description: "Sistem absensi dan identitas detektif resmi The Sai Bumi Enigma 2026 dengan verifikasi lokasi dan pemindai barcode / QR code.",
};

export default function AttendancePage() {
  return (
    <>
      <a href="#main" className="skip-link">Lewati ke konten utama</a>
      <SiteHeader activeNav="absensi" />
      <main id="main">
        <AttendanceApp />
      </main>
      <footer className="site-footer">
        <div className="tapis-line" aria-hidden="true" />
        <div>
          <span>THE SAI BUMI ENIGMA</span>
          <p>Merangkai langkah. Menemukan cerita.</p>
          <span>LAMPUNG · 2026</span>
        </div>
      </footer>
    </>
  );
}

