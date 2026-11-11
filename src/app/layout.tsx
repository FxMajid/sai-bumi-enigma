import type { Metadata } from "next";
import "@fontsource-variable/dm-sans";
import "@fontsource-variable/cormorant-garamond";
import "@fontsource-variable/cormorant-garamond/wght-italic.css";
import "./globals.css";
import { event } from "@/config/event";

export const metadata: Metadata = {
  title: `Quiz Investigasi | ${event.name}`,
  description: "Uji ketajaman logika dan deduksi untuk THE SAI BUMI ENIGMA.",
  robots: { index: false, follow: false },
};

const extensionErrorHandler = `
  (function() {
    window.addEventListener('error', function(event) {
      if (
        event.filename && (
          event.filename.indexOf('chrome-extension://') !== -1 ||
          event.filename.indexOf('moz-extension://') !== -1
        ) ||
        (event.message && (
          event.message.indexOf('MetaMask') !== -1 ||
          event.message.indexOf('ethereum') !== -1
        ))
      ) {
        event.preventDefault();
        event.stopImmediatePropagation();
        return true;
      }
    }, true);

    window.addEventListener('unhandledrejection', function(event) {
      var reason = event.reason || {};
      var msg = String(reason.message || reason.stack || reason);
      if (
        msg.indexOf('MetaMask') !== -1 ||
        msg.indexOf('chrome-extension://') !== -1 ||
        msg.indexOf('ethereum') !== -1
      ) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    }, true);
  })();
`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="id">
      <head>
        <script dangerouslySetInnerHTML={{ __html: extensionErrorHandler }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
