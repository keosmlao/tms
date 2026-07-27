"use client";

import Link from "next/link";
import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import { useConfirm } from "@/components/confirm-dialog";
import {
  FaArrowLeft,
  FaArrowRight,
  FaBoxOpen,
  FaCalendarAlt,
  FaCheck,
  FaChevronDown,
  FaClock,
  FaInfoCircle,
  FaPlus,
  FaRoute,
  FaSave,
  FaSearch,
  FaSpinner,
  FaSyncAlt,
  FaTimes,
  FaTrash,
  FaTruck,
  FaUser,
  FaUsers,
} from "react-icons/fa";
import { FIXED_YEAR_END, FIXED_YEAR_START, getFixedTodayDate } from "@/lib/fixed-year";
import { Actions } from "@/lib/api";
import { useSession } from "@/providers/session-provider";
import SplitBillByBranch from "@/components/split-bill-by-branch";

interface Product {
  item_code: string;
  item_name: string;
  qty: number;
  unit_code: string;
}

interface WarehouseItem {
  wh_code: string;
  wh_name: string;
  item_code: string;
  item_name: string;
  qty: number;
  unit_code: string;
}

export interface AvailableBill {
  doc_no: string;
  doc_date: string;
  cust_code: string;
  cust_name: string;
  telephone: string;
  count_item: number;
  origin_transport_code?: string;
  origin_transport_name?: string;
  delivery_transport_code?: string | null;
  scheduled_date?: string | null;
  scheduled_date_display?: string | null;
  delivery_route_code?: string | null;
  delivery_round_code?: string | null;
  delivery_round_name?: string | null;
  delivery_round_time_label?: string | null;
  incoming_forwarded?: boolean;
  forward_from_transport_code?: string;
  forward_from_transport_name?: string;
  forwarded_at?: string;
}

export interface Option {
  code: string;
  name_1: string;
}

interface SelectedProduct extends Product {
  selectedQty: number;
}

// Special pickup_transport_code value meaning "pickup at customer's home/shop"
// rather than at a transport_type warehouse. Mirrors the constant used by the
// backend (no real transport_type code is ever this string).
export const PICKUP_AT_CUSTOMER = "__CUSTOMER__";

interface AddedBillGroup {
  bill: AvailableBill;
  items: SelectedProduct[];
  forward_transport_code?: string;
  pickup_transport_code?: string | null;
  delivery_condition?: string;
}

// Mandatory delivery condition chosen per bill when adding it to a trip.
export const DELIVERY_CONDITIONS: { code: string; label: string }[] = [
  { code: "to_customer", label: "ສົ່ງລູກຄ້າ" },
  { code: "to_branch", label: "ສົ່ງສາຂາ" },
  { code: "to_carrier", label: "ສົ່ງຂົນສົ່ງ" },
  { code: "to_bus", label: "ຝາກລົດເມ" },
];

interface TransportBranch {
  code: string;
  name_1: string;
}

export interface JobForEdit {
  doc_no: string;
  doc_date: string;
  date_logistic: string;
  car: string;
  driver: string;
  delivery_route_code: string;
  delivery_round_code: string;
  forward_transport_code: string | null;
  approve_status: number;
  job_status: number;
  workers: string[];
  bills: Array<{
    doc_no: string;
    doc_date: string;
    cust_code: string;
    cust_name: string;
    telephone: string;
    count_item: number;
    forward_transport_code: string | null;
    pickup_transport_code: string | null;
    delivery_condition: string | null;
    items: Array<{
      item_code: string;
      item_name: string;
      qty: number;
      selectedQty: number;
      unit_code: string;
    }>;
    products: Array<{
      item_code: string;
      item_name: string;
      qty: number;
      unit_code: string;
    }>;
  }>;
}

interface AddJobClientProps {
  initialDocNo?: string;
  initialCars?: Option[];
  initialDrivers?: Option[];
  initialWorkers?: Option[];
  initialBills?: AvailableBill[];
  mode?: "create" | "edit";
  initialJob?: JobForEdit;
}

const routePath = (route: {
  origin?: string;
  destination?: string;
  waypoints?: Array<string | { name?: string }>;
}) =>
  [route.origin, ...(route.waypoints ?? []), route.destination]
    .map((item) => String(item && typeof item === "object" ? item.name ?? "" : item ?? "").trim())
    .filter(Boolean)
    .join(" - ");

const routeLabel = (route: {
  name: string;
  origin?: string;
  destination?: string;
  waypoints?: Array<string | { name?: string }>;
}) => {
  const path = routePath(route);
  return route.name + (path ? ` (${path})` : "");
};

// Shared flat control surface (replaces the removed glass-* utilities).
const CONTROL =
  "rounded-md border border-slate-300 bg-white text-slate-800 outline-none transition-colors focus:border-teal-500 focus:ring-1 focus:ring-teal-500/30 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100";

const SearchDropdown = ({
  refEl,
  show,
  setShow,
  search,
  setSearch,
  items,
  value,
  onSelect,
  placeholder,
  icon,
  compact,
}: {
  refEl: React.RefObject<HTMLDivElement | null>;
  show: boolean;
  setShow: (value: boolean) => void;
  search: string;
  setSearch: (value: string) => void;
  items: Option[];
  value: string;
  onSelect: (code: string, name: string) => void;
  placeholder: string;
  icon?: React.ReactNode;
  compact?: boolean;
}) => (
  <div ref={refEl} className="relative">
    <div className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500">
      {icon ?? <FaSearch className="text-xs" />}
    </div>
    <input
      type="text"
      value={search}
      onChange={(event) => {
        setSearch(event.target.value);
        setShow(true);
      }}
      onFocus={() => setShow(true)}
      placeholder={placeholder}
      className={`${CONTROL} w-full pl-8 pr-8 ${
        compact ? "h-9 text-sm" : "h-10 text-sm"
      }`}
    />
    <button
      type="button"
      onClick={() => setShow(!show)}
      className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-teal-600 dark:hover:bg-slate-800"
    >
      <FaChevronDown className={`text-xs transition-transform duration-200 ${show ? "rotate-180" : ""}`} />
    </button>
    {show && (
      <div className="absolute z-30 mt-1 max-h-60 w-full overflow-y-auto rounded-md border border-slate-200 bg-white p-1 shadow-lg dark:border-slate-700 dark:bg-slate-900">
        {items.length > 0 ? (
          items.map((item) => (
            <button
              key={item.code}
              type="button"
              onClick={() => {
                onSelect(item.code, item.name_1);
                setShow(false);
              }}
              className={`flex w-full items-center justify-between gap-3 rounded px-2.5 py-2 text-sm transition-colors ${
                value === item.code
                  ? "bg-teal-50 font-semibold text-teal-700 dark:bg-teal-500/15 dark:text-teal-300"
                  : "text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
              }`}
            >
              <span className="truncate font-medium">{item.name_1}</span>
              <span className="shrink-0 font-mono text-[11px] text-slate-400 dark:text-slate-500">{item.code}</span>
            </button>
          ))
        ) : (
          <p className="px-3 py-3 text-center text-sm text-slate-400 dark:text-slate-500">ບໍ່ພົບຂໍ້ມູນ</p>
        )}
      </div>
    )}
  </div>
);

