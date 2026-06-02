"use client";

import Link from "next/link";
import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
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
  FaTimes,
  FaTrash,
  FaTruck,
  FaUser,
  FaUsers,
} from "react-icons/fa";
import { FIXED_YEAR_END, FIXED_YEAR_START, getFixedTodayDate } from "@/lib/fixed-year";
import { Actions } from "@/lib/api";
import { useSession } from "@/providers/session-provider";

interface Product {
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
}

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
    <div className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500">
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
      className={`${compact ? "h-9 text-xs" : "h-11 text-sm"} w-full rounded-xl border border-slate-200 bg-white pl-9 pr-9 text-slate-800 outline-none transition-all focus:border-teal-400 focus:ring-2 focus:ring-teal-500/20 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100`}
    />
    <button
      type="button"
      onClick={() => setShow(!show)}
      className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-300"
    >
      <FaChevronDown className={`text-xs transition-transform duration-200 ${show ? "rotate-180" : ""}`} />
    </button>
    {show && (
      <div className="absolute z-30 mt-1.5 max-h-56 w-full overflow-y-auto rounded-xl border border-slate-200 bg-white p-1 shadow-lg dark:border-slate-800 dark:bg-slate-950">
        {items.length > 0 ? (
          items.map((item) => (
            <button
              key={item.code}
              type="button"
              onClick={() => {
                onSelect(item.code, item.name_1);
                setShow(false);
              }}
              className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-xs transition-colors ${
                value === item.code
                  ? "bg-teal-50 text-teal-700 dark:bg-teal-950/50 dark:text-teal-300"
                  : "text-slate-700 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-900"
              }`}
            >
              <span className="font-medium truncate">{item.name_1}</span>
              <span className="ml-3 text-[10px] text-slate-400 dark:text-slate-500 font-mono">{item.code}</span>
            </button>
          ))
        ) : (
          <p className="px-3 py-3 text-center text-sm text-slate-400 dark:text-slate-500">ບໍ່ພົບ</p>
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
  const ownBranch = (session?.logistic_code ?? "").trim();

  useEffect(() => {
    void Actions.listDeliveryRoutes(true)
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

  const forwardableBranches = transportBranches.filter((b) => b.code !== ownBranch);

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
    if (selected) setRouteSearch(routeLabel(selected));
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
      const products = (await Actions.getAvailableBillProducts(billNo)) as Product[];
      setBillProductsByNo((current) => ({ ...current, [billNo]: products }));
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
        },
      }));
    } catch (e) {
      console.error(e);
    }
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

  const step1Valid = Boolean(car && driver && docDate && dateLog && deliveryRouteCode && deliveryRoundCode);
  const canSave = step1Valid && totalAddedBills > 0 && Boolean(docNo);

  const validationHints: string[] = [];
  if (!car) validationHints.push("ເລືອກລົດ");
  if (!driver) validationHints.push("ເລືອກຄົນຂັບ");
  if (!deliveryRouteCode) validationHints.push("ເລືອກເສັ້ນທາງ");
  if (!deliveryRoundCode) validationHints.push("ເລືອກຮອບ");
  if (totalAddedBills === 0) validationHints.push("ເພີ່ມບິນ");

  const filteredCars = cars.filter(
    (item) =>
      !deferredCarSearch ||
      item.name_1.toLowerCase().includes(deferredCarSearch.toLowerCase()) ||
      item.code.toLowerCase().includes(deferredCarSearch.toLowerCase())
  );
  const filteredRoutes: Option[] = deliveryRoutes
    .map((r) => ({ code: r.code, name_1: routeLabel(r) }))
    .filter(
      (item) =>
        !deferredRouteSearch ||
        item.name_1.toLowerCase().includes(deferredRouteSearch.toLowerCase()) ||
        item.code.toLowerCase().includes(deferredRouteSearch.toLowerCase())
    );
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
    return availableBills
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
  }, [availableBills, addedByBill, normalizedSearchText, dateLog, deliveryRouteCode, deliveryRoundCode]);

  const availableEmptyText = !dateLog || !deliveryRouteCode || !deliveryRoundCode
    ? "ເລືອກວັນຈັດສົ່ງ, ເສັ້ນທາງ ແລະ ຮອບກ່ອນ"
    : normalizedSearchText
      ? "ລອງຄົ້ນຫາຄຳອື່ນ"
      : "ບໍ່ມີບິນທີ່ກົງກັບວັນ, ເສັ້ນທາງ ແລະ ຮອບນີ້";

  const addedColumnEntries = useMemo(
    () => Object.entries(addedByBill),
    [addedByBill]
  );

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      {/* Top header */}
      <div className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur-xl dark:border-slate-800 dark:bg-slate-950/95">
        <div className="mx-auto flex w-full max-w-[1600px] items-center gap-3 px-4 py-3 sm:px-6">
          <Link
            href="/jobs"
            className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 transition-all hover:border-slate-300 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            <FaArrowLeft className="text-sm" />
          </Link>

          <div className="min-w-0 flex-1">
            <h1 className="truncate text-base font-bold text-slate-950 dark:text-white">
              {isEdit ? "ແກ້ໄຂຖ້ຽວຈັດສົ່ງ" : "ສ້າງຖ້ຽວຈັດສົ່ງ"}
            </h1>
            <p className="truncate text-[11px] text-slate-500 dark:text-slate-400 font-mono">
              {docNo || "..."}
            </p>
          </div>

          <button
            type="button"
            onClick={() => setShowInfoForm((v) => !v)}
            className="hidden items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition-all hover:border-slate-300 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 sm:flex"
          >
            <FaInfoCircle size={11} />
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
            className={`flex flex-shrink-0 items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-all sm:px-5 ${
              canSave
                ? "bg-emerald-600 hover:bg-emerald-500"
                : "bg-slate-300 hover:bg-slate-400 dark:bg-slate-700"
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
          <div className="border-t border-amber-200 bg-amber-50 px-4 py-2 text-[11px] font-semibold text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300 lg:hidden">
            ⚠ ຍັງເຫຼືອ: {validationHints.join(" · ")}
          </div>
        )}
      </div>

      {/* Job info strip */}
      {showInfoForm && (
        <div className="border-b border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <div className="mx-auto w-full max-w-[1600px] px-4 py-4 sm:px-6">
            <JobInfoStrip
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
          </div>
        </div>
      )}

      {/* Kanban */}
      <div className="mx-auto w-full max-w-[1600px] px-4 py-5 sm:px-6">
        <div className="grid gap-4 lg:grid-cols-2">
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
              <div className="space-y-2">
                <div className="relative">
                  <FaSearch className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs text-slate-400" />
                  <input
                    type="text"
                    value={searchText}
                    onChange={(e) => setSearchText(e.target.value)}
                    placeholder="ຄົ້ນຫາເລກບິນ, ລະຫັດ ຫຼື ຊື່ລູກຄ້າ..."
                    className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-9 text-sm outline-none transition-all focus:border-teal-400 focus:ring-2 focus:ring-teal-500/20 dark:border-slate-800 dark:bg-slate-900"
                  />
                  {searchingIcTrans && (
                    <FaSpinner className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-xs text-slate-400" />
                  )}
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  ສະແດງສະເພາະບິນທີ່ກົງກັບວັນຈັດສົ່ງ ແລະ ຮອບທີ່ເລືອກ
                </p>
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
              <div className="flex items-center gap-3 text-[11px] text-slate-500 dark:text-slate-400">
                <span>
                  <span className="font-bold text-teal-600 dark:text-teal-400">
                    {totalAddedItems}
                  </span>{" "}
                  ລາຍການ
                </span>
                {totalAddedBills > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setAddedByBill({});
                      setExpandedInJob(null);
                    }}
                    className="ml-auto inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-semibold text-red-500 transition-colors hover:bg-red-50 dark:hover:bg-red-950/30"
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
  const accent =
    tone === "teal"
      ? "border-teal-200 bg-gradient-to-b from-teal-50/40 to-transparent dark:border-teal-900/50"
      : "border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900";
  const titleColor =
    tone === "teal"
      ? "text-teal-700 dark:text-teal-300"
      : "text-slate-700 dark:text-slate-200";
  const dotColor = tone === "teal" ? "bg-teal-500" : "bg-slate-400";

  return (
    <div
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className={`relative rounded-2xl border ${accent} ${highlighted ? "ring-2 ring-teal-400 ring-offset-2 dark:ring-offset-slate-950" : ""} transition-all`}
    >
      <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3 dark:border-slate-800">
        <div className="flex items-center gap-2">
          <span className={`h-2 w-2 rounded-full ${dotColor}`} />
          <h2 className={`text-sm font-bold ${titleColor}`}>{title}</h2>
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-700 dark:bg-slate-800 dark:text-slate-200">
            {count}
          </span>
        </div>
      </div>
      {header && (
        <div className="border-b border-slate-200 px-4 py-3 dark:border-slate-800">
          {header}
        </div>
      )}
      <div className="p-3 lg:max-h-[calc(100vh-280px)] lg:overflow-y-auto">
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
}: {
  bill: AvailableBill;
  dragging: boolean;
  onDragStart: React.DragEventHandler<HTMLDivElement>;
  onDragEnd: React.DragEventHandler<HTMLDivElement>;
  onAdd: () => void;
  loading: boolean;
}) {
  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className={`group flex cursor-grab items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-3 transition-all hover:border-teal-300 hover:shadow-md active:cursor-grabbing dark:border-slate-800 dark:bg-slate-900/80 dark:hover:border-teal-700 ${dragging ? "opacity-40" : ""}`}
    >
      <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400">
        <FaBoxOpen size={12} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-bold text-slate-900 dark:text-slate-100">
          {bill.doc_no}
        </p>
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
              <span className="inline-flex items-center gap-1 rounded-full bg-sky-500/10 px-1.5 py-0.5 text-[9px] font-semibold text-sky-700 dark:text-sky-400">
                📅 {bill.scheduled_date_display}
              </span>
            )}
            {bill.delivery_round_name && (
              <span
                className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-1.5 py-0.5 text-[9px] font-semibold text-amber-700 dark:text-amber-400"
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
              className="inline-flex items-center gap-1 rounded-full border border-sky-500/30 bg-sky-500/10 px-1.5 py-0.5 text-[9px] font-semibold text-sky-700 dark:text-sky-400"
              title={bill.forwarded_at ? `Forwarded ${bill.forwarded_at}` : ""}
            >
              <FaArrowRight size={8} />
              Forwarder ຈາກ {bill.forward_from_transport_name || bill.forward_from_transport_code || "ສາຂາອື່ນ"}
            </span>
          </div>
        )}
      </div>
      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-300">
        {bill.count_item} ລາຍການ
      </span>
      <button
        type="button"
        onClick={onAdd}
        disabled={loading}
        className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-teal-600 text-white transition-all hover:bg-teal-500 active:scale-95 disabled:opacity-50"
        title="ເພີ່ມເຂົ້າຖ້ຽວ"
      >
        {loading ? <FaSpinner className="animate-spin" size={11} /> : <FaPlus size={11} />}
      </button>
    </div>
  );
}

