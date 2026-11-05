import type { Metadata } from "next";
import "@fontsource-variable/dm-sans";
import "@fontsource-variable/cormorant-garamond";
import "@fontsource-variable/cormorant-garamond/wght-italic.css";
import "./globals.css";
import { event } from "@/config/event";

export const metadata: Metadata = {
  title: `Pendaftaran Kelompok | ${event.name}`,
  description: "Satukan tim Anda untuk THE SAI BUMI ENIGMA. Satu perwakilan mendaftarkan 8 atau 9 anggota kelompok.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="id"><body>{children}</body></html>;
}
