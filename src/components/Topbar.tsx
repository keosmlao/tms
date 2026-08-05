"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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
  FaSpinner,
} from "react-icons/fa";
import { useTheme } from "@/hooks/use-theme";
import { useSession } from "@/providers/session-provider";
import { Actions } from "@/lib/api";
import { isSalesLogin } from "@/lib/sales-role";

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
  "/bills-waiting-routes": "ບິນລໍຖ້າຈັດຖ້ຽວຕາມເສັ້ນທາງ",
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
  "/manage/delivery-routes": "ເສັ້ນທາງຂົນສົ່ງ",
  "/manage/delivery-rounds": "ຮອບການຈັດສົ່ງ",
  "/tracking": "ຕິດຕາມ",
  "/tracking/sales": "ບິນສົ່ງບໍ່ສຳເລັດ",
  "/tracking/sales/delivered": "ບິນສົ່ງສຳເລັດ",
  "/tracking/cars-map": "ແຜນທີ່ລົດ",
  "/tracking/gps-monthly-summary": "GPS Monthly Summary",
  "/location": "ຕໍາແໜ່ງລົດ",
};

interface ActivityNotification {
  type: string;
  doc_no: string;
  bill_no: string | null;
  title: string;
  body: string;
  href: string;
  tone: string;
  event_time: string;
  age_seconds: number;
  notification_key: string;
  read: boolean;
}

const toneClasses: Record<string, string> = {
  amber: "bg-amber-500",
  blue: "bg-blue-500",
  emerald: "bg-emerald-500",
  rose: "bg-rose-500",
  sky: "bg-sky-500",
  slate: "bg-slate-500",
};

function formatActivityAge(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 60) return "ຕອນນີ້";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} ນາທີ`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} ຊົ່ວໂມງ`;
  return `${Math.floor(hours / 24)} ມື້`;
}

