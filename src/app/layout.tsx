import type { Metadata } from "next";
import { Noto_Sans_Lao } from "next/font/google";
import { Toaster } from "react-hot-toast";
import { SessionProvider } from "@/providers/session-provider";
import "./globals.css";

// Load Noto Sans Lao via next/font so the browser actually has a Lao-aware
// face to render with. Before this, globals.css referenced "Noto Sans Lao"
// but nothing loaded it, so browsers fell back to system-ui — which on most
// machines renders Lao with broken / clipped glyphs.
const notoLao = Noto_Sans_Lao({
  subsets: ["lao"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
  variable: "--font-lao-sans",
});

export const metadata: Metadata = {
  title: "ODG TMS",
  description: "Odien Group Transport Management System",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="lo" className={`${notoLao.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <SessionProvider>
          {children}
          <Toaster position="top-right" />
        </SessionProvider>
      </body>
    </html>
  );
}
