import type { Metadata } from "next";
import { Montserrat, Noto_Sans_Lao } from "next/font/google";
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

// ຟອນແບຣນສຳລັບຕົວອັກສອນລາຕິນ ແລະ ຕົວເລກ (Brand Guideline ໜ້າ 06).
// ວາງໄວ້ກ່ອນ Noto Sans Lao ໃນ --font-sans: browser ເລືອກຟອນຕໍ່ glyph
// ຈຶ່ງໄດ້ Montserrat ສຳລັບລາຕິນ ແລະ Noto Sans Lao ສຳລັບພາສາລາວ.
// TODO: guideline ກຳນົດ BoonHome ສຳລັບພາສາລາວ ແຕ່ບໍ່ມີໃນ Google Fonts —
// ເມື່ອໄດ້ໄຟລ໌ .woff2 ແລ້ວ ໃຫ້ປ່ຽນມາໃຊ້ next/font/local ແທນ notoLao.
const montserrat = Montserrat({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "900"],
  display: "swap",
  variable: "--font-brand-sans",
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
    <html lang="lo" className={`${montserrat.variable} ${notoLao.variable} h-full antialiased`}>
      {/* suppressHydrationWarning: ສ່ວນຂະຫຍາຍຂອງ browser (ຕົວແປພາສາ,
          ຕົວຈຳລະຫັດຜ່ານ ແລະ ອື່ນໆ) ຕື່ມ attribute ໃສ່ <body> ກ່ອນ React
          hydrate ເຊັ່ນ __processed_<uuid>__ ແລ້ວເກີດ hydration mismatch
          ທີ່ບໍ່ແມ່ນຄວາມຜິດຂອງລະບົບ ແລະ ແກ້ຈາກຝັ່ງເຮົາບໍ່ໄດ້. ປິດສະເພາະ
          <body> ຊັ້ນນີ້ຊັ້ນດຽວ — ຂ້າງໃນຍັງກວດ hydration ຕາມປົກກະຕິ. */}
      <body className="min-h-full flex flex-col" suppressHydrationWarning>
        <SessionProvider>
          {children}
          <Toaster position="top-right" />
        </SessionProvider>
      </body>
    </html>
  );
}
