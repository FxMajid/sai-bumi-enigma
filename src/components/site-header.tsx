import Link from "next/link";
import { event } from "@/config/event";
import { Icon } from "./icon";

export function SiteHeader({ activeNav }: { activeNav?: "quiz" | "pendaftaran" | "absensi" }) {
  return (
    <header className="site-header">
      <Link href="/quiz" className="brand" aria-label={`${event.name}, menu utama`}>
        <span className="brand-mark" aria-hidden="true">
          <Icon name="compass" size={25} />
        </span>
        <span>
          SAI BUMI <strong>ENIGMA</strong>
        </span>
      </Link>
      <nav aria-label="Navigasi utama" className="header-nav">
        <Link
          href="/absensi"
          className={`nav-link ${activeNav === "absensi" ? "is-active" : ""}`}
        >
          Absensi Agent
        </Link>
        <Link
          href="/quiz"
          className={`nav-link ${activeNav === "quiz" ? "is-active" : ""}`}
        >
          Quiz Investigasi
        </Link>
        <Link
          href="/pendaftaran"
          className={`nav-link ${activeNav === "pendaftaran" ? "is-active" : ""}`}
        >
          Pendaftaran Tim
        </Link>
        <Link
          href="/pendaftaran#kelompok"
          className="nav-link"
        >
          Daftar Kelompok
        </Link>
      </nav>
      <span className="header-year">
        LAMPUNG <span aria-hidden="true">/</span> 2026
      </span>
    </header>
  );
}
