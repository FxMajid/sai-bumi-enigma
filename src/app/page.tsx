import { event } from "@/config/event";
import { getDataConfiguration } from "@/server/config";
import { RegistrationApp } from "@/components/registration-app";
import { Icon } from "@/components/icon";

export const dynamic = "force-dynamic";

export default function Home() {
  return <>
    <a href="#main" className="skip-link">Lewati ke konten utama</a>
    <header className="site-header">
      <a href="#" className="brand" aria-label={`${event.name}, beranda`}><span className="brand-mark" aria-hidden="true"><Icon name="compass" size={25} /></span><span>SAI BUMI <strong>ENIGMA</strong></span></a>
      <nav aria-label="Navigasi utama"><a href="#pendaftaran">Pendaftaran <span aria-hidden="true">↗</span></a><a href="#kelompok">Daftar kelompok</a></nav>
      <span className="header-year">LAMPUNG <span aria-hidden="true">/</span> 2026</span>
    </header>
    <main id="main" className="page-shell">
      <section className="hero" aria-labelledby="event-title">
        <div className="hero-eyebrow"><span className="eyebrow">SEBUAH PERJALANAN, SEBUAH KEBERSAMAAN</span><span className="edition">PRA-RAKER & RAKER 2026</span></div>
        <div className="hero-intro">
          <div><span className="eyebrow">PENDAFTARAN KELOMPOK</span><h1 id="event-title">Langkah pertama,<br /> <em>bersama.</em><span className="sr-only"> {event.name}</span></h1></div>
          <div className="hero-details"><p>{event.subtitle} Cukup <strong>satu perwakilan</strong> mengisi pendaftaran untuk seluruh kelompok.</p><div className="schedule">{event.schedule.map((item) => <div key={item.label}><Icon name="calendar" size={17} /><span><span className="schedule-label">{item.label}</span><time dateTime={item.start}>{item.display}</time></span></div>)}</div></div>
        </div>
      </section>
      <RegistrationApp configuration={getDataConfiguration()} />
    </main>
    <footer className="site-footer"><div className="tapis-line" aria-hidden="true" /><div><span>THE SAI BUMI ENIGMA</span><p>Merangkai langkah. Menemukan cerita.</p><span>LAMPUNG · 2026</span></div></footer>
  </>;
}
