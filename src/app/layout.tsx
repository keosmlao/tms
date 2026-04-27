import type { Metadata } from "next";
import { Toaster } from "react-hot-toast";
import { SessionProvider } from "@/providers/session-provider";
import "./globals.css";

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
    <html lang="lo" className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        <SessionProvider>
          {children}
          <Toaster position="top-right" />
        </SessionProvider>
      </body>
    </html>
  );
}