export default function AddJobClient({
  initialDocNo = "",
  initialCars = [],
  initialDrivers = [],
  initialWorkers = [],
  initialBills = [],
  mode = "create",
  initialJob,
}: AddJobClientProps) {
  const router = useRouter();
  const confirm = useConfirm();
  const isEdit = mode === "edit" && !!initialJob;

  const [docNo, setDocNo] = useState(isEdit ? initialJob.doc_no : initialDocNo);
  const [docDate, setDocDate] = useState(isEdit ? initialJob.doc_date : getFixedTodayDate());
  const [dateLog, setDateLog] = useState(isEdit ? initialJob.date_logistic : getFixedTodayDate());
  const [car, setCar] = useState(isEdit ? initialJob.car : "");
  const [driver, setDriver] = useState(isEdit ? initialJob.driver : "");
  const [selectedWorkers, setSelectedWorkers] = useState<string[]>(
    isEdit ? initialJob.workers : []
  );
  const [deliveryRoundCode, setDeliveryRoundCode] = useState<string>(
    isEdit ? initialJob.delivery_round_code || "" : ""
  );
  const [deliveryRouteCode, setDeliveryRouteCode] = useState<string>(
    isEdit ? initialJob.delivery_route_code || "" : ""
  );
  const [deliveryRoutes, setDeliveryRoutes] = useState<
    Array<{ code: string; name: string; origin?: string; destination?: string; waypoints?: Array<string | { name?: string }> }>
  >([]);
  const [deliveryRounds, setDeliveryRounds] = useState<
    Array<{ code: string; name: string; time_label?: string }>
  >([]);
  const [saving, setSaving] = useState(false);

  const [cars, setCars] = useState<Option[]>(initialCars);
  const [drivers, setDrivers] = useState<Option[]>(initialDrivers);
  const [workers, setWorkers] = useState<Option[]>(initialWorkers);
  const [availableBills, setAvailableBills] = useState<AvailableBill[]>(() => {
    // In edit mode, also seed the available list with the bills already on
    // the job so that removing one in the kanban brings it back as draggable.
    if (isEdit && initialJob) {
      const seeded: AvailableBill[] = initialJob.bills.map((b) => ({
        doc_no: b.doc_no,
        doc_date: b.doc_date,
        cust_code: b.cust_code,
        cust_name: b.cust_name,
        telephone: b.telephone,
        count_item: b.count_item,
      }));
      const seen = new Set(seeded.map((b) => b.doc_no));
      for (const b of initialBills) if (!seen.has(b.doc_no)) seeded.push(b);
      return seeded;
    }
    return initialBills;
  });
  const [transportBranches, setTransportBranches] = useState<TransportBranch[]>([]);

  const [showInfoForm, setShowInfoForm] = useState(true);

  const { session } = useSession();
  const DELIVERY_BRANCH_CODES = ["02-0001", "02-0002", "02-0003"];
  // Branch model for trip creation. A user may be assigned ONE or MORE delivery
  // branches; the dispatch set (branch_codes) wins, else the legacy single
  // logistic_code.
  //  - Exactly one branch  → locked to it (server already scopes their bills).
  //  - More than one branch → must pick which of THEIR branches this trip is for.
  //  - No branch scope (manager / head office) → must pick any delivery branch.
  // Live delivery-branch set from the server (getJobAddPageData) takes precedence
  // over the cached client session, so a fresh admin assignment is reflected
  // without a re-login. Falls back to the session token until the server replies.
  const [assignedBranches, setAssignedBranches] = useState<string[] | null>(null);
  // Client-side fallback until the server (getJobAddPageData) replies. Mirror the
  // server's getBranchScope: keep every assigned branch except customer
  // self-pickup (02-0004) — a worker may be assigned a branch beyond the three
  // internal ones (e.g. 02-0007 ໂພນສະອາດ).
  const sessionBranches = (session?.branch_codes || session?.logistic_code || "")
    .split(",")
    .map((s) => s.trim())
    .filter((c) => c && c !== "02-0004");
  const myBranches = assignedBranches ?? sessionBranches;
  const ownBranch = myBranches[0] ?? "";
  const isBranchAdmin = myBranches.length === 1;
  const branchOptions = transportBranches.filter((b) =>
    myBranches.length > 0 ? myBranches.includes(b.code) : DELIVERY_BRANCH_CODES.includes(b.code)
  );
  const [selectedBranch, setSelectedBranch] = useState(
    isEdit ? initialJob.forward_transport_code || "" : ""
  );
  // Lock a single-branch user to their own branch once the session resolves.
  useEffect(() => {
    if (isBranchAdmin) setSelectedBranch(ownBranch);
  }, [isBranchAdmin, ownBranch]);
  const handleBranchChange = (code: string) => {
    setSelectedBranch(code);
    // Route/round belong to a branch's day — reset them when the branch changes.
    setDeliveryRouteCode("");
    setRouteSearch("");
    setDeliveryRoundCode("");
  };

  useEffect(() => {
    // Load ALL routes (incl. inactive) so a legacy/deactivated route that still
    // has scheduled bills can be labelled by name in the route dropdown.
    void Actions.listDeliveryRoutes(false)
      .then((data) =>
        setDeliveryRoutes(
          (data ?? []) as Array<{ code: string; name: string; origin?: string; destination?: string; waypoints?: Array<string | { name?: string }> }>
        )
      )
      .catch(() => setDeliveryRoutes([]));
    void Actions.listDeliveryRounds(true)
      .then((data) =>
        setDeliveryRounds(
          (data ?? []) as Array<{ code: string; name: string; time_label?: string }>
        )
      )
      .catch(() => setDeliveryRounds([]));
  }, []);

  useEffect(() => {
    void Actions.getTransportBranches()
      .then((data: any) => setTransportBranches((data ?? []) as TransportBranch[]))
      .catch((e) => console.error(e));
  }, []);

  // "ສົ່ງສາຂາ" (forward to branch) can target any branch other than the one
  // dispatching this trip — exclude the selected origin (fall back to ownBranch).
  const forwardableBranches = transportBranches.filter(
    (b) => b.code !== (selectedBranch || ownBranch)
  );

  // Initial page data + fallback
  useEffect(() => {
    let active = true;

    const applyPageData = (data: {
      doc_no?: string;
      cars?: Option[];
      drivers?: Option[];
      workers?: Option[];
      bills?: AvailableBill[];
    }) => {
      if (!active) return;
      // In edit mode, the doc_no is fixed and the bill list is supplemental.
      if (data.doc_no && !isEdit) setDocNo(data.doc_no);
      if (Array.isArray(data.cars)) setCars(data.cars);
      if (Array.isArray(data.drivers)) setDrivers(data.drivers);
      if (Array.isArray(data.workers)) setWorkers(data.workers);
      if (Array.isArray(data.bills)) setAvailableBills(data.bills);
    };

    const loadFallbackData = async () => {
      const [jobInit, carsResult, driversResult, workersResult, billsResult] =
        await Promise.allSettled([
          Actions.getJobInit(),
          Actions.getCars(),
          Actions.getDispatchDrivers(),
          Actions.getDispatchWorkers(),
          Actions.getAvailableBills(),
        ]);

      if (!active) return;

      if (jobInit.status === "fulfilled") {
        applyPageData({
          doc_no: jobInit.value?.doc_no,
          bills: (jobInit.value?.bills ?? []) as AvailableBill[],
        });
      }
      if (carsResult.status === "fulfilled") {
        applyPageData({ cars: (carsResult.value ?? []) as Option[] });
      }
      if (driversResult.status === "fulfilled") {
        applyPageData({ drivers: (driversResult.value ?? []) as Option[] });
      }
      if (workersResult.status === "fulfilled") {
        applyPageData({ workers: (workersResult.value ?? []) as Option[] });
      }
      if (billsResult.status === "fulfilled") {
        applyPageData({ bills: (billsResult.value ?? []) as AvailableBill[] });
      }
    };

    void (async () => {
      try {
        const data = await Actions.getJobAddPageData();
        applyPageData(data as {
          doc_no?: string;
          cars?: Option[];
          drivers?: Option[];
          workers?: Option[];
          bills?: AvailableBill[];
        });
        const mb = (data as { my_branches?: string[] })?.my_branches;
        if (active && Array.isArray(mb)) setAssignedBranches(mb);

        const hasCars = Array.isArray(data?.cars) && data.cars.length > 0;
        const hasDrivers = Array.isArray(data?.drivers) && data.drivers.length > 0;
        const hasWorkers = Array.isArray(data?.workers) && data.workers.length > 0;

        if (!hasCars || !hasDrivers || !hasWorkers) {
          await loadFallbackData();
        }
      } catch (error) {
        console.error("Failed to load add-job page data", error);
        await loadFallbackData();
      }
    })();

    return () => {
      active = false;
    };
    // isEdit / initialJob are stable for the lifetime of this component; we
    // only want this effect to run once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persisted draft (create mode only). In edit mode we hydrate from initialJob.
  const [addedByBill, setAddedByBill] = useState<Record<string, AddedBillGroup>>(() => {
    if (isEdit && initialJob) {
      const map: Record<string, AddedBillGroup> = {};
      for (const b of initialJob.bills) {
        map[b.doc_no] = {
          bill: {
            doc_no: b.doc_no,
            doc_date: b.doc_date,
            cust_code: b.cust_code,
            cust_name: b.cust_name,
            telephone: b.telephone,
            count_item: b.count_item,
          },
          items: b.items.map((it) => ({
            item_code: it.item_code,
            item_name: it.item_name,
            qty: it.qty,
            selectedQty: it.selectedQty,
            unit_code: it.unit_code,
          })),
          forward_transport_code: b.forward_transport_code || undefined,
          pickup_transport_code: b.pickup_transport_code || null,
          delivery_condition: b.delivery_condition || "to_customer",
        };
      }
      return map;
    }
    if (typeof window === "undefined") return {};
    try {
      const saved = localStorage.getItem("tms_job_draft");
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  const [searchText, setSearchText] = useState("");
  const [searchingIcTrans, setSearchingIcTrans] = useState(false);
  const icTransDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // In edit mode, seed the products cache so already-attached bills can be
  // expanded without an extra fetch (and without hitting the "remaining"
  // calculation which subtracts our own selections).
  const [billProductsByNo, setBillProductsByNo] = useState<Record<string, Product[]>>(() => {
    if (isEdit && initialJob) {
      const map: Record<string, Product[]> = {};
      for (const b of initialJob.bills) {
        map[b.doc_no] = b.products.map((p) => ({
          item_code: p.item_code,
          item_name: p.item_name,
          qty: p.qty,
          unit_code: p.unit_code,
        }));
      }
      return map;
    }
    return {};
  });
  const [warehouseItemsByNo, setWarehouseItemsByNo] = useState<Record<string, WarehouseItem[]>>({});
  // Bill currently open in the "ຈັດຖ້ຽວທີ່ເຫຼືອຕາມສາຂາ" split dialog.
  const [splitBillNo, setSplitBillNo] = useState<string | null>(null);
  const [loadingBillNo, setLoadingBillNo] = useState<string | null>(null);
  const [expandedInJob, setExpandedInJob] = useState<string | null>(null);
  const [qtyDrafts, setQtyDrafts] = useState<Record<string, string>>({});

  // Drag-and-drop state
  const [draggedBillNo, setDraggedBillNo] = useState<string | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<"available" | "added" | null>(null);

  const [carSearch, setCarSearch] = useState("");
  const [driverSearch, setDriverSearch] = useState("");
  const [workerSearch, setWorkerSearch] = useState("");
  const [routeSearch, setRouteSearch] = useState("");
  const [showCarDrop, setShowCarDrop] = useState(false);
  const [showDriverDrop, setShowDriverDrop] = useState(false);
  const [showWorkerDrop, setShowWorkerDrop] = useState(false);
  const [showRouteDrop, setShowRouteDrop] = useState(false);
  const carRef = useRef<HTMLDivElement>(null);
  const driverRef = useRef<HTMLDivElement>(null);
  const workerRef = useRef<HTMLDivElement>(null);
  const routeRef = useRef<HTMLDivElement>(null);
  const deferredSearchText = useDeferredValue(searchText);
  const deferredCarSearch = useDeferredValue(carSearch);
  const deferredDriverSearch = useDeferredValue(driverSearch);
  const deferredWorkerSearch = useDeferredValue(workerSearch);
  const deferredRouteSearch = useDeferredValue(routeSearch);
  // Persist draft (create mode only — edit mode shouldn't pollute the create draft)
  useEffect(() => {
    if (isEdit) return;
    try {
      if (Object.keys(addedByBill).length > 0) {
        localStorage.setItem("tms_job_draft", JSON.stringify(addedByBill));
      } else {
        localStorage.removeItem("tms_job_draft");
      }
    } catch {}
  }, [addedByBill, isEdit]);

  // The ready-to-dispatch pool is fetched once when the page opens and then
  // filtered client-side by date / route / round. That left a stale snapshot:
  // bills scheduled AFTER the page was opened never showed up when the
  // dispatcher picked another ວັນທີຈັດສົ່ງ. Refetch whenever the date or the
  // branch changes, and expose a manual refresh for the same pool.
  const addedByBillRef = useRef(addedByBill);
  useEffect(() => {
    addedByBillRef.current = addedByBill;
  }, [addedByBill]);
  // doc_nos that only exist client-side because the ic_trans search pulled them
  // in — the pool query doesn't return them, so a refresh must not drop them.
  const searchAddedRef = useRef<Set<string>>(new Set());
  const [refreshingPool, setRefreshingPool] = useState(false);
  const poolRequestRef = useRef(0);

  // Only the selected day is refetched. The unfiltered pool is the whole fixed
  // year — ~2,000 bills / ~860 KB — to display the handful due on one date, and
  // re-downloading that on every date change is what made the page crawl.
  const refreshAvailableBills = useCallback(async (day: string) => {
    if (!day) return;
    const requestId = ++poolRequestRef.current;
    setRefreshingPool(true);
    try {
      const data = await Actions.getAvailableBills(day);
      // A slower earlier request must not overwrite a newer one's result.
      if (requestId !== poolRequestRef.current) return;
      const fresh = (data ?? []) as AvailableBill[];
      const freshCodes = new Set(fresh.map((b) => b.doc_no));
      setAvailableBills((prev) => [
        ...fresh,
        ...prev.filter(
          (b) =>
            !freshCodes.has(b.doc_no) &&
            // Replace this day's slice wholesale (bills scheduled away or
            // dispatched elsewhere must disappear), keep every other day, plus
            // the rows the pool query can't produce: bills already dragged into
            // this trip (edit-mode seeds included) and search-only hits.
            (b.scheduled_date !== day ||
              addedByBillRef.current[b.doc_no] ||
              searchAddedRef.current.has(b.doc_no))
        ),
      ]);
    } catch (error) {
      console.error("refresh available bills failed", error);
    } finally {
      if (requestId === poolRequestRef.current) setRefreshingPool(false);
    }
  }, []);

  // Skip the very first run — the mount effect above already loaded the pool.
  const poolLoadedRef = useRef(false);
  useEffect(() => {
    if (!poolLoadedRef.current) {
      poolLoadedRef.current = true;
      return;
    }
    if (!dateLog) return;
    void refreshAvailableBills(dateLog);
  }, [dateLog, selectedBranch, refreshAvailableBills]);

  // ic_trans server-side search
  useEffect(() => {
    const q = deferredSearchText.trim();
    if (q.length < 2) {
      setSearchingIcTrans(false);
      if (icTransDebounceRef.current) {
        clearTimeout(icTransDebounceRef.current);
        icTransDebounceRef.current = null;
      }
      return;
    }
    if (icTransDebounceRef.current) clearTimeout(icTransDebounceRef.current);
    setSearchingIcTrans(true);
    icTransDebounceRef.current = setTimeout(() => {
      Actions.searchBillsForJob(q)
        .then((data) => {
          const list = (data ?? []) as AvailableBill[];
          if (list.length === 0) return;
          setAvailableBills((prev) => {
            const seen = new Set(prev.map((b) => b.doc_no));
            const additions = list.filter((b) => !seen.has(b.doc_no));
            if (additions.length === 0) return prev;
            // Remember them so a pool refresh (date change) keeps them around.
            for (const b of additions) searchAddedRef.current.add(b.doc_no);
            return [...prev, ...additions];
          });
        })
        .catch((err) => console.error("ic_trans search failed", err))
        .finally(() => setSearchingIcTrans(false));
    }, 300);
    return () => {
      if (icTransDebounceRef.current) {
        clearTimeout(icTransDebounceRef.current);
        icTransDebounceRef.current = null;
      }
    };
  }, [deferredSearchText]);

  // Auto-fill driver/workers when car changes. In edit mode we skip the
  // initial run so the saved driver/workers aren't overwritten on mount.
  const skipNextCarDefaultsRef = useRef<boolean>(isEdit);
  useEffect(() => {
    if (!car) return;
    const selectedCar = cars.find((item) => item.code === car);
    if (selectedCar) setCarSearch(selectedCar.name_1);
    if (skipNextCarDefaultsRef.current) {
      skipNextCarDefaultsRef.current = false;
      return;
    }
    Actions.getCarDefaults(car)
      .then((defaults) => {
        if (defaults.drivers.length > 0) {
          setDriver(defaults.drivers[0].code);
          setDriverSearch(defaults.drivers[0].name_1);
        }
        if (defaults.workers.length > 0) {
          setSelectedWorkers(defaults.workers.map((w: { code: string }) => w.code));
        }
      })
      .catch(console.error);
  }, [car, cars]);

  useEffect(() => {
    if (!driver) return;
    const selectedDriver = drivers.find((item) => item.code === driver);
    if (selectedDriver) setDriverSearch(selectedDriver.name_1);
    setSelectedWorkers((current) => current.filter((c) => c !== driver));
  }, [driver, drivers]);

  // Keep the route search box showing the selected route's label (edit mode
  // hydration + after the route list loads asynchronously).
  useEffect(() => {
    if (!deliveryRouteCode) return;
    const selected = deliveryRoutes.find((r) => r.code === deliveryRouteCode);
    // Fall back to the bare code so a legacy route (absent from the master)
    // still labels the search box in edit mode instead of going blank.
    setRouteSearch(selected ? routeLabel(selected) : deliveryRouteCode);
  }, [deliveryRouteCode, deliveryRoutes]);

  useEffect(() => {
    const handler = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!carRef.current?.contains(target)) setShowCarDrop(false);
      if (!driverRef.current?.contains(target)) setShowDriverDrop(false);
      if (!workerRef.current?.contains(target)) setShowWorkerDrop(false);
      if (!routeRef.current?.contains(target)) setShowRouteDrop(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const ensureBillProducts = async (billNo: string): Promise<Product[]> => {
    if (billProductsByNo[billNo]) return billProductsByNo[billNo];
    setLoadingBillNo(billNo);
    try {
      const [products, whItems] = await Promise.all([
        Actions.getAvailableBillProducts(billNo) as Promise<Product[]>,
        Actions.getBillItemsByWarehouse(billNo) as Promise<WarehouseItem[]>,
      ]);
      setBillProductsByNo((current) => ({ ...current, [billNo]: products }));
      setWarehouseItemsByNo((current) => ({ ...current, [billNo]: whItems }));
      return products;
    } finally {
      setLoadingBillNo(null);
    }
  };

  // Drag → drop on "added" column = add bill with all items default qty
  const handleAddBillFull = async (billNo: string) => {
    const bill = availableBills.find((b) => b.doc_no === billNo);
    if (!bill) return;
    if (addedByBill[billNo]) return; // already in
    try {
      const products = await ensureBillProducts(billNo);
      if (products.length === 0) return;
      setAddedByBill((prev) => ({
        ...prev,
        [billNo]: {
          bill,
          items: products.map((p) => ({ ...p, selectedQty: p.qty })),
          // Default to the common case (ສົ່ງລູກຄ້າ) so the trip is savable
          // immediately; the dispatcher can switch it per bill.
          delivery_condition: "to_customer",
        },
      }));
    } catch (e) {
      console.error(e);
    }
  };

  // ── Pre-add item picker on the available card ──
  // Tapping a card opens its item list showing the quantity still owed to the
  // customer (getAvailableBillProducts already nets out what other trips hold
  // and what has been delivered). From there the dispatcher ticks the lines to
  // send and edits each quantity, then commits only that selection to the trip.
  // Kept in local state — the bill must stay in the available column while they
  // are choosing, so it can't be bound to addedByBill directly.
  const [expandedAvailable, setExpandedAvailable] = useState<Set<string>>(new Set());
  const [previewSelection, setPreviewSelection] = useState<
    Record<string, Record<string, { checked: boolean; qty: string }>>
  >({});

  const toggleAvailablePreview = (billNo: string) => {
    setExpandedAvailable((prev) => {
      const next = new Set(prev);
      if (next.has(billNo)) next.delete(billNo);
      else next.add(billNo);
      return next;
    });
    if (!billProductsByNo[billNo]) {
      void ensureBillProducts(billNo).catch((err) =>
        console.error("load bill products failed", err)
      );
    }
  };

  // Defaults (everything ticked at its full remaining qty) are applied lazily so
  // an untouched bill needs no state at all.
  const previewEntry = (billNo: string, product: Product) =>
    previewSelection[billNo]?.[product.item_code] ?? {
      checked: true,
      qty: String(product.qty),
    };

  const setPreviewEntry = (
    billNo: string,
    itemCode: string,
    patch: Partial<{ checked: boolean; qty: string }>,
    fallback: { checked: boolean; qty: string }
  ) =>
    setPreviewSelection((prev) => ({
      ...prev,
      [billNo]: {
        ...prev[billNo],
        [itemCode]: { ...fallback, ...prev[billNo]?.[itemCode], ...patch },
      },
    }));

  const togglePreviewItem = (billNo: string, product: Product) => {
    const current = previewEntry(billNo, product);
    setPreviewEntry(
      billNo,
      product.item_code,
      { checked: !current.checked },
      { checked: true, qty: String(product.qty) }
    );
  };

  const togglePreviewAll = (billNo: string, checked: boolean) => {
    const products = billProductsByNo[billNo] ?? [];
    setPreviewSelection((prev) => {
      const next = { ...(prev[billNo] ?? {}) };
      for (const p of products) {
        next[p.item_code] = {
          qty: next[p.item_code]?.qty ?? String(p.qty),
          checked,
        };
      }
      return { ...prev, [billNo]: next };
    });
  };

  const setPreviewQty = (billNo: string, product: Product, value: string) =>
    setPreviewEntry(
      billNo,
      product.item_code,
      { qty: value },
      { checked: true, qty: String(product.qty) }
    );

  // Clamp on blur so typing is unrestricted but what lands in the trip never
  // exceeds the quantity still owed (nor drops below 1).
  const commitPreviewQty = (billNo: string, product: Product) => {
    const entry = previewEntry(billNo, product);
    const parsed = Number(entry.qty);
    const clamped = Number.isFinite(parsed)
      ? Math.max(1, Math.min(parsed, product.qty))
      : product.qty;
    setPreviewEntry(
      billNo,
      product.item_code,
      { qty: String(clamped) },
      { checked: true, qty: String(product.qty) }
    );
  };

  const previewCheckedItems = (billNo: string): SelectedProduct[] => {
    const products = billProductsByNo[billNo] ?? [];
    return products
      .filter((p) => previewEntry(billNo, p).checked)
      .map((p) => {
        const parsed = Number(previewEntry(billNo, p).qty);
        return {
          ...p,
          selectedQty: Number.isFinite(parsed)
            ? Math.max(1, Math.min(parsed, p.qty))
            : p.qty,
        };
      });
  };

  const handleAddSelectedItems = (billNo: string) => {
    const bill = availableBills.find((b) => b.doc_no === billNo);
    if (!bill || addedByBill[billNo]) return;
    const items = previewCheckedItems(billNo);
    if (items.length === 0) return;
    setAddedByBill((prev) => ({
      ...prev,
      [billNo]: { bill, items, delivery_condition: "to_customer" },
    }));
    setExpandedAvailable((prev) => {
      const next = new Set(prev);
      next.delete(billNo);
      return next;
    });
    setPreviewSelection((prev) => {
      const next = { ...prev };
      delete next[billNo];
      return next;
    });
  };

  const toggleAddedItem = (bill: AvailableBill, product: Product) => {
    setAddedByBill((prev) => {
      const next = { ...prev };
      const existing = next[bill.doc_no]?.items ?? [];
      const has = existing.some((i) => i.item_code === product.item_code);
      if (has) {
        const items = existing.filter((i) => i.item_code !== product.item_code);
        if (items.length === 0) {
          delete next[bill.doc_no];
        } else {
          next[bill.doc_no] = { ...next[bill.doc_no], bill, items };
        }
      } else {
        next[bill.doc_no] = {
          ...next[bill.doc_no],
          bill,
          items: [...existing, { ...product, selectedQty: product.qty }],
          delivery_condition:
            next[bill.doc_no]?.delivery_condition ?? "to_customer",
        };
      }
      return next;
    });
    setQtyDrafts((prev) => {
      const draft = { ...prev };
      delete draft[`${bill.doc_no}::${product.item_code}`];
      return draft;
    });
  };

  const updateItemQty = (billNo: string, itemCode: string, qty: number, maxQty: number) => {
    setAddedByBill((prev) => {
      const group = prev[billNo];
      if (!group) return prev;
      const next = { ...prev };
      const items = group.items.map((i) =>
        i.item_code === itemCode
          ? { ...i, selectedQty: Math.max(1, Math.min(qty, maxQty)) }
          : i
      );
      next[billNo] = { ...group, items };
      return next;
    });
  };

  const commitItemQty = (billNo: string, itemCode: string, maxQty: number) => {
    const draftKey = `${billNo}::${itemCode}`;
    const draftValue = qtyDrafts[draftKey];
    if (draftValue === undefined) return;
    const parsed = Number(draftValue);
    const nextQty = Number.isFinite(parsed) ? Math.max(1, Math.min(parsed, maxQty)) : maxQty;
    updateItemQty(billNo, itemCode, nextQty, maxQty);
    setQtyDrafts((prev) => ({ ...prev, [draftKey]: String(nextQty) }));
  };

  const setBillForwardCode = (billNo: string, code: string | null) => {
    setAddedByBill((prev) => {
      const group = prev[billNo];
      if (!group) return prev;
      return {
        ...prev,
        [billNo]: {
          ...group,
          forward_transport_code: code === null ? undefined : code,
        },
      };
    });
  };

  const setBillPickupCode = (billNo: string, code: string | null) => {
    setAddedByBill((prev) => {
      const group = prev[billNo];
      if (!group) return prev;
      return {
        ...prev,
        [billNo]: {
          ...group,
          pickup_transport_code: code,
        },
      };
    });
  };

  // Pick the mandatory delivery condition. "ສົ່ງສາຂາ" (to_branch) keeps a
  // forward branch (defaults to the first option); every other condition clears
  // it so the completion path treats the bill as a direct hand-off/customer.
  const setBillDeliveryCondition = (billNo: string, code: string) => {
    setAddedByBill((prev) => {
      const group = prev[billNo];
      if (!group) return prev;
      const nextForward =
        code === "to_branch"
          ? group.forward_transport_code || forwardableBranches[0]?.code || undefined
          : undefined;
      return {
        ...prev,
        [billNo]: {
          ...group,
          delivery_condition: code,
          forward_transport_code: nextForward,
        },
      };
    });
  };

  // Select only the items belonging to a specific warehouse for this bill.
  // Used by the "split by warehouse" UI — the dispatcher picks warehouse X, and
  // only that warehouse's items remain checked for this trip.
  const selectItemsByWarehouse = (billNo: string, whCode: string) => {
    const whItems = warehouseItemsByNo[billNo];
    const products = billProductsByNo[billNo];
    if (!whItems || !products) return;
    const whItemCodes = new Set(
      whItems.filter((w) => w.wh_code === whCode).map((w) => w.item_code)
    );
    setAddedByBill((prev) => {
      const group = prev[billNo];
      if (!group) return prev;
      const filteredItems = group.items
        .filter((i) => whItemCodes.has(i.item_code))
        .concat(
          // Add any not-yet-added wh items (full qty)
          products
            .filter((p) => whItemCodes.has(p.item_code) && !group.items.some((i) => i.item_code === p.item_code))
            .map((p) => ({ ...p, selectedQty: p.qty }))
        );
      if (filteredItems.length === 0) return prev;
      return { ...prev, [billNo]: { ...group, items: filteredItems } };
    });
  };

  const handleRemoveBill = (billNo: string) =>
    setAddedByBill((prev) => {
      const next = { ...prev };
      delete next[billNo];
      return next;
    });

  const handleSave = async () => {
    if (!step1Valid || totalAddedBills === 0) {
      void confirm({
        title: "ຂໍ້ມູນບໍ່ຄົບ",
        message:
          validationHints.length > 0
            ? `ກະລຸນາ: ${validationHints.join(" · ")}`
            : "ກະລຸນາກວດສອບຂໍ້ມູນ",
        tone: "warning",
        single: true,
      });
      return;
    }

    setSaving(true);
    try {
      const bills = Object.entries(addedByBill).map(([billNo, group]) => ({
        bill_no: billNo,
        bill_date: group.bill.doc_date,
        cust_code: group.bill.cust_code,
        count_item: group.items.length,
        telephone: group.bill.telephone,
        forward_transport_code: group.forward_transport_code || null,
        pickup_transport_code: group.pickup_transport_code || null,
        delivery_condition: group.delivery_condition || null,
        items: group.items.map((p) => ({
          item_code: p.item_code,
          item_name: p.item_name,
          qty: p.qty,
          selectedQty: p.selectedQty,
          unit_code: p.unit_code,
        })),
      }));

      const payload = {
        doc_date: docDate,
        doc_no: docNo,
        date_log: dateLog,
        car,
        driver,
        delivery_route_code: deliveryRouteCode || null,
        delivery_round_code: deliveryRoundCode || null,
        workers: selectedWorkers,
        forward_transport_code: selectedBranch || null,
        bills,
      };

      if (isEdit) {
        await Actions.updateJob(docNo, payload);
      } else {
        await Actions.createJob(payload);
        localStorage.removeItem("tms_job_draft");
      }
      router.push("/jobs");
    } catch (error) {
      console.error(error);
      const message = error instanceof Error ? error.message : String(error);
      void confirm({
        title: "ບັນທຶກບໍ່ສຳເລັດ",
        message,
        tone: "danger",
        single: true,
      });
    } finally {
      setSaving(false);
    }
  };

  // Derived
  const normalizedSearchText = deferredSearchText.trim().toLowerCase();
  const totalAddedItems = Object.values(addedByBill).reduce((s, g) => s + g.items.length, 0);
  const totalAddedBills = Object.keys(addedByBill).length;

  const branchChosen = isBranchAdmin || Boolean(selectedBranch);
  // Every added bill must have a delivery condition; "ສົ່ງສາຂາ" also needs a branch.
  const billsMissingCondition = Object.values(addedByBill).filter(
    (g) => !g.delivery_condition || (g.delivery_condition === "to_branch" && !g.forward_transport_code)
  ).length;
  const step1Valid = Boolean(
    branchChosen && car && driver && docDate && dateLog && deliveryRouteCode && deliveryRoundCode
  );
  const canSave = step1Valid && totalAddedBills > 0 && billsMissingCondition === 0 && Boolean(docNo);

  const validationHints: string[] = [];
  if (!branchChosen) validationHints.push("ເລືອກສາຂາ");
  if (!dateLog) validationHints.push("ເລືອກວັນທີຈັດສົ່ງ");
  if (!car) validationHints.push("ເລືອກລົດ");
  if (!driver) validationHints.push("ເລືອກຄົນຂັບ");
  if (!deliveryRouteCode) validationHints.push("ເລືອກເສັ້ນທາງ");
  if (!deliveryRoundCode) validationHints.push("ເລືອກຮອບ");
  if (totalAddedBills === 0) validationHints.push("ເພີ່ມບິນ");
  if (billsMissingCondition > 0) validationHints.push(`ເລືອກເງື່ອນໄຂການຈັດສົ່ງ (${billsMissingCondition} ບິນ)`);

  const filteredCars = cars.filter(
    (item) =>
      !deferredCarSearch ||
      item.name_1.toLowerCase().includes(deferredCarSearch.toLowerCase()) ||
      item.code.toLowerCase().includes(deferredCarSearch.toLowerCase())
  );
  // Ready bills scoped to the chosen branch. A branch admin's pool is already
  // server-scoped; a manager sees nothing until they pick a branch.
  const branchBills = useMemo(() => {
    if (isBranchAdmin) return availableBills;
    if (!selectedBranch) return [];
    return availableBills.filter(
      (b) => (b.delivery_transport_code ?? "").trim() === selectedBranch
    );
  }, [availableBills, isBranchAdmin, selectedBranch]);

  // Bills that still need delivery on the selected date (dateLog), counted per
  // route and per round, from the ready-to-dispatch pool. Used to (a) show only
  // routes that actually have bills that day and (b) show the bill count.
  const routeBillCounts = useMemo(() => {
    const m: Record<string, number> = {};
    if (!dateLog) return m;
    for (const b of branchBills) {
      if (b.scheduled_date !== dateLog) continue;
      const rc = (b.delivery_route_code ?? "").trim();
      if (!rc) continue;
      m[rc] = (m[rc] ?? 0) + 1;
    }
    return m;
  }, [branchBills, dateLog]);

  // Round counts are scoped to the selected route (once chosen) so the round
  // dropdown reflects how many bills sit in each round of that route/day.
  const roundBillCounts = useMemo(() => {
    const m: Record<string, number> = {};
    if (!dateLog) return m;
    for (const b of branchBills) {
      if (b.scheduled_date !== dateLog) continue;
      if (deliveryRouteCode && (b.delivery_route_code ?? "").trim() !== deliveryRouteCode) continue;
      const rd = (b.delivery_round_code ?? "").trim();
      if (!rd) continue;
      m[rd] = (m[rd] ?? 0) + 1;
    }
    return m;
  }, [branchBills, dateLog, deliveryRouteCode]);

  // Routes shown by BRANCH, driven by the bills themselves so none is hidden:
  // every distinct route that has scheduled (undelivered) bills for the selected
  // branch is selectable — regardless of the chosen date, and even for legacy or
  // deactivated route codes no longer in the route master (those fall back to
  // showing their code). The currently-selected route is always kept. Routes
  // with bills on the selected date float to the top with a count badge.
  const routeLabelByCode = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of deliveryRoutes) m.set(r.code, routeLabel(r));
    return m;
  }, [deliveryRoutes]);

  const branchRouteCodes = useMemo(() => {
    const codes = new Set<string>();
    for (const b of branchBills) {
      const rc = (b.delivery_route_code ?? "").trim();
      if (rc) codes.add(rc);
    }
    return codes;
  }, [branchBills]);

  const filteredRoutes: Option[] = useMemo(() => {
    const codes = new Set(branchRouteCodes);
    if (deliveryRouteCode) codes.add(deliveryRouteCode);
    return Array.from(codes)
      .map((code, i) => {
        const n = routeBillCounts[code] ?? 0;
        const base = routeLabelByCode.get(code) ?? code;
        return { code, name_1: n > 0 ? `${base} · ${n} ບິນ` : base, _n: n, _i: i };
      })
      .sort((a, b) => b._n - a._n || a._i - b._i)
      .filter(
        (item) =>
          !deferredRouteSearch ||
          item.name_1.toLowerCase().includes(deferredRouteSearch.toLowerCase()) ||
          item.code.toLowerCase().includes(deferredRouteSearch.toLowerCase())
      )
      .map(({ code, name_1 }) => ({ code, name_1 }));
  }, [branchRouteCodes, deliveryRouteCode, routeBillCounts, routeLabelByCode, deferredRouteSearch]);

  const filteredDrivers = drivers.filter(
    (item) =>
      !deferredDriverSearch ||
      item.name_1.toLowerCase().includes(deferredDriverSearch.toLowerCase()) ||
      item.code.toLowerCase().includes(deferredDriverSearch.toLowerCase())
  );
  const filteredWorkers = workers.filter(
    (item) =>
      item.code !== driver &&
      !selectedWorkers.includes(item.code) &&
      (!deferredWorkerSearch || item.name_1.toLowerCase().includes(deferredWorkerSearch.toLowerCase()))
  );

  // Available column = bills NOT yet in addedByBill (or partially with remaining items)
  const availableColumnBills = useMemo(() => {
    if (!dateLog || !deliveryRouteCode || !deliveryRoundCode) return [];
    return branchBills
      .filter((b) => !addedByBill[b.doc_no]) // exclude already-added (kanban-style)
      .filter(
        (b) =>
          b.scheduled_date === dateLog &&
          b.delivery_route_code === deliveryRouteCode &&
          b.delivery_round_code === deliveryRoundCode
      )
      .filter(
        (b) =>
          !normalizedSearchText ||
          b.doc_no.toLowerCase().includes(normalizedSearchText) ||
          (b.cust_name || "").toLowerCase().includes(normalizedSearchText) ||
          b.cust_code.toLowerCase().includes(normalizedSearchText)
      );
  }, [branchBills, addedByBill, normalizedSearchText, dateLog, deliveryRouteCode, deliveryRoundCode]);

  const availableEmptyText = !dateLog || !deliveryRouteCode || !deliveryRoundCode
    ? "ເລືອກວັນຈັດສົ່ງ, ເສັ້ນທາງ ແລະ ຮອບກ່ອນ"
    : normalizedSearchText
      ? "ລອງຄົ້ນຫາຄຳອື່ນ"
      : "ບໍ່ມີບິນທີ່ກົງກັບວັນ, ເສັ້ນທາງ ແລະ ຮອບນີ້";

  const addedColumnEntries = useMemo(
    () => Object.entries(addedByBill),
    [addedByBill]
  );

  // Add every bill currently shown in the available column (with all its items).
  const [addingAll, setAddingAll] = useState(false);
  const handleAddAll = async () => {
    if (availableColumnBills.length === 0 || addingAll) return;
    setAddingAll(true);
    try {
      for (const b of availableColumnBills) {
        await handleAddBillFull(b.doc_no);
      }
    } finally {
      setAddingAll(false);
    }
  };
  return (
    <div className="-m-4 min-h-screen bg-slate-100 text-slate-900 md:-m-5 lg:-m-6 dark:bg-slate-950 dark:text-slate-100">
      {/* Top header */}
      <div className="sticky top-0 z-30 border-b border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="mx-auto flex w-full max-w-[1700px] items-center gap-3 px-4 py-2.5 sm:px-6">
          <Link
            href="/jobs"
            className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-md border border-slate-300 bg-white text-slate-600 transition-colors hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            <FaArrowLeft className="text-sm" />
          </Link>

          <div className="min-w-0 flex-1">
            <h1 className="truncate text-base font-bold leading-tight text-slate-900 dark:text-white">
              {isEdit ? "ແກ້ໄຂຖ້ຽວຈັດສົ່ງ" : "ສ້າງຖ້ຽວຈັດສົ່ງ"}
            </h1>
            <span className="font-mono text-[11px] font-semibold text-slate-400 dark:text-slate-500">{docNo || "—"}</span>
          </div>

          <button
            type="button"
            onClick={() => setShowInfoForm((v) => !v)}
            className="hidden items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800 lg:flex"
          >
            <FaInfoCircle size={11} className="text-teal-600 dark:text-teal-400" />
            {showInfoForm ? "ເຊື່ອງຂໍ້ມູນຖ້ຽວ" : "ສະແດງຂໍ້ມູນຖ້ຽວ"}
            <FaChevronDown className={`text-[10px] transition-transform ${showInfoForm ? "rotate-180" : ""}`} />
          </button>

          <div className="hidden items-center gap-2 md:flex">
            <Chip ok={!!car} icon={<FaTruck size={10} />}>
              {car ? cars.find((c) => c.code === car)?.name_1 || "—" : "ບໍ່ມີລົດ"}
            </Chip>
            <Chip ok={!!driver} icon={<FaUser size={10} />}>
              {driver ? drivers.find((d) => d.code === driver)?.name_1 || "—" : "ບໍ່ມີຄົນຂັບ"}
            </Chip>
            <Chip ok={totalAddedBills > 0} icon={<FaBoxOpen size={10} />}>
              {totalAddedBills} ບິນ · {totalAddedItems} ລາຍການ
            </Chip>
          </div>
 
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={saving}
            className={`flex flex-shrink-0 items-center gap-2 rounded-md px-4 py-2 text-sm font-bold text-white transition-colors ${
              canSave
                ? "bg-teal-600 hover:bg-teal-700"
                : "cursor-not-allowed bg-slate-300 text-slate-500 dark:bg-slate-700 dark:text-slate-500"
            } disabled:cursor-not-allowed disabled:opacity-60`}
          >
            {saving ? <FaSpinner className="animate-spin" size={13} /> : <FaSave size={13} />}
            <span className="hidden sm:inline">
              {saving
                ? "ກຳລັງບັນທຶກ..."
                : isEdit
                  ? "ບັນທຶກການແກ້ໄຂ"
                  : "ບັນທຶກຖ້ຽວ"}
            </span>
          </button>
        </div>
 
        {validationHints.length > 0 && (
          <div className="border-t border-amber-200 bg-amber-50 px-4 py-1.5 text-[11px] font-semibold text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300 sm:px-6">
            ⚠ ຍັງເຫຼືອ: {validationHints.join(" · ")}
          </div>
        )}
      </div>

      {/* Body: settings sidebar + bills */}
      <div
        className={`mx-auto grid w-full max-w-[1700px] items-start gap-4 px-4 py-4 sm:px-6 ${
          showInfoForm ? "lg:grid-cols-[330px_minmax(0,1fr)]" : "lg:grid-cols-1"
        }`}
      >
        {showInfoForm && (
          <aside className="lg:sticky lg:top-[57px] lg:max-h-[calc(100vh-73px)] lg:self-start lg:overflow-y-auto lg:pr-1">
            <JobInfoStrip
              isBranchAdmin={isBranchAdmin}
              selectedBranch={selectedBranch}
              onBranchChange={handleBranchChange}
              branchOptions={branchOptions}
              docDate={docDate}
              setDocDate={setDocDate}
              dateLog={dateLog}
              setDateLog={setDateLog}
              deliveryRouteCode={deliveryRouteCode}
              setDeliveryRouteCode={setDeliveryRouteCode}
              filteredRoutes={filteredRoutes}
              routeSearch={routeSearch}
              setRouteSearch={setRouteSearch}
              showRouteDrop={showRouteDrop}
              setShowRouteDrop={setShowRouteDrop}
              routeRef={routeRef}
              deliveryRoundCode={deliveryRoundCode}
              setDeliveryRoundCode={setDeliveryRoundCode}
              deliveryRounds={deliveryRounds}
              roundBillCounts={roundBillCounts}
              car={car}
              setCar={setCar}
              filteredCars={filteredCars}
              carSearch={carSearch}
              setCarSearch={setCarSearch}
              showCarDrop={showCarDrop}
              setShowCarDrop={setShowCarDrop}
              carRef={carRef}
              driver={driver}
              setDriver={setDriver}
              filteredDrivers={filteredDrivers}
              driverSearch={driverSearch}
              setDriverSearch={setDriverSearch}
              showDriverDrop={showDriverDrop}
              setShowDriverDrop={setShowDriverDrop}
              driverRef={driverRef}
              workers={workers}
              filteredWorkers={filteredWorkers}
              workerSearch={workerSearch}
              setWorkerSearch={setWorkerSearch}
              showWorkerDrop={showWorkerDrop}
              setShowWorkerDrop={setShowWorkerDrop}
              workerRef={workerRef}
              selectedWorkers={selectedWorkers}
              setSelectedWorkers={setSelectedWorkers}
            />
          </aside>
        )}

        {/* Bills */}
        <div className="grid min-w-0 gap-4 md:grid-cols-2">
          {/* Available column */}
          <KanbanColumn
            tone="slate"
            title="ບິນທີ່ມີ"
            count={availableColumnBills.length}
            highlighted={dragOverColumn === "available"}
            onDragOver={(e) => {
              if (draggedBillNo && addedByBill[draggedBillNo]) {
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                setDragOverColumn("available");
              }
            }}
            onDragLeave={() => setDragOverColumn(null)}
            onDrop={(e) => {
              e.preventDefault();
              const billNo = e.dataTransfer.getData("text/plain");
              if (billNo && addedByBill[billNo]) {
                handleRemoveBill(billNo);
              }
              setDragOverColumn(null);
            }}
            header={
              <div className="space-y-2.5">
                <div className="relative">
                  <FaSearch className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-400" />
                  <input
                    type="text"
                    value={searchText}
                    onChange={(e) => setSearchText(e.target.value)}
                    placeholder="ຄົ້ນຫາເລກບິນ, ລະຫັດ ຫຼື ຊື່ລູກຄ້າ..."
                    className={`${CONTROL} h-9 w-full pl-8 pr-8 text-sm`}
                  />
                  {searchingIcTrans && (
                    <FaSpinner className="absolute right-2.5 top-1/2 -translate-y-1/2 animate-spin text-xs text-teal-500" />
                  )}
                </div>
                <div className="flex items-center justify-between gap-2">
                  <p className="flex items-center gap-1.5 text-[11px] font-medium text-slate-400 dark:text-slate-500">
                    ສະແດງສະເພາະບິນທີ່ກົງກັບວັນຈັດສົ່ງ ແລະ ຮອບທີ່ເລືອກ
                    {refreshingPool && <FaSpinner className="animate-spin text-teal-500" size={10} />}
                  </p>
                  <button
                    type="button"
                    onClick={() => void refreshAvailableBills(dateLog)}
                    disabled={refreshingPool}
                    title="ໂຫຼດລາຍການບິນຄືນໃໝ່"
                    className="inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-md border border-slate-200 bg-white/60 px-2.5 py-1.5 text-[11px] font-semibold text-slate-600 transition-colors hover:bg-white disabled:opacity-50 dark:border-white/10 dark:bg-white/5 dark:text-slate-300 dark:hover:bg-white/10"
                  >
                    <FaSyncAlt className={refreshingPool ? "animate-spin" : ""} size={10} />
                    ໂຫຼດຄືນ
                  </button>
                  {availableColumnBills.length > 0 && (
                    <button
                      type="button"
                      onClick={handleAddAll}
                      disabled={addingAll}
                      className="inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-md bg-teal-600 px-2.5 py-1.5 text-[11px] font-bold text-white transition-colors hover:bg-teal-700 active:scale-95 disabled:opacity-50"
                    >
                      {addingAll ? <FaSpinner className="animate-spin" size={10} /> : <FaPlus size={10} />}
                      ເພີ່ມທັງໝົດ ({availableColumnBills.length})
                    </button>
                  )}
                </div>
              </div>
            }
          >
            {availableColumnBills.length === 0 ? (
              <EmptyState
                icon={<FaBoxOpen className="text-3xl" />}
                title="ບໍ່ມີບິນ"
                sub={availableEmptyText}
              />
            ) : (
              <div className="space-y-2">
                {availableColumnBills.map((bill) => (
                  <AvailableCard
                    key={bill.doc_no}
                    bill={bill}
                    dragging={draggedBillNo === bill.doc_no}
                    onDragStart={(e) => {
                      setDraggedBillNo(bill.doc_no);
                      e.dataTransfer.setData("text/plain", bill.doc_no);
                      e.dataTransfer.effectAllowed = "move";
                    }}
                    onDragEnd={() => {
                      setDraggedBillNo(null);
                      setDragOverColumn(null);
                    }}
                    onAdd={() => void handleAddBillFull(bill.doc_no)}
                    loading={loadingBillNo === bill.doc_no}
                    expanded={expandedAvailable.has(bill.doc_no)}
                    onToggleExpand={() => toggleAvailablePreview(bill.doc_no)}
                    products={billProductsByNo[bill.doc_no]}
                    entryFor={(product) => previewEntry(bill.doc_no, product)}
                    onToggleItem={(product) => togglePreviewItem(bill.doc_no, product)}
                    onToggleAll={(checked) => togglePreviewAll(bill.doc_no, checked)}
                    onQtyChange={(product, value) => setPreviewQty(bill.doc_no, product, value)}
                    onQtyCommit={(product) => commitPreviewQty(bill.doc_no, product)}
                    onAddSelected={() => handleAddSelectedItems(bill.doc_no)}
                  />
                ))}
              </div>
            )}
          </KanbanColumn>

          {/* Added column */}
          <KanbanColumn
            tone="teal"
            title="ໃນຖ້ຽວນີ້"
            count={totalAddedBills}
            highlighted={dragOverColumn === "added"}
            onDragOver={(e) => {
              if (draggedBillNo && !addedByBill[draggedBillNo]) {
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                setDragOverColumn("added");
              }
            }}
            onDragLeave={() => setDragOverColumn(null)}
            onDrop={(e) => {
              e.preventDefault();
              const billNo = e.dataTransfer.getData("text/plain");
              if (billNo && !addedByBill[billNo]) {
                void handleAddBillFull(billNo);
              }
              setDragOverColumn(null);
            }}
            header={
              <div className="flex items-center gap-3 text-[11px]">
                <span className="inline-flex items-center gap-1.5 rounded-md border border-teal-200 bg-teal-50 px-2 py-0.5 text-[11px] font-bold text-teal-700 dark:border-teal-800 dark:bg-teal-950/40 dark:text-teal-300">
                  {totalAddedItems} ລາຍການ
                </span>
                {totalAddedBills > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setAddedByBill({});
                      setExpandedInJob(null);
                    }}
                    className="ml-auto inline-flex cursor-pointer items-center gap-1 rounded-md px-2 py-1 text-[11px] font-bold text-rose-500 transition-colors hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/30 active:scale-95"
                  >
                    <FaTrash size={9} /> ລ້າງທັງໝົດ
                  </button>
                )}
              </div>
            }
          >
            {totalAddedBills === 0 ? (
              <DropHint highlighted={dragOverColumn === "added"} />
            ) : (
              <div className="space-y-2">
                {addedColumnEntries.map(([billNo, group]) => (
                  <InJobCard
                    key={billNo}
                    billNo={billNo}
                    group={group}
                    expanded={expandedInJob === billNo}
                    setExpanded={() =>
                      setExpandedInJob(expandedInJob === billNo ? null : billNo)
                    }
                    products={billProductsByNo[billNo]}
                    warehouseItems={warehouseItemsByNo[billNo]}
                    loading={loadingBillNo === billNo}
                    ensureProducts={() => void ensureBillProducts(billNo)}
                    dragging={draggedBillNo === billNo}
                    onDragStart={(e) => {
                      setDraggedBillNo(billNo);
                      e.dataTransfer.setData("text/plain", billNo);
                      e.dataTransfer.effectAllowed = "move";
                    }}
                    onDragEnd={() => {
                      setDraggedBillNo(null);
                      setDragOverColumn(null);
                    }}
                    onRemoveBill={() => handleRemoveBill(billNo)}
                    toggleAddedItem={toggleAddedItem}
                    forwardableBranches={forwardableBranches}
                    transportBranches={transportBranches}
                    onSetForwardCode={(code) => setBillForwardCode(billNo, code)}
                    onSetPickupCode={(code) => setBillPickupCode(billNo, code)}
                    onSetDeliveryCondition={(code) => setBillDeliveryCondition(billNo, code)}
                    onSelectByWarehouse={(whCode) => selectItemsByWarehouse(billNo, whCode)}
                    onSplitByBranch={() => setSplitBillNo(billNo)}
                    qtyDrafts={qtyDrafts}
                    setQtyDrafts={setQtyDrafts}
                    commitItemQty={commitItemQty}
                  />
                ))}
              </div>
            )}
          </KanbanColumn>
        </div>
      </div>

      {splitBillNo && (
        <SplitBillByBranch
          billNo={splitBillNo}
          onClose={() => setSplitBillNo(null)}
        />
      )}
    </div>
  );
}
/* ============================== Kanban Column ============================== */

function KanbanColumn({
  tone,
  title,
  count,
  highlighted,
  header,
  children,
  onDragOver,
  onDragLeave,
  onDrop,
}: {
  tone: "slate" | "teal";
  title: string;
  count: number;
  highlighted?: boolean;
  header?: React.ReactNode;
  children: React.ReactNode;
  onDragOver?: React.DragEventHandler<HTMLDivElement>;
  onDragLeave?: React.DragEventHandler<HTMLDivElement>;
  onDrop?: React.DragEventHandler<HTMLDivElement>;
}) {
  const isTeal = tone === "teal";
  const surface = isTeal
    ? "border-teal-300 dark:border-teal-800"
    : "border-slate-200 dark:border-slate-800";
  const headerBar = isTeal
    ? "border-teal-200 bg-teal-50 dark:border-teal-900 dark:bg-teal-950/30"
    : "border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-800/40";
  const titleColor = isTeal
    ? "text-teal-700 dark:text-teal-300"
    : "text-slate-700 dark:text-slate-200";

  return (
    <div
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className={`flex flex-col rounded-lg border bg-white dark:bg-slate-900 ${surface} ${
        highlighted ? "ring-2 ring-teal-500 ring-offset-1 dark:ring-offset-slate-950" : ""
      }`}
    >
      <div className={`flex items-center justify-between gap-3 rounded-t-lg border-b px-3 py-2 ${headerBar}`}>
        <div className="flex items-center gap-2">
          <h2 className={`text-sm font-bold ${titleColor}`}>{title}</h2>
          <span className="rounded bg-slate-200 px-1.5 py-0.5 text-[11px] font-bold text-slate-700 dark:bg-slate-700 dark:text-slate-200">
            {count}
          </span>
        </div>
      </div>
      {header && (
        <div className="border-b border-slate-200 px-3 py-2.5 dark:border-slate-800">
          {header}
        </div>
      )}
      <div className="p-2.5 lg:max-h-[calc(100vh-210px)] lg:overflow-y-auto">
        {children}
      </div>
    </div>
  );
}

/* ============================== Cards ============================== */

function AvailableCard({
  bill,
  dragging,
  onDragStart,
  onDragEnd,
  onAdd,
  loading,
  expanded,
  onToggleExpand,
  products,
  entryFor,
  onToggleItem,
  onToggleAll,
  onQtyChange,
  onQtyCommit,
  onAddSelected,
}: {
  bill: AvailableBill;
  dragging: boolean;
  onDragStart: React.DragEventHandler<HTMLDivElement>;
  onDragEnd: React.DragEventHandler<HTMLDivElement>;
  onAdd: () => void;
  loading: boolean;
  expanded: boolean;
  onToggleExpand: () => void;
  products: Product[] | undefined;
  entryFor: (product: Product) => { checked: boolean; qty: string };
  onToggleItem: (product: Product) => void;
  onToggleAll: (checked: boolean) => void;
  onQtyChange: (product: Product, value: string) => void;
  onQtyCommit: (product: Product) => void;
  onAddSelected: () => void;
}) {
  const list = products ?? [];
  const checkedCount = list.filter((p) => entryFor(p).checked).length;
  const allChecked = list.length > 0 && checkedCount === list.length;
  const remainingTotal = list.reduce((sum, p) => sum + Number(p.qty ?? 0), 0);

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className={`group rounded-md border border-slate-200 bg-white transition-colors hover:border-teal-300 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-teal-800 ${
        dragging ? "opacity-40" : ""
      } ${expanded ? "border-teal-300 dark:border-teal-800" : ""}`}
    >
      <div
        onClick={onToggleExpand}
        className="flex cursor-pointer items-center gap-2.5 px-2.5 py-2 hover:bg-teal-50/40 active:cursor-grabbing dark:hover:bg-teal-950/20"
        title="ກົດເພື່ອເບິ່ງ / ເລືອກລາຍການສິນຄ້າ"
      >
      <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded border border-slate-200 bg-slate-100 text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400">
        {expanded ? <FaChevronDown size={11} /> : <FaBoxOpen size={12} />}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-bold text-slate-900 dark:text-slate-100">
            {bill.doc_no}
          </p>
          <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
            {bill.count_item} ລາຍການ
          </span>
        </div>
        <p className="mt-0.5 truncate text-[11px] text-slate-500 dark:text-slate-400">
          {bill.cust_name || bill.cust_code} · {bill.doc_date}
        </p>
        {(bill.origin_transport_name || bill.origin_transport_code) && (
          <p
            className="mt-0.5 truncate text-[10px] text-slate-500 dark:text-slate-400"
            title={`ສາງຮັບເຄື່ອງ: ${bill.origin_transport_name || bill.origin_transport_code}`}
          >
            🏬 ຮັບເຄື່ອງ: <span className="font-semibold text-slate-700 dark:text-slate-200">{bill.origin_transport_name || bill.origin_transport_code}</span>
          </p>
        )}
        {(bill.scheduled_date_display || bill.delivery_round_name) && (
          <div className="mt-1 flex flex-wrap items-center gap-1">
            {bill.scheduled_date_display && (
              <span className="inline-flex items-center gap-1 rounded border border-sky-200 bg-sky-50 px-1.5 py-0.5 text-[10px] font-bold text-sky-700 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-300">
                📅 {bill.scheduled_date_display}
              </span>
            )}
            {bill.delivery_round_name && (
              <span
                className="inline-flex items-center gap-1 rounded border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[10px] font-bold text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300"
                title={bill.delivery_round_time_label || ""}
              >
                🕐 {bill.delivery_round_name}
              </span>
            )}
          </div>
        )}
        {bill.incoming_forwarded && (
          <div className="mt-1 flex flex-wrap items-center gap-1">
            <span
              className="inline-flex items-center gap-1 rounded border border-sky-200 bg-sky-50 px-1.5 py-0.5 text-[10px] font-bold text-sky-700 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-300"
              title={bill.forwarded_at ? `Forwarded ${bill.forwarded_at}` : ""}
            >
              <FaArrowRight size={8} />
              Forwarder ຈາກ {bill.forward_from_transport_name || bill.forward_from_transport_code || "ສາຂາອື່ນ"}
            </span>
          </div>
        )}
      </div>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onAdd();
        }}
        disabled={loading}
        className="flex h-7 w-7 flex-shrink-0 cursor-pointer items-center justify-center rounded bg-teal-600 text-white transition-colors hover:bg-teal-700 active:scale-95 disabled:opacity-50"
        title="ເພີ່ມທັງບິນເຂົ້າຖ້ຽວ"
      >
        {loading ? <FaSpinner className="animate-spin" size={11} /> : <FaPlus size={11} />}
      </button>
      </div>

      {/* Item picker — quantities are what is still owed to the customer */}
      {expanded && (
        <div
          className="border-t border-slate-200 px-2.5 py-2 dark:border-slate-800"
          onClick={(e) => e.stopPropagation()}
        >
          {loading && list.length === 0 ? (
            <p className="flex items-center gap-2 py-2 text-[11px] text-slate-500">
              <FaSpinner className="animate-spin" size={10} /> ກຳລັງໂຫຼດລາຍການສິນຄ້າ...
            </p>
          ) : list.length === 0 ? (
            <p className="py-2 text-[11px] text-slate-500">ບໍ່ມີສິນຄ້າຄົງເຫຼືອທີ່ຕ້ອງສົ່ງ</p>
          ) : (
            <>
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => onToggleAll(!allChecked)}
                  className="inline-flex items-center gap-1.5 text-[11px] font-bold text-slate-600 dark:text-slate-300"
                >
                  <span
                    className={`flex h-4 w-4 items-center justify-center rounded transition-colors ${
                      allChecked
                        ? "bg-teal-600 text-white"
                        : "border border-slate-300 bg-white dark:border-slate-700 dark:bg-slate-900"
                    }`}
                  >
                    {allChecked && <FaCheck size={8} />}
                  </span>
                  ເລືອກທັງໝົດ
                </button>
                <span className="text-[10px] font-semibold text-slate-400">
                  ຄົງເຫຼືອທີ່ຕ້ອງສົ່ງ · ລວມ {remainingTotal}
                </span>
              </div>

              <div className="space-y-1">
                {list.map((p) => {
                  const entry = entryFor(p);
                  return (
                    <div
                      key={p.item_code}
                      className={`flex items-center gap-2 rounded border px-2 py-1.5 ${
                        entry.checked
                          ? "border-teal-200 bg-teal-50/60 dark:border-teal-900 dark:bg-teal-950/20"
                          : "border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => onToggleItem(p)}
                        className={`flex h-5 w-5 flex-shrink-0 cursor-pointer items-center justify-center rounded transition-colors active:scale-95 ${
                          entry.checked
                            ? "bg-teal-600 text-white"
                            : "border border-slate-300 bg-white hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800"
                        }`}
                        title={entry.checked ? "ບໍ່ສົ່ງລາຍການນີ້" : "ເລືອກສົ່ງລາຍການນີ້"}
                      >
                        {entry.checked && <FaCheck size={9} />}
                      </button>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[11px] font-bold text-slate-800 dark:text-slate-100">
                          {p.item_name}
                        </p>
                        <p className="truncate font-mono text-[10px] text-slate-400">
                          {p.item_code} · ຄົງເຫຼືອ {p.qty} {p.unit_code}
                        </p>
                      </div>
                      <input
                        type="number"
                        min={1}
                        max={p.qty}
                        value={entry.qty}
                        disabled={!entry.checked}
                        onChange={(e) => onQtyChange(p, e.target.value)}
                        onBlur={() => onQtyCommit(p)}
                        className="h-7 w-16 flex-shrink-0 rounded border border-slate-300 bg-white px-1.5 text-center text-[11px] font-bold text-slate-800 disabled:opacity-40 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                        title={`ສູງສຸດ ${p.qty}`}
                      />
                      <span className="w-10 shrink-0 truncate text-[10px] text-slate-400">
                        {p.unit_code}
                      </span>
                    </div>
                  );
                })}
              </div>

              <button
                type="button"
                onClick={onAddSelected}
                disabled={checkedCount === 0}
                className="mt-2 inline-flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-md bg-teal-600 px-2.5 py-1.5 text-[11px] font-bold text-white transition-colors hover:bg-teal-700 active:scale-95 disabled:opacity-40"
              >
                <FaPlus size={10} />
                ເພີ່ມທີ່ເລືອກ ({checkedCount}/{list.length})
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function InJobCard({
  billNo,
  group,
  expanded,
  setExpanded,
  products,
  warehouseItems,
  loading,
  ensureProducts,
  dragging,
  onDragStart,
  onDragEnd,
  onRemoveBill,
  toggleAddedItem,
  forwardableBranches,
  transportBranches,
  onSetForwardCode,
  onSetPickupCode,
  onSetDeliveryCondition,
  onSelectByWarehouse,
  onSplitByBranch,
  qtyDrafts,
  setQtyDrafts,
  commitItemQty,
}: {
  billNo: string;
  group: AddedBillGroup;
  expanded: boolean;
  setExpanded: () => void;
  products: Product[] | undefined;
  warehouseItems: WarehouseItem[] | undefined;
  loading: boolean;
  ensureProducts: () => void;
  dragging: boolean;
  onDragStart: React.DragEventHandler<HTMLDivElement>;
  onDragEnd: React.DragEventHandler<HTMLDivElement>;
  onRemoveBill: () => void;
  toggleAddedItem: (bill: AvailableBill, product: Product) => void;
  forwardableBranches: TransportBranch[];
  transportBranches: TransportBranch[];
  onSetForwardCode: (code: string | null) => void;
  onSetPickupCode: (code: string | null) => void;
  onSetDeliveryCondition: (code: string) => void;
  onSelectByWarehouse: (whCode: string) => void;
  onSplitByBranch: () => void;
  qtyDrafts: Record<string, string>;
  setQtyDrafts: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  commitItemQty: (billNo: string, itemCode: string, maxQty: number) => void;
}) {
  const totalOriginal = group.bill.count_item;
  const addedCount = group.items.length;
  const isPartial = addedCount < totalOriginal;

  const handleToggleExpand = () => {
    if (!expanded && !products) ensureProducts();
    setExpanded();
  };

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className={`overflow-hidden rounded-md border border-teal-300 bg-white dark:border-teal-800 dark:bg-slate-900 ${dragging ? "opacity-40" : ""}`}
    >
      <div className="flex items-center gap-2.5 px-2.5 py-2">
        <div
          className={`flex h-8 w-8 flex-shrink-0 cursor-grab items-center justify-center rounded border ${
            isPartial
              ? "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300"
              : "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300"
          }`}
          title="ລາກໄປຊ້າຍເພື່ອລົບ"
        >
          {isPartial ? <FaBoxOpen size={12} /> : <FaCheck size={12} />}
        </div>
        <button
          type="button"
          onClick={handleToggleExpand}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
        >
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="truncate text-sm font-bold text-slate-900 dark:text-slate-100">
                {billNo}
              </p>
              {isPartial && (
                <span className="rounded border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[10px] font-bold text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
                  ບາງສ່ວນ
                </span>
              )}
            </div>
            <p className="mt-0.5 truncate text-[11px] text-slate-500 dark:text-slate-400">
              {group.bill.cust_name || group.bill.cust_code}
            </p>
            {(group.bill.origin_transport_name || group.bill.origin_transport_code) && (
              <p
                className="mt-0.5 truncate text-[10px] text-slate-500 dark:text-slate-400"
                title={`ສາງຮັບເຄື່ອງ: ${group.bill.origin_transport_name || group.bill.origin_transport_code}`}
              >
                🏬 ຮັບເຄື່ອງ: <span className="font-semibold text-slate-700 dark:text-slate-200">{group.bill.origin_transport_name || group.bill.origin_transport_code}</span>
              </p>
            )}
          </div>
          <span className="rounded border border-teal-200 bg-teal-50 px-2 py-0.5 text-[10px] font-bold text-teal-700 dark:border-teal-800 dark:bg-teal-950/40 dark:text-teal-300">
            {addedCount}/{totalOriginal}
          </span>
          <FaChevronDown
            className={`text-xs text-slate-400 transition-transform ${expanded ? "rotate-180" : ""}`}
          />
        </button>
        <button
          type="button"
          onClick={onRemoveBill}
          className="flex h-7 w-7 flex-shrink-0 cursor-pointer items-center justify-center rounded text-rose-500 transition-colors hover:bg-rose-50 dark:hover:bg-rose-950/30"
          title="ລົບ"
        >
          <FaTimes size={12} />
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-1.5 border-t border-slate-200 bg-slate-50 px-2.5 py-2 dark:border-slate-800 dark:bg-slate-800/30">
        <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400">
          🏬 ຮັບເຄື່ອງ:
        </span>
        <select
          value={group.pickup_transport_code ?? ""}
          onChange={(e) => onSetPickupCode(e.target.value === "" ? null : e.target.value)}
          className={`${CONTROL} h-7 px-2 text-[11px] font-medium`}
          title="ຈຸດທີ່ຄົນຂັບໄປຮັບສິນຄ້າຂອງບິນນີ້"
        >
          <option value="">
            ຄ່າເລີ່ມຕົ້ນ ({group.bill.origin_transport_name || group.bill.origin_transport_code || "ສາງຂອງບິນ"})
          </option>
          {transportBranches.map((b) => (
            <option key={b.code} value={b.code}>
              ສາງ {b.name_1}
            </option>
          ))}
          <option value={PICKUP_AT_CUSTOMER}>🏠 ບ້ານ/ຮ້ານລູກຄ້າ</option>
        </select>
      </div>

      <div className="flex flex-wrap items-center gap-1.5 border-t border-slate-200 bg-slate-50 px-2.5 py-2 dark:border-slate-800 dark:bg-slate-800/30">
        <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400">
          ປາຍທາງ: <span className="text-rose-500">*</span>
        </span>
        {DELIVERY_CONDITIONS.map((c) => {
          const active = group.delivery_condition === c.code;
          let btnClass = "";
          if (c.code === "to_customer") {
            btnClass = active
              ? "border border-sky-600 bg-sky-600 text-white"
              : "border border-sky-200 bg-sky-50 text-sky-700 hover:bg-sky-100 dark:border-sky-900 dark:bg-sky-950/30 dark:text-sky-300 dark:hover:bg-sky-950/50";
          } else if (c.code === "to_branch") {
            btnClass = active
              ? "border border-emerald-600 bg-emerald-600 text-white"
              : "border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300 dark:hover:bg-emerald-950/50";
          } else if (c.code === "to_carrier") {
            btnClass = active
              ? "border border-indigo-600 bg-indigo-600 text-white"
              : "border border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 dark:border-indigo-900 dark:bg-indigo-950/30 dark:text-indigo-300 dark:hover:bg-indigo-950/50";
          } else {
            // to_bus
            btnClass = active
              ? "border border-violet-600 bg-violet-600 text-white"
              : "border border-violet-200 bg-violet-50 text-violet-700 hover:bg-violet-100 dark:border-violet-900 dark:bg-violet-950/30 dark:text-violet-300 dark:hover:bg-violet-950/50";
          }
          return (
            <button
              key={c.code}
              type="button"
              onClick={() => onSetDeliveryCondition(c.code)}
              className={`cursor-pointer rounded px-2.5 py-1 text-[11px] font-bold transition-colors active:scale-95 ${btnClass}`}
            >
              {c.label}
            </button>
          );
        })}
        {group.delivery_condition === "to_branch" && (
          <select
            value={group.forward_transport_code ?? ""}
            onChange={(e) => onSetForwardCode(e.target.value || null)}
            className={`${CONTROL} h-7 px-2 text-[11px] font-medium`}
          >
            <option value="">- ເລືອກສາຂາ -</option>
            {forwardableBranches.map((b) => (
              <option key={b.code} value={b.code}>
                {b.name_1} ({b.code})
              </option>
            ))}
          </select>
        )}
        {!group.delivery_condition && (
          <span className="text-[11px] font-semibold text-rose-500">ກະລຸນາເລືອກ</span>
        )}
      </div>

      {expanded && (
        <div className="border-t border-slate-200 bg-slate-50 px-2.5 py-2.5 dark:border-slate-800 dark:bg-slate-800/20">
          {loading || !products ? (
            <div className="flex items-center justify-center gap-2 py-5 text-xs text-slate-500">
              <FaSpinner className="animate-spin text-teal-500" size={11} /> ກຳລັງໂຫຼດ...
            </div>
          ) : products.length === 0 ? (
            <p className="py-3 text-center text-xs text-slate-500">ບໍ່ມີສິນຄ້າ</p>
          ) : (() => {
            // Build warehouse → item codes map for grouping UI
            const whGroups = new Map<string, { wh_name: string; itemCodes: Set<string> }>();
            if (warehouseItems) {
              for (const w of warehouseItems) {
                if (!whGroups.has(w.wh_code)) {
                  whGroups.set(w.wh_code, { wh_name: w.wh_name, itemCodes: new Set() });
                }
                whGroups.get(w.wh_code)!.itemCodes.add(w.item_code);
              }
            }
            // item_code → first warehouse name (for badge display)
            const itemWhName = new Map<string, string>();
            for (const [, g] of whGroups) {
              for (const ic of g.itemCodes) {
                if (!itemWhName.has(ic)) itemWhName.set(ic, g.wh_name);
              }
            }
            const multiWarehouse = whGroups.size > 1;
            return (
              <div className="space-y-1.5">
                {multiWarehouse && (
                  <div className="mb-2 rounded border border-amber-200 bg-amber-50 px-2.5 py-2 dark:border-amber-900 dark:bg-amber-950/30">
                    <p className="mb-1.5 text-[10px] font-bold text-amber-700 dark:text-amber-300">
                      ⚠ ໃບນີ້ມີສິນຄ້າຈາກ {whGroups.size} ສາງ — ຄວນຈັດຄົນລະຖ້ຽວ
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {Array.from(whGroups.entries()).map(([whCode, g]) => (
                        <button
                          key={whCode}
                          type="button"
                          onClick={() => onSelectByWarehouse(whCode)}
                          className="rounded border border-amber-300 bg-white px-2 py-0.5 text-[10px] font-bold text-amber-800 transition-colors hover:bg-amber-100 active:scale-95 dark:border-amber-800 dark:bg-slate-900 dark:text-amber-300 dark:hover:bg-amber-950/40"
                          title={`ເລືອກສະເພາະ ສາງ ${g.wh_name} (${g.itemCodes.size} ລາຍການ)`}
                        >
                          🏭 {g.wh_name} ({g.itemCodes.size})
                        </button>
                      ))}
                    </div>
                    {/* Fan the whole bill out to a queue per branch in one step
                        (each warehouse's items → its delivery branch). */}
                    <button
                      type="button"
                      onClick={onSplitByBranch}
                      className="mt-2 inline-flex items-center gap-1 rounded border border-emerald-300 bg-emerald-50 px-2 py-1 text-[10px] font-bold text-emerald-800 transition-colors hover:bg-emerald-100 active:scale-95 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300 dark:hover:bg-emerald-950/50"
                      title="ແຍກບິນນີ້ໄປແຕ່ລະສາຂາ ແລ້ວຈັດຄິວຈັດຖ້ຽວອັດຕະໂນມັດ"
                    >
                      ⇄ ຈັດຖ້ຽວທີ່ເຫຼືອຕາມສາຂາ
                    </button>
                  </div>
                )}
                {products.map((p) => {
                  const added = group.items.find((i) => i.item_code === p.item_code);
                  const isAdded = !!added;
                  const draftKey = `${billNo}::${p.item_code}`;
                  const qtyValue = qtyDrafts[draftKey] ?? String(added?.selectedQty ?? p.qty);
                  const whName = itemWhName.get(p.item_code);
                  return (
                    <div
                      key={p.item_code}
                      className={`flex items-center gap-2 rounded border px-2.5 py-1.5 ${
                        isAdded
                          ? "border-teal-200 bg-teal-50/60 dark:border-teal-900 dark:bg-teal-950/20"
                          : "border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => toggleAddedItem(group.bill, p)}
                        className={`flex h-5 w-5 flex-shrink-0 cursor-pointer items-center justify-center rounded transition-colors active:scale-95 ${
                          isAdded
                            ? "bg-teal-600 text-white"
                            : "border border-slate-300 bg-white hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800"
                        }`}
                      >
                        {isAdded && <FaCheck size={9} />}
                      </button>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[11px] font-bold text-slate-800 dark:text-slate-100">
                          {p.item_name}
                        </p>
                        <div className="flex items-center gap-1.5">
                          <p className="truncate font-mono text-[10px] text-slate-400">
                            {p.item_code}
                          </p>
                          {whName && multiWarehouse && (
                            <span className="rounded bg-slate-200 px-1 py-0 text-[9px] font-bold text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                              {whName}
                            </span>
                          )}
                        </div>
                      </div>
                      {isAdded ? (
                        <input
                          type="number"
                          min={1}
                          max={p.qty}
                          value={qtyValue}
                          onChange={(e) =>
                            setQtyDrafts((prev) => ({
                              ...prev,
                              [draftKey]: e.target.value,
                            }))
                          }
                          onBlur={() => commitItemQty(billNo, p.item_code, p.qty)}
                          className="h-7 w-14 rounded border border-teal-400 bg-white px-1.5 text-center text-[11px] font-bold text-teal-700 outline-none focus:ring-1 focus:ring-teal-500/40 dark:border-teal-700 dark:bg-slate-900 dark:text-teal-300"
                        />
                      ) : (
                        <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400">{p.qty}</span>
                      )}
                      <span className="w-12 truncate text-[10px] text-slate-400">
                        / {p.qty} {p.unit_code}
                      </span>
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
}

function DropHint({ highlighted }: { highlighted?: boolean }) {
  return (
    <div
      className={`flex flex-col items-center justify-center gap-3 rounded-md border-2 border-dashed py-12 transition-colors ${
        highlighted
          ? "border-teal-500 bg-teal-50 dark:border-teal-600 dark:bg-teal-950/20"
          : "border-slate-300 bg-slate-50 dark:border-slate-700 dark:bg-slate-900/40"
      }`}
    >
      <div className={`flex h-11 w-11 items-center justify-center rounded-md border ${
        highlighted
          ? "border-teal-300 bg-white dark:border-teal-700 dark:bg-slate-900"
          : "border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900"
      }`}>
        <FaArrowRight className={`text-sm ${highlighted ? "text-teal-600" : "text-slate-400"}`} />
      </div>
      <p className={`text-sm font-bold ${highlighted ? "text-teal-600 dark:text-teal-400" : "text-slate-600 dark:text-slate-300"}`}>
        ລາກບິນມາວາງທີ່ນີ້
      </p>
      <p className="text-[11px] font-medium text-slate-400 dark:text-slate-500">ຫຼື ກົດ + ຢູ່ບິນດ້ານຊ້າຍ</p>
    </div>
  );
}
/* ============================== Job Info Strip ============================== */

function JobInfoStrip(props: {
  isBranchAdmin: boolean;
  selectedBranch: string;
  onBranchChange: (code: string) => void;
  branchOptions: TransportBranch[];
  docDate: string;
  setDocDate: (v: string) => void;
  dateLog: string;
  setDateLog: (v: string) => void;
  deliveryRouteCode: string;
  setDeliveryRouteCode: (v: string) => void;
  filteredRoutes: Option[];
  routeSearch: string;
  setRouteSearch: (v: string) => void;
  showRouteDrop: boolean;
  setShowRouteDrop: (v: boolean) => void;
  routeRef: React.RefObject<HTMLDivElement | null>;
  deliveryRoundCode: string;
  setDeliveryRoundCode: (v: string) => void;
  deliveryRounds: Array<{ code: string; name: string; time_label?: string }>;
  roundBillCounts: Record<string, number>;
  car: string;
  setCar: (v: string) => void;
  filteredCars: Option[];
  carSearch: string;
  setCarSearch: (v: string) => void;
  showCarDrop: boolean;
  setShowCarDrop: (v: boolean) => void;
  carRef: React.RefObject<HTMLDivElement | null>;
  driver: string;
  setDriver: (v: string) => void;
  filteredDrivers: Option[];
  driverSearch: string;
  setDriverSearch: (v: string) => void;
  showDriverDrop: boolean;
  setShowDriverDrop: (v: boolean) => void;
  driverRef: React.RefObject<HTMLDivElement | null>;
  workers: Option[];
  filteredWorkers: Option[];
  workerSearch: string;
  setWorkerSearch: (v: string) => void;
  showWorkerDrop: boolean;
  setShowWorkerDrop: (v: boolean) => void;
  workerRef: React.RefObject<HTMLDivElement | null>;
  selectedWorkers: string[];
  setSelectedWorkers: React.Dispatch<React.SetStateAction<string[]>>;
}) {
  return (
    <section className="overflow-visible rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
      <div className="border-b border-slate-200 px-3 py-2.5 dark:border-slate-800">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-teal-600 dark:text-teal-400">
          ຕັ້ງຄ່າການຈັດສົ່ງ
        </p>
        <h2 className="text-sm font-bold text-slate-800 dark:text-white">ຂໍ້ມູນຖ້ຽວຈັດສົ່ງ</h2>
        <p className="mt-0.5 text-[11px] text-slate-400 dark:text-slate-500">ເລືອກໃຫ້ຄົບເພື່ອດຶງບິນຕາມແຜນ</p>
      </div>

      <div className="divide-y divide-slate-200 dark:divide-slate-800">
        <InfoGroup title="ແຜນສົ່ງ" icon={<FaCalendarAlt size={12} />}>
          <Field label="ສາຂາຂົນສົ່ງ" required icon={<FaTruck size={10} />}>
            {props.isBranchAdmin ? (
              <div className="flex h-10 w-full items-center rounded-md border border-slate-200 bg-slate-50 px-3 text-sm font-semibold text-slate-700 dark:border-slate-800 dark:bg-slate-800/40 dark:text-slate-200">
                {props.branchOptions.find((b) => b.code === props.selectedBranch)?.name_1 ||
                  props.selectedBranch ||
                  "-"}
              </div>
            ) : (
              <select
                value={props.selectedBranch}
                onChange={(e) => props.onBranchChange(e.target.value)}
                className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-800 outline-none transition-colors focus:border-teal-500 focus:ring-1 focus:ring-teal-500/30 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              >
                <option value="">- ເລືອກສາຂາ -</option>
                {props.branchOptions.map((b) => (
                  <option key={b.code} value={b.code}>
                    {b.name_1 || b.code}
                  </option>
                ))}
              </select>
            )}
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="ວັນທີເອກະສານ" icon={<FaCalendarAlt size={10} />}>
              <input
                type="date"
                value={props.docDate}
                min={FIXED_YEAR_START}
                max={FIXED_YEAR_END}
                onChange={(e) => props.setDocDate(e.target.value)}
                className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-800 outline-none transition-colors focus:border-teal-500 focus:ring-1 focus:ring-teal-500/30 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              />
            </Field>
            <Field label="ວັນທີຈັດສົ່ງ" required icon={<FaCalendarAlt size={10} />}>
              <input
                type="date"
                value={props.dateLog}
                min={FIXED_YEAR_START}
                max={FIXED_YEAR_END}
                onChange={(e) => props.setDateLog(e.target.value)}
                className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-800 outline-none transition-colors focus:border-teal-500 focus:ring-1 focus:ring-teal-500/30 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              />
            </Field>
          </div>
          <Field label="ເສັ້ນທາງ" required icon={<FaRoute size={10} />}>
            <SearchDropdown
              refEl={props.routeRef}
              show={props.showRouteDrop}
              setShow={props.setShowRouteDrop}
              search={props.routeSearch}
              setSearch={(v) => {
                props.setRouteSearch(v);
                props.setDeliveryRouteCode("");
              }}
              items={props.filteredRoutes}
              value={props.deliveryRouteCode}
              onSelect={(code, name) => {
                props.setDeliveryRouteCode(code);
                props.setRouteSearch(name);
              }}
              placeholder="ຄົ້ນຫາເສັ້ນທາງ..."
              icon={<FaRoute className="text-xs" />}
              compact
            />
          </Field>
          <Field label="ຮອບການຈັດສົ່ງ" icon={<FaClock size={10} />}>
            <select
              value={props.deliveryRoundCode}
              onChange={(e) => props.setDeliveryRoundCode(e.target.value)}
              className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-800 outline-none transition-colors focus:border-teal-500 focus:ring-1 focus:ring-teal-500/30 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            >
              <option value="">- ບໍ່ກຳນົດ -</option>
              {props.deliveryRounds.map((r) => {
                const n = props.roundBillCounts[r.code] ?? 0;
                return (
                  <option key={r.code} value={r.code}>
                    {r.name}
                    {r.time_label ? ` (${r.time_label})` : ""}
                    {n > 0 ? ` · ${n} ບິນ` : ""}
                  </option>
                );
              })}
            </select>
          </Field>
        </InfoGroup>

        <InfoGroup title="ພາຫະນະ" icon={<FaTruck size={12} />}>
          <Field label="ລົດ" required icon={<FaTruck size={10} />}>
            <SearchDropdown
              refEl={props.carRef}
              show={props.showCarDrop}
              setShow={props.setShowCarDrop}
              search={props.carSearch}
              setSearch={(v) => {
                props.setCarSearch(v);
                props.setCar("");
              }}
              items={props.filteredCars}
              value={props.car}
              onSelect={(code, name) => {
                props.setCar(code);
                props.setCarSearch(name);
              }}
              placeholder="ຄົ້ນຫາລົດ..."
              icon={<FaTruck className="text-xs" />}
              compact
            />
          </Field>

          <Field label="ຄົນຂັບ" required icon={<FaUser size={10} />}>
            <SearchDropdown
              refEl={props.driverRef}
              show={props.showDriverDrop}
              setShow={props.setShowDriverDrop}
              search={props.driverSearch}
              setSearch={(v) => {
                props.setDriverSearch(v);
                props.setDriver("");
              }}
              items={props.filteredDrivers}
              value={props.driver}
              onSelect={(code, name) => {
                props.setDriver(code);
                props.setDriverSearch(name);
              }}
              placeholder="ຄົ້ນຫາຄົນຂັບ..."
              icon={<FaUser className="text-xs" />}
              compact
            />
          </Field>
        </InfoGroup>

        <InfoGroup title="ທີມງານ" icon={<FaUsers size={12} />}>
          <Field label="ກຳມະກອນ" icon={<FaUsers size={10} />}>
            <SearchDropdown
              refEl={props.workerRef}
              show={props.showWorkerDrop}
              setShow={props.setShowWorkerDrop}
              search={props.workerSearch}
              setSearch={props.setWorkerSearch}
              items={props.filteredWorkers}
              value=""
              onSelect={(code) => {
                props.setSelectedWorkers((cur) => [...cur, code]);
                props.setWorkerSearch("");
                props.setShowWorkerDrop(true);
              }}
              placeholder="ເລືອກກຳມະກອນ..."
              icon={<FaUsers className="text-xs" />}
              compact
            />
          </Field>

          <div className="min-h-[56px] rounded-md border border-dashed border-slate-300 bg-slate-50 p-2 dark:border-slate-700 dark:bg-slate-900/40">
            {props.selectedWorkers.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {props.selectedWorkers.map((wc) => {
                  const w = props.workers.find((i) => i.code === wc);
                  return (
                    <span
                      key={wc}
                      className="inline-flex items-center gap-1.5 rounded border border-teal-200 bg-teal-50 px-2 py-1 text-[11px] font-semibold text-teal-700 transition-colors hover:bg-teal-100 dark:border-teal-800 dark:bg-teal-950/40 dark:text-teal-300"
                    >
                      {w?.name_1 || wc}
                      <button
                        type="button"
                        onClick={() =>
                          props.setSelectedWorkers((cur) => cur.filter((c) => c !== wc))
                        }
                        className="text-teal-500 hover:text-rose-500 transition-colors cursor-pointer p-0.5"
                      >
                        <FaTimes size={8} />
                      </button>
                    </span>
                  );
                })}
              </div>
            ) : (
              <p className="px-1 py-3 text-center text-[11px] text-slate-400 dark:text-slate-500 italic">
                ຍັງບໍ່ໄດ້ເລືອກກຳມະກອນ
              </p>
            )}
          </div>
        </InfoGroup>
      </div>
    </section>
  );
}
/* ============================== Shared UI ============================== */

function Field({
  label,
  required,
  icon,
  children,
}: {
  label: string;
  required?: boolean;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-1 flex items-center gap-1 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
        {icon}
        {label}
        {required && <span className="text-rose-500">*</span>}
      </label>
      {children}
    </div>
  );
}

function InfoGroup({
  title,
  icon,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="px-3 py-3">
      <div className="mb-2.5 flex items-center gap-2">
        <span className="flex h-6 w-6 items-center justify-center rounded border border-teal-200 bg-teal-50 text-teal-600 dark:border-teal-900 dark:bg-teal-950/40 dark:text-teal-400">
          {icon}
        </span>
        <h3 className="text-xs font-bold uppercase tracking-wide text-slate-600 dark:text-slate-300">{title}</h3>
      </div>
      <div className="space-y-2.5">{children}</div>
    </div>
  );
}

function Chip({
  children,
  ok,
  icon,
}: {
  children: React.ReactNode;
  ok: boolean;
  icon: React.ReactNode;
}) {
  return (
    <span
      className={`inline-flex max-w-[180px] items-center gap-1.5 truncate rounded-md border px-2.5 py-1 text-[11px] font-semibold ${
        ok
          ? "border-teal-200 bg-teal-50 text-teal-700 dark:border-teal-800 dark:bg-teal-950/40 dark:text-teal-300"
          : "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300"
      }`}
    >
      {icon}
      <span className="truncate">{children}</span>
    </span>
  );
}

function EmptyState({
  icon,
  title,
  sub,
}: {
  icon: React.ReactNode;
  title: string;
  sub?: string;
}) {
  return (
    <div className="px-4 py-10 text-center">
      <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-md border border-slate-200 bg-slate-100 text-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-500">
        {icon}
      </div>
      <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">{title}</p>
      {sub && <p className="mx-auto mt-1 max-w-xs text-xs leading-relaxed text-slate-400 dark:text-slate-500">{sub}</p>}
    </div>
  );
}
