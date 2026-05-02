"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import {
  FaSearch,
  FaSignOutAlt,
  FaUser,
  FaBell,
  FaChevronRight,
  FaMoon,
  FaSun,
  FaDownload,
} from "react-icons/fa";
import { useTheme } from "@/hooks/use-theme";
import { useSession } from "@/providers/session-provider";

const pageTitles: Record<string, string> = {
  "/": "Dashboard",
  "/approve": "ລໍອະນຸມັດ",
  "/approve/approved": "ອະນຸມັດແລ້ວ",
  "/approve/report": "ລາຍການອະນຸມັດ",
  "/jobs": "ໃບງານ/ລໍຖ້າອະນຸມັດ",
  "/jobs/add": "ເພີ່ມຖ້ຽວ",
  "/jobs/waiting-receive": "ລໍຖ້າຮັບຖ້ຽວ",
  "/jobs/waiting-pickup": "ລໍຖ້າເບີກເຄື່ອງ",
  "/jobs/closed-by-driver": "ຄົນຂັບປິດງານ",
  "/jobs/closed": "ປິດສຳເລັດແລ້ວ",
  "/bills-pending": "ລາຍການລໍຖ້າຈັດຖ້ຽວ",
  "/bills-waitingsent": "ລາຍການລໍຖ້າຈັດສົ່ງ",
  "/bills-inprogress": "ກຳລັງຈັດສົ່ງ",
  "/bills-partial": "ບິນສົ່ງບໍ່ຄົບ",
  "/bill-complete": "ຈັດສົ່ງສຳເລັດ",
  "/bill-shipment": "ຂໍ້ມູນບິນຈັດສົ່ງ",
  "/reports/daily": "ລາຍງານປະຈຳວັນ",
  "/reports/by-driver": "ລາຍງານຕາມຄົນຂັບລົດ",
  "/reports/by-car": "ລາຍງານຕາມລົດ",
  "/reports/by-bill": "ລາຍງານຕາມບິນ",
  "/reports/monthly-car": "ນຳໃຊ້ລົດປະຈຳເດືອນ",
  "/reports/monthly-driver": "ຄົນຂັບປະຈຳເດືອນ",
  "/manage/cars": "ຂໍ້ມູນລົດ",
  "/manage/drivers": "ຄົນຂັບລົດ",
  "/manage/warehouse-workers": "ພະນັກງານຂົນສົ່ງ",
  "/tracking": "ຕິດຕາມ",
  "/tracking/cars-map": "ແຜນທີ່ລົດ",
  "/location": "ຕໍາແໜ່ງລົດ",
};

