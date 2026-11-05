"use client";

export default function ErrorPage({ reset }: { reset: () => void }) {
  return <main className="page-shell loading-page"><div role="alert" className="notice error-notice"><h1>Halaman belum dapat dimuat.</h1><p>Silakan coba lagi. Data pendaftaran tidak diganti dengan data contoh.</p><button className="button button-gold" onClick={reset}>Coba lagi</button></div></main>;
}