export default function Topbar() {
  const router = useRouter();
  const pathname = usePathname() ?? "";
  const [searchText, setSearchText] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [notifications, setNotifications] = useState<ActivityNotification[]>([]);
  const [notificationsLoading, setNotificationsLoading] = useState(false);
  const { isDarkMode, toggleTheme } = useTheme();
  const { session, logout } = useSession();
  const username = session?.username ?? "";
  const isSaleLogin = isSalesLogin(session);

  const loadNotifications = useCallback(async () => {
    if (isSaleLogin) return;
    try {
      setNotificationsLoading(true);
      const rows = await Actions.getActivityNotifications(30);
      setNotifications(rows ?? []);
    } catch (error) {
      console.error("Failed to load notifications", error);
    } finally {
      setNotificationsLoading(false);
    }
  }, [isSaleLogin]);

  useEffect(() => {
    if (isSaleLogin) {
      setNotifications([]);
      return;
    }
    // ບໍ່ມີ session ຢ່າຍິງ — ຕອນ token ໝົດອາຍຸ poller ນີ້ຈະໄດ້ 500 ທຸກນາທີ
    if (!session) return;
    void loadNotifications();
    // 60s, not 30s: this query is the most expensive thing that runs on every
    // page (measured ~720 ms average in the dev log), and nothing in the feed
    // is urgent enough to justify polling it twice a minute.
    const timer = window.setInterval(() => void loadNotifications(), 60000);
    return () => window.clearInterval(timer);
  }, [isSaleLogin, loadNotifications, session]);

  const unreadCount = useMemo(
    () => notifications.filter((item) => !item.read).length,
    [notifications]
  );

  const handleNotificationClick = useCallback(
    async (item: ActivityNotification) => {
      setShowNotifications(false);
      // Optimistic local update so the dropdown reflects "read" state
      // immediately even before the server confirms the insert.
      setNotifications((prev) =>
        prev.map((n) =>
          n.notification_key === item.notification_key ? { ...n, read: true } : n
        )
      );
      try {
        await Actions.markActivityNotificationRead(item.notification_key);
      } catch (err) {
        console.error("Failed to mark notification read", err);
      }
    },
    []
  );

  const handleMarkAllRead = useCallback(async () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    try {
      await Actions.markAllActivityNotificationsRead();
    } catch (err) {
      console.error("Failed to mark all notifications read", err);
      void loadNotifications();
    }
  }, [loadNotifications]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchText.trim()) {
      router.push(
        isSaleLogin
          ? `/tracking/sales?search=${encodeURIComponent(searchText)}`
          : `/tracking?search=${encodeURIComponent(searchText)}`
      );
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
          { label: "ໜ້າຫຼັກ", href: isSaleLogin ? "/tracking/sales" : "/" },
          ...segments.map((seg, i) => ({
            label:
              pageTitles["/" + segments.slice(0, i + 1).join("/")] || seg,
            href: "/" + segments.slice(0, i + 1).join("/"),
          })),
        ]
      : [];

  return (
    <header className="sticky top-0 z-40 border-b border-white/[0.06] bg-[#00223f]/95 shadow-[0_10px_30px_-14px_rgba(0,0,0,0.55)] backdrop-blur-xl transition-all duration-300 print:hidden">
      <div className="flex h-16 items-center justify-between gap-3 pl-16 pr-3 sm:gap-4 sm:pr-4 md:px-6">
        {/* Left: Title + Breadcrumb */}
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="hidden h-9 w-1 shrink-0 rounded-full bg-gradient-to-b from-teal-400 to-emerald-500 sm:block" />
          <div className="flex flex-col justify-center min-w-0">
          <h1 className="truncate text-lg font-bold tracking-tight text-white">
            {pageTitle || "Dashboard"}
          </h1>
          {breadcrumb.length > 0 && (
            <nav className="flex items-center gap-1 text-[11px] mt-0.5">
              {breadcrumb.map((item, i) => (
                <span key={`${item.href}-${i}`} className="flex items-center gap-1">
                  {i > 0 && <FaChevronRight className="text-[8px] text-slate-600" />}
                  {i < breadcrumb.length - 1 ? (
                    <Link
                      href={item.href}
                      className="text-slate-400 transition-colors hover:text-teal-300"
                    >
                      {item.label}
                    </Link>
                  ) : (
                    <span className="text-slate-200 font-medium">
                      {item.label}
                    </span>
                  )}
                </span>
              ))}
            </nav>
          )}
          </div>
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-2">
          {/* Download APK */}
          <a
            href="/tms.apk"
            download
            className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-emerald-600 to-teal-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition-all hover:from-emerald-500 hover:to-teal-500 hover:shadow-md"
            title="ດາວໂຫຼດ App ສຳລັບ Android"
          >
            <FaDownload size={12} />
            <span className="hidden md:inline">ດາວໂຫຼດ App</span>
          </a>

          {/* Theme toggle */}
          <button
            onClick={toggleTheme}
            className="rounded-full p-2 text-slate-300 transition-all duration-200 hover:bg-white/10"
            aria-label="Toggle theme"
          >
            {isDarkMode
              ? <FaSun size={15} className="text-amber-400" />
              : <FaMoon size={15} className="text-slate-400" />}
          </button>

          {!isSaleLogin && (
            <form onSubmit={handleSearch} className="hidden sm:block">
              <div className="relative group">
                <FaSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-slate-500 transition-colors group-focus-within:text-teal-300" />
                <input
                  type="text"
                  value={searchText}
                  onChange={(e) => setSearchText(e.target.value)}
                  className="w-48 rounded-full border border-white/10 bg-white/5 py-2 pl-9 pr-4 text-sm text-slate-100 outline-none transition-all duration-300 placeholder:text-slate-500 focus:w-64 focus:border-teal-400/50 focus:bg-white/10 focus:ring-2 focus:ring-teal-500/20"
                  placeholder="ຄົ້ນຫາເລກບິນ..."
                />
              </div>
            </form>
          )}

          {/* Notifications */}
          {!isSaleLogin && (
          <div className="relative">
            <button
              onClick={() => {
                setShowNotifications((open) => !open);
                setShowDropdown(false);
                void loadNotifications();
              }}
              className="relative rounded-full p-2 text-slate-300 transition-colors hover:bg-white/10"
              aria-label="Notifications"
            >
              <FaBell size={15} />
              {unreadCount > 0 && (
                <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[9px] font-bold leading-none text-white ring-2 ring-white/80 dark:ring-gray-900/80">
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              )}
            </button>

            {showNotifications && (
              <>
                <div
                  className="fixed inset-0 z-[1001]"
                  onClick={() => setShowNotifications(false)}
                />
                <div className="animate-fadeIn absolute right-0 z-[1002] mt-2 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-lg border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900">
                  <div className="flex items-center justify-between border-b border-slate-200/60 px-4 py-3 dark:border-white/5">
                    <div>
                      <p className="text-sm font-semibold text-slate-800 dark:text-white">
                        ການເຄື່ອນໄຫວ
                      </p>
                      <p className="mt-0.5 text-[11px] text-slate-400 dark:text-slate-500">
                        {unreadCount > 0
                          ? `${unreadCount} ລາຍການໃໝ່`
                          : "ອ່ານຫມົດແລ້ວ"}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {notificationsLoading && (
                        <FaSpinner className="animate-spin text-xs text-slate-400" />
                      )}
                      {unreadCount > 0 && (
                        <button
                          type="button"
                          onClick={() => void handleMarkAllRead()}
                          className="text-[11px] font-semibold text-teal-600 hover:text-teal-700 dark:text-teal-400 dark:hover:text-teal-300"
                        >
                          ອ່ານທັງໝົດ
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="max-h-[26rem] overflow-y-auto py-1">
                    {notifications.length === 0 && !notificationsLoading ? (
                      <div className="px-4 py-8 text-center text-sm text-slate-400 dark:text-slate-500">
                        ຍັງບໍ່ມີແຈ້ງເຕືອນ
                      </div>
                    ) : (
                      notifications.map((item, index) => (
                        <Link
                          key={`${item.type}-${item.doc_no}-${item.bill_no ?? ""}-${item.event_time}-${index}`}
                          href={item.href}
                          onClick={() => void handleNotificationClick(item)}
                          className={`flex gap-3 px-4 py-3 transition-colors ${
                            item.read
                              ? "hover:bg-slate-50 dark:hover:bg-white/5"
                              : "bg-teal-50/40 hover:bg-teal-50 dark:bg-teal-500/[0.06] dark:hover:bg-teal-500/10"
                          }`}
                        >
                          <span className="relative mt-1.5 shrink-0">
                            <span
                              className={`block h-2.5 w-2.5 rounded-full ${toneClasses[item.tone] ?? "bg-teal-500"}`}
                            />
                            {!item.read && (
                              <span className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-rose-500 ring-2 ring-white dark:ring-slate-900" />
                            )}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span
                              className={`block truncate text-sm ${
                                item.read
                                  ? "font-medium text-slate-500 dark:text-slate-400"
                                  : "font-semibold text-slate-700 dark:text-slate-100"
                              }`}
                            >
                              {item.title}
                            </span>
                            <span
                              className={`mt-0.5 block truncate text-xs ${
                                item.read
                                  ? "text-slate-400 dark:text-slate-500"
                                  : "text-slate-500 dark:text-slate-400"
                              }`}
                            >
                              {item.body}
                            </span>
                            <span className="mt-1 block text-[11px] text-slate-400 dark:text-slate-500">
                              {formatActivityAge(Number(item.age_seconds))} · {item.event_time}
                            </span>
                          </span>
                        </Link>
                      ))
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
          )}

          {/* User */}
          <div className="relative">
            <button
              onClick={() => {
                setShowDropdown(!showDropdown);
                setShowNotifications(false);
              }}
              className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 py-1 pl-1 pr-2.5 transition-all duration-200 hover:bg-white/10"
            >
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal-700 text-xs font-bold text-white shadow-sm dark:bg-teal-400 dark:text-slate-950">
                {username?.charAt(0)?.toUpperCase() || <FaUser size={12} />}
              </div>
              <div className="hidden lg:block text-left">
                <p className="text-sm font-medium text-slate-100 leading-tight">
                  {username}
                </p>
                <p className="text-[10px] text-slate-400">ODIEN GROUP</p>
              </div>
            </button>

            {showDropdown && (
              <>
                <div
                  className="fixed inset-0 z-[1001]"
                  onClick={() => setShowDropdown(false)}
                />
                <div className="animate-fadeIn absolute right-0 z-[1002] mt-2 w-56 overflow-hidden rounded-lg border border-slate-200 bg-white py-1 shadow-2xl dark:border-slate-800 dark:bg-slate-900">
                  <div className="px-4 py-3 border-b border-slate-200/30 dark:border-white/5">
                    <p className="text-sm font-semibold text-slate-800 dark:text-white">
                      {username}
                    </p>
                    <p className="text-xs font-medium text-slate-600 dark:text-slate-300 mt-0.5">
                      {session?.position_title || session?.title || "—"}
                    </p>
                    {session?.emp_department_name && (
                      <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">
                        {session.emp_department_name}
                      </p>
                    )}
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
