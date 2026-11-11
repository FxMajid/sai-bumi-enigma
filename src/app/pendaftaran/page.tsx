import { event } from "@/config/event";
import { getDataConfiguration } from "@/server/config";
import { RegistrationApp } from "@/components/registration-app";
import { SiteHeader } from "@/components/site-header";
import { Icon } from "@/components/icon";

export const dynamic = "force-dynamic";

export default function PendaftaranPage() {
  return (
    <>
      <a href="#main" className="skip-link">Lewati ke konten utama</a>
      <SiteHeader activeNav="pendaftaran" />
      <main id="main" className="page-shell">
        <section className="hero" aria-labelledby="event-title">
          <div className="hero-eyebrow">
            <span className="eyebrow">SEBUAH PERJALANAN, SEBUAH KEBERSAMAAN</span>
            <span className="edition">PRA-RAKER & RAKER 2026</span>
          </div>
          <div className="hero-intro">
            <div>
              <span className="eyebrow">PENDAFTARAN TIM INVESTIGASI</span>
              <h1 id="event-title">
                PENDAFTARAN<br /> <em>TIM INVESTIGASI</em>
                <span className="sr-only"> {event.name}</span>
              </h1>
            </div>
            <div className="hero-details">
              <p>{event.subtitle}</p>
              <div className="schedule">
                {event.schedule.map((item) => (
                  <div key={item.label}>
                    <Icon name="calendar" size={17} />
                    <span>
                      <span className="schedule-label">{item.label}</span>
                      <time dateTime={item.start}>{item.display}</time>
                    </span>
                  </div>
                ))}
              </div>
              <p className="hero-instruction">
                Cukup <strong>satu perwakilan tim</strong> mengisi pendaftaran untuk seluruh anggota. Aturan kelompok: <strong>9 orang (3 kelompok)</strong> dan <strong>8 orang (1 kelompok)</strong>.
              </p>
            </div>
          </div>
        </section>
        <RegistrationApp configuration={getDataConfiguration()} />
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