export default function Topbar() {
  const router = useRouter();
  const pathname = usePathname() ?? "";
  const [searchText, setSearchText] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);
  const { isDarkMode, toggleTheme } = useTheme();
  const { session, logout } = useSession();
  const username = session?.username ?? "";

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchText.trim()) {
      router.push(`/tracking?search=${encodeURIComponent(searchText)}`);
    }
  };

  const handleLogout = async () => {
    await logout();
    router.push("/login");
  };

  const pageTitle = pageTitles[pathname] || "";

  const segments = pathname.split("/").filter(Boolean);
  const breadcrumb =
    segments.length > 0
      ? [
          { label: "ໜ້າຫຼັກ", href: "/" },
          ...segments.map((seg, i) => ({
            label:
              pageTitles["/" + segments.slice(0, i + 1).join("/")] || seg,
            href: "/" + segments.slice(0, i + 1).join("/"),
          })),
        ]
      : [];

  return (
    <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/90 backdrop-blur-md transition-all duration-300 dark:border-slate-800 dark:bg-[#0b151b]/92 print:hidden">
      <div className="flex h-16 items-center justify-between gap-4 px-4 md:px-6">
        {/* Left: Title + Breadcrumb */}
        <div className="flex flex-col justify-center min-w-0">
          <h1 className="truncate text-lg font-bold text-slate-800 dark:text-white">
            {pageTitle || "Dashboard"}
          </h1>
          {breadcrumb.length > 0 && (
            <nav className="flex items-center gap-1 text-[11px] mt-0.5">
              {breadcrumb.map((item, i) => (
                <span key={item.href} className="flex items-center gap-1">
                  {i > 0 && <FaChevronRight className="text-[8px] text-slate-300 dark:text-slate-600" />}
                  {i < breadcrumb.length - 1 ? (
                    <Link
                      href={item.href}
                      className="text-slate-400 transition-colors hover:text-teal-700 dark:text-slate-500 dark:hover:text-teal-300"
                    >
                      {item.label}
                    </Link>
                  ) : (
                    <span className="text-slate-500 dark:text-slate-400 font-medium">
                      {item.label}
                    </span>
                  )}
                </span>
              ))}
            </nav>
          )}
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-2">
          {/* Download APK */}
          <a
            href="/tms.apk"
            download
            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-2.5 py-1.5 text-xs font-semibold text-white shadow-sm transition-all hover:bg-emerald-700 hover:shadow"
            title="ດາວໂຫຼດ App ສຳລັບ Android"
          >
            <FaDownload size={12} />
            <span className="hidden md:inline">ດາວໂຫຼດ App</span>
          </a>

          {/* Theme toggle */}
          <button
            onClick={toggleTheme}
            className="rounded-lg p-2 transition-all duration-200 hover:bg-slate-100 dark:hover:bg-white/8"
            aria-label="Toggle theme"
          >
            {isDarkMode
              ? <FaSun size={15} className="text-amber-400" />
              : <FaMoon size={15} className="text-slate-400" />}
          </button>

          {/* Search */}
          <form onSubmit={handleSearch} className="hidden sm:block">
            <div className="relative group">
              <FaSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 transition-colors group-focus-within:text-teal-700 dark:text-slate-500 dark:group-focus-within:text-teal-300" />
              <input
                type="text"
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                className="glass-input w-48 rounded-lg py-2 pl-9 pr-4 text-sm text-slate-700 placeholder:text-slate-400 transition-all duration-300 focus:w-64 dark:text-slate-200 dark:placeholder:text-slate-600"
                placeholder="ຄົ້ນຫາເລກບິນ..."
              />
            </div>
          </form>

          {/* Notifications */}
          <button className="relative rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-100 dark:text-slate-500 dark:hover:bg-white/8">
            <FaBell size={15} />
            <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-rose-500 ring-2 ring-white/80 dark:ring-gray-900/80" />
          </button>

          {/* User */}
          <div className="relative">
            <button
              onClick={() => setShowDropdown(!showDropdown)}
              className="flex items-center gap-2 rounded-lg py-1 pl-1 pr-2.5 transition-all duration-200 hover:bg-slate-100 dark:hover:bg-white/8"
            >
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal-700 text-xs font-bold text-white shadow-sm dark:bg-teal-400 dark:text-slate-950">
                {username?.charAt(0)?.toUpperCase() || <FaUser size={12} />}
              </div>
              <div className="hidden lg:block text-left">
                <p className="text-sm font-medium text-slate-700 dark:text-slate-200 leading-tight">
                  {username}
                </p>
                <p className="text-[10px] text-slate-400 dark:text-slate-500">ODIEN GROUP</p>
              </div>
            </button>

            {showDropdown && (
              <>
                <div
                  className="fixed inset-0 z-10"
                  onClick={() => setShowDropdown(false)}
                />
                <div className="animate-fadeIn absolute right-0 z-20 mt-2 w-56 overflow-hidden rounded-lg border border-slate-200 bg-white py-1 shadow-2xl dark:border-slate-800 dark:bg-slate-900">
                  <div className="px-4 py-3 border-b border-slate-200/30 dark:border-white/5">
                    <p className="text-sm font-semibold text-slate-800 dark:text-white">
                      {username}
                    </p>
                    <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
                      {session?.title || "Administrator"}
                    </p>
                  </div>
                  <div className="py-1">
                    <button
                      onClick={handleLogout}
                      className="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-slate-600 dark:text-slate-300 hover:bg-rose-50/50 dark:hover:bg-rose-500/10 hover:text-rose-600 dark:hover:text-rose-400 transition-colors"
                    >
                      <FaSignOutAlt size={13} />
                      ອອກຈາກລະບົບ
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
