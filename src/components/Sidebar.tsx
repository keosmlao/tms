"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTheme } from "@/hooks/use-theme";
import { useSession } from "@/providers/session-provider";
import { isSalesLogin } from "@/lib/sales-role";
import {
  FaLightbulb,
  FaTachometerAlt,
  FaClipboardCheck,
  FaShippingFast,
  FaChartPie,
  FaCog,
  FaBars,
  FaTimes,
  FaChevronDown,
  FaBox,
  FaUserTie,
  FaTruck,
  FaCalendarDay,
  FaCalendarAlt,
  FaChartLine,
  FaChartArea,
  FaBuilding,
  FaExclamationTriangle,
  FaMoon,
  FaSun,
  FaAngleDoubleLeft,
  FaAngleDoubleRight,
  FaClock,
  FaCheckCircle,
  FaStickyNote,
  FaInbox,
  FaMapMarkerAlt,
  FaFileInvoice,
  FaBroadcastTower,
  FaGasPump,
  FaRoute,
  FaMobileAlt,
  FaHistory,
  FaPlug,
  FaTruckLoading,
  FaBook,
  FaRulerCombined,
  FaBoxOpen,
} from "react-icons/fa";

interface NavItem {
  label: string;
  href: string;
  icon?: React.ReactNode;
}

interface NavSection {
  title: string;
  icon: React.ReactNode;
  key: string;
  items: NavItem[];
}

