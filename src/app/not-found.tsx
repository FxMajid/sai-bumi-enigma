import Link from "next/link";

export default function NotFound() {
  return <main className="page-shell loading-page"><span className="eyebrow">404 · JALUR BELUM DITEMUKAN</span><h1>Kembali ke titik awal.</h1><Link className="button button-gold" href="/">Ke halaman pendaftaran</Link></main>;
}
