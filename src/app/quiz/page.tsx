import { event } from "@/config/event";
import { getDataConfiguration } from "@/server/config";
import { QuizApp } from "@/components/quiz-app";
import { SiteHeader } from "@/components/site-header";
import { Icon } from "@/components/icon";

export const dynamic = "force-dynamic";

export default function QuizPage() {
  return (
    <>
      <a href="#main" className="skip-link">Lewati ke konten utama</a>
      <SiteHeader activeNav="quiz" />
      <main id="main" className="page-shell">
        <section className="hero" aria-labelledby="event-title">
          <div className="hero-eyebrow">
            <span className="eyebrow">THE SAI BUMI ENIGMA</span>
            <span className="edition">PRA-RAKER & RAKER 2026</span>
          </div>
          <div className="hero-intro">
            <div>
              <span className="eyebrow">MISI PENELUSURAN & LOGIKA</span>
              <h1 id="event-title">
                QUIZ INVESTIGASI<br /> <em>ENIGMA SAI BUMI</em>
                <span className="sr-only"> {event.name}</span>
              </h1>
            </div>
            <div className="hero-details">
              <p>
                Selamat datang di tantangan investigasi! Uji kemampuan observasi, analisis deduksi, dan wawasan Enigma Sai Bumi bersama tim Anda.
              </p>
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
                Pilih <strong>nama Anda</strong> dari daftar peserta. Kelompok tim Anda akan terdeteksi secara otomatis (Lupin, Detectif Jubun, Conan, atau Holmes). Selesaikan kuis dalam waktu <strong>5 menit</strong> satu per satu secara berurutan.
              </p>
            </div>
          </div>
        </section>
        <QuizApp configuration={getDataConfiguration()} />
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