const navSections: NavSection[] = [
  {
    title: "ຕິດຕາມ",
    icon: <FaMapMarkerAlt size={16} />,
    key: "tracking",
    items: [
      { label: "ຕິດຕາມສິນຄ້າ", href: "/tracking", icon: <FaMapMarkerAlt size={13} /> },
      { label: "ບິນສົ່ງບໍ່ສຳເລັດ", href: "/tracking/sales", icon: <FaFileInvoice size={13} /> },
      { label: "ແຜນທີ່ລົດ", href: "/tracking/cars-map", icon: <FaBroadcastTower size={13} /> },
      { label: "ແຜນທີ່ມືຖື", href: "/tracking/phones-map", icon: <FaMobileAlt size={13} /> },
      { label: "ເສັ້ນທາງມືຖືຄົນຂັບ", href: "/tracking/phone", icon: <FaMobileAlt size={13} /> },
      { label: "ສະຫຼຸບ GPS ປະຈຳວັນ", href: "/tracking/gps-usage", icon: <FaChartArea size={13} /> },
      { label: "GPS Monthly Summary", href: "/tracking/gps-monthly-summary", icon: <FaChartLine size={13} /> },
      // { label: "ດຶງຂໍ້ມູນ GPS ຍ້ອນຫຼັງ", href: "/tracking/gps-backfill", icon: <FaCloudDownloadAlt size={13} /> },
    ],
  },
  {
    title: "ອະນຸມັດ",
    icon: <FaClipboardCheck size={16} />,
    key: "approve",
    items: [
      { label: "ລໍອະນຸມັດ", href: "/approve", icon: <FaClipboardCheck size={13} /> },
      { label: "ອະນຸມັດແລ້ວ", href: "/approve/approved", icon: <FaCheckCircle size={13} /> },
    ],
  },
  {
    title: "ຂົນສົ່ງ",
    icon: <FaShippingFast size={16} />,
    key: "route",
    items: [
      { label: "ລໍຖ້າຈັດຖ້ຽວ", href: "/bills-pending", icon: <FaBox size={13} /> },
      { label: "ບິນລໍຕາມເສັ້ນທາງ", href: "/bills-waiting-routes", icon: <FaRoute size={13} /> },
      { label: "ຮ່າງຖ້ຽວ (ວັນ/ຮອບ/ສາຍ)", href: "/jobs/drafts", icon: <FaRoute size={13} /> },
      { label: "ແນະນຳການຈັດຖ້ຽວ", href: "/jobs/suggest", icon: <FaLightbulb size={13} /> },
      { label: "ໃບງານ/ລໍຖ້າອະນຸມັດ", href: "/jobs", icon: <FaClipboardCheck size={13} /> },
      { label: "ລໍຖ້າຮັບຖ້ຽວ", href: "/jobs/waiting-receive", icon: <FaClock size={13} /> },
      { label: "ລໍຖ້າເບີກເຄື່ອງ", href: "/jobs/waiting-pickup", icon: <FaBox size={13} /> },
      { label: "ລໍຖ້າຈັດສົ່ງ", href: "/bills-waitingsent", icon: <FaClock size={13} /> },
      { label: "ກຳລັງຈັດສົ່ງ", href: "/bills-inprogress", icon: <FaTruck size={13} /> },
      { label: "ຈັດສົ່ງສຳເລັດ", href: "/bill-complete", icon: <FaCheckCircle size={13} /> },
      { label: "ບິນສົ່ງບໍ່ຄົບ", href: "/bills-partial", icon: <FaBox size={13} /> },
      { label: "ບິນເບີກບໍ່ຄົບ", href: "/bills-pickup-variance", icon: <FaExclamationTriangle size={13} /> },
      { label: "ຄົນຂັບປິດງານ", href: "/jobs/closed-by-driver", icon: <FaClipboardCheck size={13} /> },
      { label: "ປິດສຳເລັດແລ້ວ", href: "/jobs/closed", icon: <FaCheckCircle size={13} /> },
    ],
  },
  {
    title: "ລາຍງານ",
    icon: <FaChartPie size={16} />,
    key: "report",
    items: [
      { label: "ການຈັດສົ່ງປະຈຳວັນ", href: "/reports/daily", icon: <FaCalendarDay size={13} /> },
      { label: "ອັດຕາໃຊ້ພື້ນທີ່ລົດ", href: "/reports/truck-utilization", icon: <FaTruckLoading size={13} /> },
      { label: "ຈຸດປິດບິນ vs ຈຸດລູກຄ້າ", href: "/reports/delivery-location", icon: <FaMapMarkerAlt size={13} /> },
      { label: "ເຄື່ອນໄຫວ/ວັນ (ບິນ)", href: "/reports/daily-activity-bills", icon: <FaFileInvoice size={13} /> },
      { label: "ເຄື່ອນໄຫວ/ວັນ (ສິນຄ້າ)", href: "/reports/daily-activity-products", icon: <FaBox size={13} /> },
      { label: "ປະຈຳວັນ/ພະແນກ", href: "/reports/daily-department", icon: <FaBuilding size={13} /> },
      { label: "ບິນຄ້າງສົ່ງ/ວັນ", href: "/reports/pending-daily", icon: <FaFileInvoice size={13} /> },
      { label: "ສົ່ງສຳເລັດ/ວັນ", href: "/reports/delivered-daily", icon: <FaFileInvoice size={13} /> },
      { label: "ຍົກເລີກ/ວັນ", href: "/reports/cancelled-daily", icon: <FaFileInvoice size={13} /> },
      { label: "ຕາມຄົນຂັບ", href: "/reports/by-driver", icon: <FaUserTie size={13} /> },
      { label: "ຕາມລົດ", href: "/reports/by-car", icon: <FaTruck size={13} /> },
      { label: "ຕາມບິນ", href: "/reports/by-bill", icon: <FaFileInvoice size={13} /> },
      { label: "ນຳໃຊ້ລົດ/ເດືອນ", href: "/reports/monthly-car", icon: <FaChartLine size={13} /> },
      { label: "ຄົນຂັບ/ເດືອນ", href: "/reports/monthly-driver", icon: <FaChartLine size={13} /> },
      { label: "Leaderboard ຄົນຂັບ", href: "/reports/drivers", icon: <FaUserTie size={13} /> },
    ],
  },
  {
    title: "ນ້ຳມັນ",
    icon: <FaGasPump size={16} />,
    key: "fuel",
    items: [
      { label: "ບັນທຶກເຕີມນ້ຳມັນ", href: "/fuel", icon: <FaGasPump size={13} /> },
    ],
  },
  {
    title: "ທັນໃຈ Express",
    icon: <FaPlug size={16} />,
    key: "thunjai",
    items: [
      { label: "ທັນໃຈຂົນສົ່ງ", href: "/thunjai/shipping", icon: <FaShippingFast size={13} /> },
      { label: "ສ້າງ Order", href: "/thunjai/orders/create", icon: <FaBox size={13} /> },
      { label: "ລະບົບ ThunJai", href: "/thunjai", icon: <FaTruckLoading size={13} /> },
    ],
  },
  {
    title: "ການຈັດການ",
    icon: <FaCog size={16} />,
    key: "manage",
    items: [
      { label: "ຂໍ້ມູນລົດ", href: "/manage/cars", icon: <FaTruck size={13} /> },
      { label: "ປະເພດລົດ", href: "/manage/car-types", icon: <FaTruck size={13} /> },
      { label: "ຂະໜາດທໍ່", href: "/manage/pipe-sizes", icon: <FaRulerCombined size={13} /> },
      { label: "ຂະໜາດຫີບ", href: "/manage/pack-sizes", icon: <FaBoxOpen size={13} /> },
      // { label: "ຄົນຂັບລົດ", href: "/manage/drivers", icon: <FaUserTie size={13} /> },
      { label: "ພະນັກງານຂົນສົ່ງ", href: "/manage/warehouse-workers", icon: <FaTruck size={13} /> },
      { label: "ເສັ້ນທາງຂົນສົ່ງ", href: "/manage/delivery-routes", icon: <FaRoute size={13} /> },
      { label: "ຮອບການຈັດສົ່ງ", href: "/manage/delivery-rounds", icon: <FaClock size={13} /> },
      { label: "ຜູ້ໃຊ້ Online", href: "/manage/presence", icon: <FaBroadcastTower size={13} /> },
      { label: "ຕັ້ງຄ່າ", href: "/manage/settings", icon: <FaCog size={13} /> },
      { label: "Audit Log", href: "/manage/audit-log", icon: <FaHistory size={13} /> },
    ],
  },
  {
    title: "ຊ່ວຍເຫຼືອ",
    icon: <FaBook size={16} />,
    key: "help",
    items: [
      { label: "ຄູ່ມືການໃຊ້ງານ", href: "/help", icon: <FaBook size={13} /> },
    ],
  },
];