function InJobCard({
  billNo,
  group,
  expanded,
  setExpanded,
  products,
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
  qtyDrafts,
  setQtyDrafts,
  commitItemQty,
}: {
  billNo: string;
  group: AddedBillGroup;
  expanded: boolean;
  setExpanded: () => void;
  products: Product[] | undefined;
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
      className={`overflow-hidden rounded-xl border border-teal-200 bg-white shadow-sm transition-all hover:shadow-md dark:border-teal-900/60 dark:bg-slate-900 ${dragging ? "opacity-40" : ""}`}
    >
      <div className="flex items-center gap-3 px-3 py-3">
        <div
          className={`flex h-9 w-9 flex-shrink-0 cursor-grab items-center justify-center rounded-lg ${
            isPartial
              ? "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300"
              : "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
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
            <div className="flex items-center gap-2 flex-wrap">
              <p className="truncate text-sm font-bold text-slate-900 dark:text-slate-100">
                {billNo}
              </p>
              {isPartial && (
                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
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
          <span className="rounded-full bg-teal-100 px-2 py-0.5 text-[10px] font-semibold text-teal-700 dark:bg-teal-950/40 dark:text-teal-300">
            {addedCount}/{totalOriginal}
          </span>
          <FaChevronDown
            className={`text-xs text-slate-400 transition-transform ${expanded ? "rotate-180" : ""}`}
          />
        </button>
        <button
          type="button"
          onClick={onRemoveBill}
          className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-red-500 transition-colors hover:bg-red-50 dark:hover:bg-red-950/30"
          title="ລົບ"
        >
          <FaTimes size={12} />
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-1.5 border-t border-slate-100 bg-slate-50/60 px-3 py-2 dark:border-slate-800 dark:bg-slate-900/40">
        <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400">
          🏬 ຮັບເຄື່ອງ:
        </span>
        <select
          value={group.pickup_transport_code ?? ""}
          onChange={(e) => onSetPickupCode(e.target.value === "" ? null : e.target.value)}
          className="h-7 rounded-md border border-slate-200 bg-white px-1.5 text-[10px] outline-none focus:border-teal-400 focus:ring-2 focus:ring-teal-500/20 dark:border-slate-700 dark:bg-slate-900"
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

      <div className="flex flex-wrap items-center gap-1.5 border-t border-slate-100 bg-slate-50/60 px-3 py-2 dark:border-slate-800 dark:bg-slate-900/40">
        <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400">
          ປາຍທາງ:
        </span>
        <button
          type="button"
          onClick={() => onSetForwardCode(null)}
          className={`rounded-full px-2.5 py-1 text-[10px] font-semibold transition-all ${
            !group.forward_transport_code
              ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
              : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300"
          }`}
        >
          ສົ່ງລູກຄ້າ
        </button>
        <button
          type="button"
          onClick={() => {
            if (!group.forward_transport_code && forwardableBranches.length > 0) {
              onSetForwardCode(forwardableBranches[0].code);
            }
          }}
          disabled={forwardableBranches.length === 0}
          className={`rounded-full px-2.5 py-1 text-[10px] font-semibold transition-all disabled:opacity-50 ${
            group.forward_transport_code
              ? "bg-sky-100 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300"
              : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300"
          }`}
        >
          ສົ່ງຕໍ່ສາຂາ
        </button>
        {group.forward_transport_code && (
          <select
            value={group.forward_transport_code}
            onChange={(e) => onSetForwardCode(e.target.value)}
            className="h-7 rounded-md border border-sky-200 bg-white px-1.5 text-[10px] outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-500/20 dark:border-sky-800 dark:bg-slate-900"
          >
            {forwardableBranches.map((b) => (
              <option key={b.code} value={b.code}>
                {b.name_1} ({b.code})
              </option>
            ))}
          </select>
        )}
      </div>

      {expanded && (
        <div className="border-t border-slate-100 bg-slate-50 px-3 py-3 dark:border-slate-800 dark:bg-slate-900/50">
          {loading || !products ? (
            <div className="flex items-center justify-center gap-2 py-5 text-xs text-slate-500">
              <FaSpinner className="animate-spin" size={11} /> ກຳລັງໂຫຼດ...
            </div>
          ) : products.length === 0 ? (
            <p className="py-3 text-center text-xs text-slate-500">ບໍ່ມີສິນຄ້າ</p>
          ) : (
            <div className="space-y-1.5">
              {products.map((p) => {
                const added = group.items.find((i) => i.item_code === p.item_code);
                const isAdded = !!added;
                const draftKey = `${billNo}::${p.item_code}`;
                const qtyValue = qtyDrafts[draftKey] ?? String(added?.selectedQty ?? p.qty);
                return (
                  <div
                    key={p.item_code}
                    className={`flex items-center gap-2 rounded-lg border px-2.5 py-2 ${
                      isAdded
                        ? "border-teal-200 bg-white dark:border-teal-800 dark:bg-slate-900"
                        : "border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-900/50"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => toggleAddedItem(group.bill, p)}
                      className={`flex h-5 w-5 flex-shrink-0 items-center justify-center rounded transition-colors ${
                        isAdded
                          ? "bg-teal-600 text-white"
                          : "border border-slate-300 dark:border-slate-600"
                      }`}
                    >
                      {isAdded && <FaCheck size={9} />}
                    </button>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[11px] font-semibold text-slate-800 dark:text-slate-100">
                        {p.item_name}
                      </p>
                      <p className="truncate font-mono text-[9px] text-slate-400">
                        {p.item_code}
                      </p>
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
                        className="h-7 w-14 rounded-md border border-teal-300 bg-white px-1.5 text-center text-[11px] font-bold text-teal-700 outline-none focus:ring-2 focus:ring-teal-500/20 dark:border-teal-700 dark:bg-slate-900 dark:text-teal-300"
                      />
                    ) : (
                      <span className="text-[11px] font-bold text-slate-500">{p.qty}</span>
                    )}
                    <span className="text-[10px] text-slate-400 w-12 truncate">
                      / {p.qty} {p.unit_code}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function DropHint({ highlighted }: { highlighted?: boolean }) {
  return (
    <div
      className={`flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed py-12 transition-all ${
        highlighted
          ? "border-teal-400 bg-teal-50 dark:border-teal-600 dark:bg-teal-950/40"
          : "border-slate-300 bg-slate-50/50 dark:border-slate-700 dark:bg-slate-900/30"
      }`}
    >
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white shadow-sm dark:bg-slate-800">
        <FaArrowRight className="text-teal-500" />
      </div>
      <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">
        ລາກບິນມາວາງທີ່ນີ້
      </p>
      <p className="text-[11px] text-slate-400">ຫຼື ກົດ + ຢູ່ບິນດ້ານຊ້າຍ</p>
    </div>
  );
}

/* ============================== Job Info Strip ============================== */

function JobInfoStrip(props: {
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
    <section className="overflow-visible rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="flex flex-col gap-1 border-b border-slate-100 px-4 py-3 dark:border-slate-800 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-teal-600 dark:text-teal-400">
            ຕັ້ງຄ່າການຈັດສົ່ງ
          </p>
          <h2 className="text-sm font-bold text-slate-800 dark:text-white">ຂໍ້ມູນຖ້ຽວຈັດສົ່ງ</h2>
        </div>
        <p className="text-[11px] text-slate-400">ເລືອກໃຫ້ຄົບເພື່ອດຶງບິນຕາມແຜນ</p>
      </div>

      <div className="grid gap-4 p-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)_minmax(260px,0.8fr)]">
        <InfoGroup title="ແຜນສົ່ງ" icon={<FaCalendarAlt size={12} />}>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="ວັນທີເອກະສານ" icon={<FaCalendarAlt size={10} />}>
              <input
                type="date"
                value={props.docDate}
                min={FIXED_YEAR_START}
                max={FIXED_YEAR_END}
                onChange={(e) => props.setDocDate(e.target.value)}
                className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none transition-all focus:border-teal-400 focus:ring-2 focus:ring-teal-500/20 dark:border-slate-800 dark:bg-slate-950"
              />
            </Field>
            <Field label="ວັນທີຈັດສົ່ງ" icon={<FaCalendarAlt size={10} />}>
              <input
                type="date"
                value={props.dateLog}
                min={FIXED_YEAR_START}
                max={FIXED_YEAR_END}
                onChange={(e) => props.setDateLog(e.target.value)}
                className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none transition-all focus:border-teal-400 focus:ring-2 focus:ring-teal-500/20 dark:border-slate-800 dark:bg-slate-950"
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
              className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none transition-all focus:border-teal-400 focus:ring-2 focus:ring-teal-500/20 dark:border-slate-800 dark:bg-slate-950"
            >
              <option value="">- ບໍ່ກຳນົດ -</option>
              {props.deliveryRounds.map((r) => (
                <option key={r.code} value={r.code}>
                  {r.name}
                  {r.time_label ? ` (${r.time_label})` : ""}
                </option>
              ))}
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

          <div className="min-h-10 rounded-xl border border-dashed border-slate-200 bg-slate-50/60 p-2 dark:border-slate-800 dark:bg-slate-950/40">
            {props.selectedWorkers.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {props.selectedWorkers.map((wc) => {
                  const w = props.workers.find((i) => i.code === wc);
                  return (
                    <span
                      key={wc}
                      className="inline-flex items-center gap-1.5 rounded-full bg-teal-50 px-2.5 py-1 text-[11px] font-medium text-teal-700 dark:bg-teal-950/50 dark:text-teal-300"
                    >
                      {w?.name_1 || wc}
                      <button
                        type="button"
                        onClick={() =>
                          props.setSelectedWorkers((cur) => cur.filter((c) => c !== wc))
                        }
                        className="text-teal-400 transition-colors hover:text-red-500"
                      >
                        <FaTimes size={8} />
                      </button>
                    </span>
                  );
                })}
              </div>
            ) : (
              <p className="px-1 py-1 text-[11px] text-slate-400">
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
      <label className="mb-1 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
        {icon}
        {label}
        {required && <span className="text-red-500">*</span>}
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
    <div className="rounded-xl border border-slate-200/70 bg-slate-50/70 p-3 dark:border-slate-800 dark:bg-slate-950/40">
      <div className="mb-3 flex items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal-50 text-teal-700 dark:bg-teal-950/50 dark:text-teal-300">
          {icon}
        </span>
        <h3 className="text-xs font-bold text-slate-700 dark:text-slate-200">{title}</h3>
      </div>
      <div className="space-y-3">{children}</div>
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
      className={`inline-flex max-w-[180px] items-center gap-1.5 truncate rounded-full border px-3 py-1.5 text-[11px] font-semibold ${
        ok
          ? "border-teal-200 bg-teal-50 text-teal-700 dark:border-teal-900 dark:bg-teal-950/40 dark:text-teal-300"
          : "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300"
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
    <div className="px-4 py-12 text-center">
      <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500">
        {icon}
      </div>
      <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">{title}</p>
      {sub && <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{sub}</p>}
    </div>
  );
}