export default function Sidebar({
  onCollapsedChange,
  onMobileOpenChange,
}: {
  onCollapsedChange?: (collapsed: boolean) => void;
  onMobileOpenChange?: (open: boolean) => void;
}) {
  const pathname = usePathname() ?? "";
  const { isDarkMode, toggleTheme } = useTheme();
  const { session } = useSession();
  const isSaleLogin = isSalesLogin(session);
  // Sales staff see a single purpose-built menu: their undelivered bill list.
  const visibleSections = useMemo<NavSection[]>(
    () =>
      isSaleLogin
        ? [
            {
              title: "ຝ່າຍຂາຍ",
              icon: <FaFileInvoice size={16} />,
              key: "sales-tracking",
              items: [
                { label: "ບິນສົ່ງບໍ່ສຳເລັດ", href: "/tracking/sales", icon: <FaFileInvoice size={13} /> },
                { label: "ກຳນົດວັນຈັດສົ່ງ", href: "/tracking/sales/daily-bills", icon: <FaCalendarDay size={13} /> },
                { label: "ບິນສົ່ງສຳເລັດ", href: "/tracking/sales/delivered", icon: <FaCheckCircle size={13} /> },
              ],
            },
          ]
        : navSections,
    [isSaleLogin]
  );
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  // Accordion: at most one section open at a time. Defaults to the section
  // that owns the current route so users land on a useful expanded state.
  const sectionForPath = useCallback((path: string): string | null => {
    // Quick-access shortcuts (top "ທາງລັດ" group) must NOT pop open the section
    // that merely prefix-matches their route — that read like the menu opening
    // by itself when you clicked Todo / KPI.
    if (path === "/bills-pending/todos" || path === "/reports/monthly-delivery") {
      return null;
    }
    const match = visibleSections.find((s) =>
      s.items.some((it) => path.startsWith(it.href))
    );
    return match?.key ?? null;
  }, [visibleSections]);

  const [openSection, setOpenSection] = useState<string | null>(
    () => sectionForPath(pathname) ?? "route"
  );

  useEffect(() => {
    const saved = localStorage.getItem("sidebar_collapsed");
    if (saved !== null) {
      const collapsed = saved === "true";
      setIsCollapsed(collapsed);
      onCollapsedChange?.(collapsed);
    } else {
      onCollapsedChange?.(false);
    }
  }, [onCollapsedChange]);

  useEffect(() => {
    onMobileOpenChange?.(mobileOpen);
  }, [mobileOpen, onMobileOpenChange]);

  // When the route changes, snap open to the matching section so deep links
  // (e.g. via Cmd-click) reveal the right group on first render.
  useEffect(() => {
    const k = sectionForPath(pathname);
    if (k) setOpenSection(k);
    setMobileOpen(false);
  }, [pathname, sectionForPath]);

  const toggleCollapse = () => {
    const newState = !isCollapsed;
    setIsCollapsed(newState);
    onCollapsedChange?.(newState);
    localStorage.setItem("sidebar_collapsed", String(newState));
  };

  const toggleSection = (key: string) => {
    if (isCollapsed && !mobileOpen) return;
    setOpenSection((prev) => (prev === key ? null : key));
  };

  const isActive = (href: string) => pathname === href;
  const isSectionActive = (section: NavSection) =>
    section.items.some((item) => pathname.startsWith(item.href));
  const showCollapsed = isCollapsed && !mobileOpen;

  const sidebarWidth = isCollapsed
    ? "w-[min(288px,86vw)] md:w-[84px]"
    : "w-[min(288px,86vw)] md:w-[288px]";

  return (
    <>
      {/* Mobile toggle */}
      <button
        className="fixed left-4 top-4 z-[1110] rounded-lg bg-[#0b1b18] p-2.5 text-white shadow-xl transition-all active:scale-95 md:hidden print:hidden"
        onClick={() => setMobileOpen(!mobileOpen)}
        aria-label="Toggle sidebar"
        aria-expanded={mobileOpen}
      >
        {mobileOpen ? <FaTimes size={16} /> : <FaBars size={16} />}
      </button>

      {/* Mobile backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-[1090] bg-black/40 backdrop-blur-md transition-opacity duration-300 md:hidden print:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed top-0 z-[1100] flex h-dvh shrink-0 flex-col bg-[#0a1514] text-slate-100 shadow-[0_24px_70px_rgba(2,8,13,0.28)] transition-all duration-300 ease-in-out md:z-40 md:h-screen print:hidden ${sidebarWidth}
          border-r border-white/10
          ${mobileOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"}`}
      >
        {/* Logo */}
        <div className="relative flex items-center justify-between border-b border-white/10 px-4 py-4">
          <Link href={isSaleLogin ? "/tracking/sales" : "/"} className="flex items-center gap-3 overflow-hidden">
            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center overflow-hidden rounded-lg bg-white shadow-lg shadow-teal-500/10">
              <img
                src="/odg.png"
                alt="ODG"
                className="h-full w-full object-contain"
              />
            </div>
            {!showCollapsed && (
              <div className="animate-fadeIn">
                <p className="text-sm font-bold leading-tight text-white">ODIEN GROUP</p>
                <p className="text-[10px] uppercase tracking-[0.18em] text-slate-400">TMS Console</p>
              </div>
            )}
          </Link>
          <button
            onClick={toggleCollapse}
            className="hidden rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-white/8 hover:text-white md:flex"
            aria-label="Toggle collapse"
          >
            {isCollapsed
              ? <FaAngleDoubleRight size={13} className="text-slate-400" />
              : <FaAngleDoubleLeft size={13} className="text-slate-400" />}
          </button>
        </div>

        {/* Dashboard link */}
        {!isSaleLogin && (
          <div className="px-3 pt-3 space-y-1">
            <Link
              href="/"
              className={`group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200 ${
                pathname === "/"
                  ? "bg-teal-400/14 text-white ring-1 ring-teal-300/20"
                  : "text-slate-400 hover:bg-white/8 hover:text-white"
              } ${showCollapsed ? "justify-center" : ""}`}
              onClick={() => setMobileOpen(false)}
              title={showCollapsed ? "Dashboard" : undefined}
            >
              <FaTachometerAlt size={16} className={pathname === "/" ? "text-teal-200" : "transition-colors group-hover:text-teal-200"} />
              {!showCollapsed && <span>Dashboard</span>}
            </Link>
          </div>
        )}

        {/* Quick-access shortcuts (ທາງລັດ) — label visible to everyone */}
        {!showCollapsed && (
          <div className="px-5 pt-3 pb-1">
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500">
              ທາງລັດ
            </p>
          </div>
        )}
        <div className="px-3 space-y-1">
          {/* Calendar — shortcut visible to everyone incl. sales */}
          <Link
            href="/calendar"
            className={`group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200 ${
              pathname === "/calendar"
                ? "bg-teal-400/14 text-white ring-1 ring-teal-300/20"
                : "text-slate-400 hover:bg-white/8 hover:text-white"
            } ${showCollapsed ? "justify-center" : ""}`}
            onClick={() => setMobileOpen(false)}
            title={showCollapsed ? "ປະຕິທິນຈັດສົ່ງ" : undefined}
          >
            <FaCalendarAlt size={16} className={pathname === "/calendar" ? "text-teal-200" : "transition-colors group-hover:text-teal-200"} />
            {!showCollapsed && <span>ປະຕິທິນຈັດສົ່ງ</span>}
          </Link>
          {!isSaleLogin && (
            <>
            <Link
              href="/inbox"
              className={`group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200 ${
                pathname === "/inbox"
                  ? "bg-teal-400/14 text-white ring-1 ring-teal-300/20"
                  : "text-slate-400 hover:bg-white/8 hover:text-white"
              } ${showCollapsed ? "justify-center" : ""}`}
              onClick={() => setMobileOpen(false)}
              title={showCollapsed ? "ກ່ອງຂໍ້ຄວາມ" : undefined}
            >
              <FaInbox size={16} className={pathname === "/inbox" ? "text-teal-200" : "transition-colors group-hover:text-teal-200"} />
              {!showCollapsed && <span>ກ່ອງຂໍ້ຄວາມ</span>}
            </Link>
            <Link
              href="/bills-pending/todos"
              className={`group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200 ${
                pathname === "/bills-pending/todos"
                  ? "bg-teal-400/14 text-white ring-1 ring-teal-300/20"
                  : "text-slate-400 hover:bg-white/8 hover:text-white"
              } ${showCollapsed ? "justify-center" : ""}`}
              onClick={() => setMobileOpen(false)}
              title={showCollapsed ? "Todo" : undefined}
            >
              <FaStickyNote size={16} className={pathname === "/bills-pending/todos" ? "text-teal-200" : "transition-colors group-hover:text-teal-200"} />
              {!showCollapsed && <span>Todo ບິນ</span>}
            </Link>
            <Link
              href="/reports/monthly-delivery"
              className={`group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200 ${
                pathname === "/reports/monthly-delivery"
                  ? "bg-teal-400/14 text-white ring-1 ring-teal-300/20"
                  : "text-slate-400 hover:bg-white/8 hover:text-white"
              } ${showCollapsed ? "justify-center" : ""}`}
              onClick={() => setMobileOpen(false)}
              title={showCollapsed ? "KPI ຈັດສົ່ງ" : undefined}
            >
              <FaChartLine size={16} className={pathname === "/reports/monthly-delivery" ? "text-teal-200" : "transition-colors group-hover:text-teal-200"} />
              {!showCollapsed && <span>KPI ຈັດສົ່ງ/ເດືອນ</span>}
            </Link>
            </>
          )}
        </div>

        {/* Section label */}
        {!showCollapsed && (
          <div className="px-5 pt-4 pb-1">
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500">
              ເມນູຫຼັກ
            </p>
          </div>
        )}

        {/* Nav sections */}
        <nav className="flex-1 px-3 pb-4 overflow-y-auto">
          {visibleSections.map((section) => {
            const isOpen = openSection === section.key;
            const sectionActive = isSectionActive(section);

            if (showCollapsed) {
              return (
                <div key={section.key} className="mb-1.5 group relative">
                  <div
                    className={`flex cursor-pointer items-center justify-center rounded-lg p-2.5 transition-all duration-200 ${
                      sectionActive
                        ? "bg-teal-400/14 text-teal-200 ring-1 ring-teal-300/20"
                        : "text-slate-500 hover:bg-white/8 hover:text-slate-200"
                    }`}
                  >
                    {section.icon}
                  </div>
                  <div className="pointer-events-none invisible absolute left-full top-1/2 z-50 ml-3 -translate-y-1/2 whitespace-nowrap rounded-lg border border-white/10 bg-[#101b19] px-3 py-1.5 text-xs font-medium text-slate-100 opacity-0 shadow-xl transition-all duration-200 group-hover:visible group-hover:opacity-100">
                    {section.title}
                  </div>
                </div>
              );
            }

            return (
              <div key={section.key} className="mb-0.5">
                <button
                  onClick={() => toggleSection(section.key)}
                  className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm font-medium transition-all duration-200 ${
                    sectionActive
                      ? "bg-teal-400/10 text-teal-200"
                      : "text-slate-400 hover:bg-white/8 hover:text-slate-200"
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <span>{section.icon}</span>
                    <span>{section.title}</span>
                  </div>
                  <FaChevronDown
                    size={10}
                    className={`transition-transform duration-200 ${isOpen ? "rotate-0" : "-rotate-90"} opacity-50`}
                  />
                </button>
                <div
                  className={`ml-5 pl-3 border-l border-slate-200/40 dark:border-white/5 transition-all duration-200 overflow-hidden ${
                    isOpen ? "mt-0.5 max-h-[500px]" : "max-h-0"
                  }`}
                >
                  {section.items.map((item) => {
                    const active = isActive(item.href);
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        className={`flex items-center gap-2.5 rounded-lg px-3 py-[7px] text-xs transition-all duration-200 ${
                          active
                            ? "bg-teal-400/14 font-semibold text-white"
                            : "text-slate-400 hover:bg-white/8 hover:text-slate-200"
                        }`}
                        onClick={() => setMobileOpen(false)}
                      >
                        <span className={active ? "text-teal-200" : "text-slate-500"}>
                          {item.icon}
                        </span>
                        <span>{item.label}</span>
                        {active && (
                          <span className="ml-auto h-1.5 w-1.5 rounded-full bg-amber-300" />
                        )}
                      </Link>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="border-t border-white/10 px-3 py-3">
          <div className="flex items-center justify-between">
            {!showCollapsed && (
              <p className="text-[10px] text-slate-500">&copy; ODG Transport</p>
            )}
            <button
              onClick={toggleTheme}
              className={`rounded-lg p-2 transition-all hover:bg-white/8 ${
                showCollapsed ? "mx-auto" : ""
              }`}
              aria-label="Toggle theme"
            >
              {isDarkMode
                ? <FaSun size={14} className="text-amber-400" />
                : <FaMoon size={14} className="text-slate-400" />}
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
