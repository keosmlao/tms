"use client";

import Link from "next/link";
import { Fragment, useDeferredValue, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  FaArrowLeft,
  FaBoxOpen,
  FaCheck,
  FaCheckSquare,
  FaChevronDown,
  FaChevronRight,
  FaPlus,
  FaSave,
  FaSearch,
  FaSpinner,
  FaTimes,
  FaTrash,
  FaTruck,
  FaUser,
  FaUsers,
  FaCalendarAlt,
} from "react-icons/fa";
import { FIXED_YEAR_END, FIXED_YEAR_START, getFixedTodayDate } from "@/lib/fixed-year";
import { Actions } from "@/lib/api";
import { useSession } from "@/providers/session-provider";
// Ported from server actions: createJob, getAvailableBillProducts, getCarDefaults

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
}

export interface Option {
  code: string;
  name_1: string;
}

interface SelectedProduct extends Product {
  selectedQty: number;
}

interface AddedBillGroup {
  bill: AvailableBill;
  items: SelectedProduct[];
  forward_transport_code?: string;
}

interface TransportBranch {
  code: string;
  name_1: string;
}

interface AddJobClientProps {
  initialDocNo?: string;
  initialCars?: Option[];
  initialDrivers?: Option[];
  initialWorkers?: Option[];
  initialBills?: AvailableBill[];
}

// Reusable SearchDropdown with new design
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
}) => (
  <div ref={refEl} className="relative">
    <FaSearch className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 dark:text-gray-500" />
    <input
      type="text"
      value={search}
      onChange={(event) => {
        setSearch(event.target.value);
        setShow(true);
      }}
      onFocus={() => setShow(true)}
      placeholder={placeholder}
      className="h-9 w-full rounded-lg glass-input pl-8 pr-8 text-xs transition-all"
    />
    <button
      type="button"
      onClick={() => setShow(!show)}
      className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
    >
      <FaChevronDown className={`text-[10px] transition-transform duration-200 ${show ? "rotate-180" : ""}`} />
    </button>
    {show && (
      <div className="absolute z-20 mt-1 max-h-44 w-full overflow-y-auto rounded-lg glass-heavy glow-primary p-1">
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
                  ? "bg-teal-500/10 text-teal-600 dark:text-teal-400"
                  : "text-slate-700 dark:text-slate-300 hover:bg-white/30 dark:hover:bg-white/10"
              }`}
            >
              <span className="font-medium">{item.name_1}</span>
              <span className="text-[10px] text-gray-400 dark:text-gray-500">{item.code}</span>
            </button>
          ))
        ) : (
          <p className="px-3 py-2 text-center text-xs text-gray-400 dark:text-gray-500">ບໍ່ພົບ</p>
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
}: AddJobClientProps) {
  const router = useRouter();

  const [docNo, setDocNo] = useState(initialDocNo);
  const [docDate, setDocDate] = useState(getFixedTodayDate());
  const [dateLog, setDateLog] = useState(getFixedTodayDate());
  const [car, setCar] = useState("");
  const [driver, setDriver] = useState("");
  const [selectedWorkers, setSelectedWorkers] = useState<string[]>([]);
  const [jobForwardCode, setJobForwardCode] = useState<string>(""); // "" = ສົ່ງລູກຄ້າ, otherwise = branch code
  const [saving, setSaving] = useState(false);

  const [cars, setCars] = useState<Option[]>(initialCars);
  const [drivers, setDrivers] = useState<Option[]>(initialDrivers);
  const [workers, setWorkers] = useState<Option[]>(initialWorkers);
  const [availableBills, setAvailableBills] = useState<AvailableBill[]>(initialBills);
  const [transportBranches, setTransportBranches] = useState<TransportBranch[]>([]);
  const { session } = useSession();
  const ownBranch = (session?.logistic_code ?? "").trim();

  useEffect(() => {
    void Actions.getTransportBranches()
      .then((data: any) => setTransportBranches((data ?? []) as TransportBranch[]))
      .catch((e) => console.error(e));
  }, []);

  // Branches available as forward targets — exclude the user's own branch.
  const forwardableBranches = transportBranches.filter((b) => b.code !== ownBranch);

  // Replace the Next.js server prefetch
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
      if (data.doc_no) setDocNo(data.doc_no);
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
      } else {
        console.error("Failed to load job init", jobInit.reason);
      }

      if (carsResult.status === "fulfilled") {
        applyPageData({ cars: (carsResult.value ?? []) as Option[] });
      } else {
        console.error("Failed to load cars", carsResult.reason);
      }

      if (driversResult.status === "fulfilled") {
        applyPageData({ drivers: (driversResult.value ?? []) as Option[] });
      } else {
        console.error("Failed to load drivers", driversResult.reason);
      }

      if (workersResult.status === "fulfilled") {
        applyPageData({ workers: (workersResult.value ?? []) as Option[] });
      } else {
        console.error("Failed to load workers", workersResult.reason);
      }

      if (billsResult.status === "fulfilled") {
        applyPageData({ bills: (billsResult.value ?? []) as AvailableBill[] });
      } else {
        console.error("Failed to load available bills", billsResult.reason);
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
  }, []);

  const [addedByBill, setAddedByBill] = useState<Record<string, AddedBillGroup>>(() => {
    if (typeof window === "undefined") return {};
    try {
      const saved = localStorage.getItem("tms_job_draft");
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  const [showModal, setShowModal] = useState(false);
  const [expandedBill, setExpandedBill] = useState<string | null>(null);
  const [expandedAdded, setExpandedAdded] = useState<string | null>(null);
  const [modalSelected, setModalSelected] = useState<Record<string, Record<string, number>>>({});
  const [qtyDrafts, setQtyDrafts] = useState<Record<string, string>>({});
  const [searchText, setSearchText] = useState("");
  const [billProductsByNo, setBillProductsByNo] = useState<Record<string, Product[]>>({});
  const [loadingBillNo, setLoadingBillNo] = useState<string | null>(null);

  const [carSearch, setCarSearch] = useState("");
  const [driverSearch, setDriverSearch] = useState("");
  const [workerSearch, setWorkerSearch] = useState("");
  const [showCarDrop, setShowCarDrop] = useState(false);
  const [showDriverDrop, setShowDriverDrop] = useState(false);
  const [showWorkerDrop, setShowWorkerDrop] = useState(false);
  const carRef = useRef<HTMLDivElement>(null);
  const driverRef = useRef<HTMLDivElement>(null);
  const workerRef = useRef<HTMLDivElement>(null);
  const deferredSearchText = useDeferredValue(searchText);
  const deferredCarSearch = useDeferredValue(carSearch);
  const deferredDriverSearch = useDeferredValue(driverSearch);
  const deferredWorkerSearch = useDeferredValue(workerSearch);

  // Persist draft
  useEffect(() => {
    try {
      if (Object.keys(addedByBill).length > 0) {
        localStorage.setItem("tms_job_draft", JSON.stringify(addedByBill));
      } else {
        localStorage.removeItem("tms_job_draft");
      }
    } catch {}
  }, [addedByBill]);

  // Auto-fill driver/workers when car changes
  useEffect(() => {
    if (!car) return;

    const selectedCar = cars.find((item) => item.code === car);
    if (selectedCar) {
      setCarSearch(selectedCar.name_1);
    }

    Actions.getCarDefaults(car)
      .then((defaults) => {
        if (defaults.drivers.length > 0) {
          setDriver(defaults.drivers[0].code);
          setDriverSearch(defaults.drivers[0].name_1);
        }
        if (defaults.workers.length > 0) {
          setSelectedWorkers(defaults.workers.map((worker: { code: string }) => worker.code));
        }
      })
      .catch(console.error);
  }, [car, cars]);

  useEffect(() => {
    if (!driver) return;
    const selectedDriver = drivers.find((item) => item.code === driver);
    if (selectedDriver) {
      setDriverSearch(selectedDriver.name_1);
    }
    setSelectedWorkers((current) => current.filter((workerCode) => workerCode !== driver));
  }, [driver, drivers]);

  // Close dropdowns on outside click
  useEffect(() => {
    const handler = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!carRef.current?.contains(target)) setShowCarDrop(false);
      if (!driverRef.current?.contains(target)) setShowDriverDrop(false);
      if (!workerRef.current?.contains(target)) setShowWorkerDrop(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const ensureBillProducts = async (billNo: string) => {
    if (billProductsByNo[billNo]) {
      return billProductsByNo[billNo];
    }

    setLoadingBillNo(billNo);
    try {
      const products = (await Actions.getAvailableBillProducts(billNo)) as Product[];
      setBillProductsByNo((current) => ({
        ...current,
        [billNo]: products,
      }));
      return products;
    } finally {
      setLoadingBillNo(null);
    }
  };

  const toggleItem = (billNo: string, itemCode: string, defaultQty: number) => {
    setModalSelected((prev) => {
      const next = { ...prev };
      const items = { ...(next[billNo] || {}) };
      if (items[itemCode] !== undefined) {
        delete items[itemCode];
      } else {
        items[itemCode] = defaultQty;
      }
      if (Object.keys(items).length === 0) {
        delete next[billNo];
      } else {
        next[billNo] = items;
      }
      return next;
    });
    setQtyDrafts((prev) => {
      const next = { ...prev };
      delete next[`${billNo}::${itemCode}`];
      return next;
    });
  };

  const changeItemQty = (billNo: string, itemCode: string, qty: number, maxQty: number) => {
    setModalSelected((prev) => {
      const next = { ...prev };
      const items = { ...(next[billNo] || {}) };
      items[itemCode] = Math.max(1, Math.min(qty, maxQty));
      next[billNo] = items;
      return next;
    });
  };

  const commitItemQty = (billNo: string, itemCode: string, maxQty: number) => {
    const draftKey = `${billNo}::${itemCode}`;
    const draftValue = qtyDrafts[draftKey];
    if (draftValue === undefined) return;

    const parsed = Number(draftValue);
    const nextQty = Number.isFinite(parsed) ? Math.max(1, Math.min(parsed, maxQty)) : maxQty;
    changeItemQty(billNo, itemCode, nextQty, maxQty);
    setQtyDrafts((prev) => ({
      ...prev,
      [draftKey]: String(nextQty),
    }));
  };

  const toggleAllItems = (billNo: string, products: Product[]) => {
    setModalSelected((prev) => {
      const next = { ...prev };
      const items = next[billNo] || {};
      if (Object.keys(items).length === products.length) {
        delete next[billNo];
      } else {
        const all: Record<string, number> = {};
        products.forEach((product) => {
          all[product.item_code] = product.qty;
        });
        next[billNo] = all;
      }
      return next;
    });
  };

  const handleOpenBill = async (billNo: string) => {
    setExpandedBill(billNo);
    try {
      const products = await ensureBillProducts(billNo);
      // Auto-select all pending products
      const addedCodes = new Set((addedByBill[billNo]?.items ?? []).map((item) => item.item_code));
      const pending = (products ?? []).filter((p) => !addedCodes.has(p.item_code));
      if (pending.length > 0) {
        setModalSelected((prev) => {
          if (prev[billNo]) return prev;
          const all: Record<string, number> = {};
          pending.forEach((p) => {
            all[p.item_code] = p.qty;
          });
          return { ...prev, [billNo]: all };
        });
      }
    } catch (error) {
      console.error(error);
    }
  };

  const handleAddSelected = () => {
    const billNos = Object.keys(modalSelected);
    if (billNos.length === 0) return;

    setAddedByBill((prev) => {
      const next = { ...prev };
      for (const billNo of billNos) {
        const bill = availableBills.find((item) => item.doc_no === billNo);
        const products = billProductsByNo[billNo] ?? [];
        if (!bill || products.length === 0) continue;

        const items = modalSelected[billNo];
        const newProducts: SelectedProduct[] = products
          .filter((product) => items[product.item_code] !== undefined)
          .map((product) => ({
            ...product,
            selectedQty: items[product.item_code],
          }));

        const existing = next[billNo]?.items || [];
        const merged = [
          ...existing.filter((item) => !items[item.item_code]),
          ...newProducts,
        ];

        next[billNo] = { bill, items: merged };
      }
      return next;
    });

    setModalSelected({});
    setQtyDrafts({});
    setShowModal(false);
  };

  const handleRemoveBill = (billNo: string) =>
    setAddedByBill((prev) => {
      const next = { ...prev };
      delete next[billNo];
      return next;
    });

  const handleRemoveItem = (billNo: string, itemCode: string) =>
    setAddedByBill((prev) => {
      const next = { ...prev };
      if (!next[billNo]) return next;
      const items = next[billNo].items.filter((item) => item.item_code !== itemCode);
      if (items.length === 0) {
        delete next[billNo];
      } else {
        next[billNo] = { ...next[billNo], items };
      }
      return next;
    });

  const handleSave = async () => {
    const billCount = Object.keys(addedByBill).length;
    if (!car || !driver || billCount === 0) {
      alert("ກະລຸນາເລືອກລົດ, ຄົນຂັບ ແລະ ເພີ່ມສິນຄ້າກ່ອນ");
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
        // Job-level destination — same for every bill in this dispatch.
        forward_transport_code: jobForwardCode || null,
        items: group.items.map((product) => ({
          item_code: product.item_code,
          item_name: product.item_name,
          qty: product.qty,
          selectedQty: product.selectedQty,
          unit_code: product.unit_code,
        })),
      }));

      await Actions.createJob({
        doc_date: docDate,
        doc_no: docNo,
        date_log: dateLog,
        car,
        driver,
        workers: selectedWorkers,
        bills,
      });

      localStorage.removeItem("tms_job_draft");
      router.push("/jobs");
    } catch (error) {
      console.error(error);
    } finally {
      setSaving(false);
    }
  };

  // Derived data
  const normalizedSearchText = deferredSearchText.trim().toLowerCase();
  const modalBills = showModal
    ? availableBills
        .map((bill) => {
          const addedGroup = addedByBill[bill.doc_no];
          const remainingCount = Math.max(bill.count_item - (addedGroup?.items.length ?? 0), 0);
          return {
            ...bill,
            count_item: remainingCount,
          };
        })
        .filter((bill) => bill.count_item > 0)
        .filter(
          (bill) =>
            !normalizedSearchText ||
            bill.doc_no.toLowerCase().includes(normalizedSearchText) ||
            (bill.cust_name || "").toLowerCase().includes(normalizedSearchText) ||
            bill.cust_code.toLowerCase().includes(normalizedSearchText)
        )
    : [];
  const activeModalBill = expandedBill
    ? modalBills.find((bill) => bill.doc_no === expandedBill) ?? null
    : null;
  const activeBillSelected = activeModalBill ? modalSelected[activeModalBill.doc_no] || {} : {};
  const activeAddedCodes = new Set(
    (activeModalBill ? addedByBill[activeModalBill.doc_no]?.items ?? [] : []).map(
      (item) => item.item_code
    )
  );
  const activeVisibleProducts = activeModalBill
    ? (billProductsByNo[activeModalBill.doc_no] ?? []).filter(
        (product) => !activeAddedCodes.has(product.item_code)
      )
    : [];
  const activeAllSelected =
    activeVisibleProducts.length > 0 &&
    Object.keys(activeBillSelected).length === activeVisibleProducts.length;

  const totalModalSelected = Object.values(modalSelected).reduce(
    (sum, items) => sum + Object.keys(items).length,
    0
  );
  const totalAddedItems = Object.values(addedByBill).reduce((sum, group) => sum + group.items.length, 0);
  const totalAddedBills = Object.keys(addedByBill).length;
  const canSave = Boolean(docNo && car && driver && totalAddedBills > 0);

  const filteredCars = cars.filter(
    (item) =>
      !deferredCarSearch ||
      item.name_1.toLowerCase().includes(deferredCarSearch.toLowerCase()) ||
      item.code.toLowerCase().includes(deferredCarSearch.toLowerCase())
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

  return (
    <div className="min-h-screen pb-8">
      {/* Sticky Header */}
      <div className="sticky top-0 z-20 glass-heavy border-b border-white/20 dark:border-white/5">
        <div className="w-full px-4 sm:px-6 lg:px-8 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Link
                 href="/jobs"
                className="flex h-9 w-9 items-center justify-center rounded-lg glass text-slate-600 dark:text-slate-400 hover:bg-white/40 dark:hover:bg-white/10 transition-all"
              >
                <FaArrowLeft className="text-sm" />
              </Link>
              <div>
                <h1 className="text-lg font-bold bg-gradient-to-r from-gray-900 to-gray-600 dark:from-white dark:to-gray-400 bg-clip-text text-transparent">
                  ສ້າງຖ້ຽວຈັດສົ່ງ
                </h1>
                <p className="text-xs text-gray-500 dark:text-gray-400">{docNo || "..."}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full bg-teal-500/10 text-teal-600 dark:text-teal-400 text-xs font-semibold">
                <FaBoxOpen size={10} />
                {totalAddedBills} ບິນ · {totalAddedItems} ລາຍການ
              </div>
              <button
                onClick={handleSave}
                disabled={!canSave || saving}
                className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-teal-600 to-teal-500 text-white rounded-lg text-sm font-semibold hover:from-teal-500 hover:to-teal-400 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-md"
              >
                {saving ? <FaSpinner className="animate-spin" size={14} /> : <FaSave size={14} />}
                {saving ? "ກຳລັງບັນທຶກ..." : "ບັນທຶກ"}
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="w-full px-4 sm:px-6 lg:px-8 py-6">
        <div className="grid gap-6 lg:grid-cols-[340px_1fr]">
          {/* Left Column: Job Info + Summary */}
          <div className="space-y-5">
            {/* Job Info Card */}
            <div className="glass rounded-lg overflow-hidden transition-all">
              <div className="flex items-center gap-2 px-5 py-3 bg-teal-500/10 border-b border-white/20 dark:border-white/5">
                <FaTruck className="text-teal-500 text-sm" />
                <h2 className="text-sm font-bold text-gray-800 dark:text-gray-200">ຂໍ້ມູນຖ້ຽວ</h2>
              </div>
              <div className="p-5 space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] font-medium text-gray-500 dark:text-gray-400 mb-1.5 block flex items-center gap-1">
                      <FaCalendarAlt size={9} /> ວັນທີເອກະສານ
                    </label>
                    <input
                      type="date"
                      value={docDate}
                      min={FIXED_YEAR_START}
                      max={FIXED_YEAR_END}
                      onChange={(event) => setDocDate(event.target.value)}
                      className="h-9 w-full rounded-lg glass-input px-3 text-xs transition-all"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-medium text-gray-500 dark:text-gray-400 mb-1.5 block flex items-center gap-1">
                      <FaCalendarAlt size={9} /> ວັນທີຈັດສົ່ງ
                    </label>
                    <input
                      type="date"
                      value={dateLog}
                      min={FIXED_YEAR_START}
                      max={FIXED_YEAR_END}
                      onChange={(event) => setDateLog(event.target.value)}
                      className="h-9 w-full rounded-lg glass-input px-3 text-xs transition-all"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-[11px] font-medium text-gray-500 dark:text-gray-400 mb-1.5 block flex items-center gap-1">
                    <FaTruck size={9} /> ລົດ <span className="text-red-500">*</span>
                  </label>
                  <SearchDropdown
                    refEl={carRef}
                    show={showCarDrop}
                    setShow={setShowCarDrop}
                    search={carSearch}
                    setSearch={(value) => {
                      setCarSearch(value);
                      setCar("");
                    }}
                    items={filteredCars}
                    value={car}
                    onSelect={(code, name) => {
                      setCar(code);
                      setCarSearch(name);
                    }}
                    placeholder="ຄົ້ນຫາລົດ..."
                  />
                </div>

                <div>
                  <label className="text-[11px] font-medium text-gray-500 dark:text-gray-400 mb-1.5 block flex items-center gap-1">
                    <FaUser size={9} /> ຄົນຂັບ <span className="text-red-500">*</span>
                  </label>
                  <SearchDropdown
                    refEl={driverRef}
                    show={showDriverDrop}
                    setShow={setShowDriverDrop}
                    search={driverSearch}
                    setSearch={(value) => {
                      setDriverSearch(value);
                      setDriver("");
                    }}
                    items={filteredDrivers}
                    value={driver}
                    onSelect={(code, name) => {
                      setDriver(code);
                      setDriverSearch(name);
                    }}
                    placeholder="ຄົ້ນຫາຄົນຂັບ..."
                  />
                </div>

                <div>
                  <label className="text-[11px] font-medium text-gray-500 dark:text-gray-400 mb-1.5 block flex items-center gap-1">
                    <FaUsers size={9} /> ກຳມະກອນ
                  </label>
                  <SearchDropdown
                    refEl={workerRef}
                    show={showWorkerDrop}
                    setShow={setShowWorkerDrop}
                    search={workerSearch}
                    setSearch={setWorkerSearch}
                    items={filteredWorkers}
                    value=""
                    onSelect={(code) => {
                      setSelectedWorkers((current) => [...current, code]);
                      setWorkerSearch("");
                      setShowWorkerDrop(true);
                    }}
                    placeholder="ເລືອກກຳມະກອນ..."
                  />
                  {selectedWorkers.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {selectedWorkers.map((workerCode) => {
                        const worker = workers.find((item) => item.code === workerCode);
                        return (
                          <span
                            key={workerCode}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-teal-100 dark:bg-teal-950/70 text-teal-700 dark:text-teal-300 text-[11px] font-medium"
                          >
                            {worker?.name_1 || workerCode}
                            <button
                              type="button"
                              onClick={() =>
                                setSelectedWorkers((current) =>
                                  current.filter((code) => code !== workerCode)
                                )
                              }
                              className="text-teal-400 hover:text-red-500 transition-colors"
                            >
                              <FaTimes size={8} />
                            </button>
                          </span>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Destination — customer delivery vs forward-to-branch. Applied to every bill in this job. */}
                <div>
                  <label className="text-[11px] font-medium text-gray-500 dark:text-gray-400 mb-1.5 block flex items-center gap-1">
                    <FaTruck size={9} /> ປາຍທາງ <span className="text-red-500">*</span>
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setJobForwardCode("")}
                      className={`px-3 py-2 rounded-lg text-xs font-semibold border transition-all ${
                        jobForwardCode === ""
                          ? "bg-emerald-50 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-700 text-emerald-700 dark:text-emerald-300 shadow-sm"
                          : "bg-white dark:bg-gray-900 border-slate-200 dark:border-gray-700 text-slate-600 dark:text-gray-300 hover:border-slate-300"
                      }`}
                    >
                      ສົ່ງລູກຄ້າ
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        // Default to the first available branch when switching on.
                        if (!jobForwardCode && forwardableBranches.length > 0) {
                          setJobForwardCode(forwardableBranches[0].code);
                        }
                      }}
                      disabled={forwardableBranches.length === 0}
                      className={`px-3 py-2 rounded-lg text-xs font-semibold border transition-all ${
                        jobForwardCode !== ""
                          ? "bg-sky-50 dark:bg-sky-950/40 border-sky-300 dark:border-sky-700 text-sky-700 dark:text-sky-300 shadow-sm"
                          : "bg-white dark:bg-gray-900 border-slate-200 dark:border-gray-700 text-slate-600 dark:text-gray-300 hover:border-slate-300"
                      }`}
                    >
                      ສົ່ງຕໍ່ສາຂາ
                    </button>
                  </div>
                  {jobForwardCode !== "" && (
                    <select
                      value={jobForwardCode}
                      onChange={(e) => setJobForwardCode(e.target.value)}
                      className="mt-2 w-full px-3 py-2 rounded-lg border border-sky-200 dark:border-sky-800 bg-white dark:bg-gray-900 text-xs text-slate-700 dark:text-gray-300 focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 transition-all"
                    >
                      {forwardableBranches.map((branch) => (
                        <option key={branch.code} value={branch.code}>
                          {branch.name_1} ({branch.code})
                        </option>
                      ))}
                    </select>
                  )}
                  {jobForwardCode !== "" && (
                    <p className="mt-1.5 text-[10px] text-sky-600 dark:text-sky-400">
                      💡 ບິນທັງໝົດໃນຖ້ຽວນີ້ຈະຖືກສົ່ງຕໍ່ສາຂາ. ເມື່ອສົ່ງເຖິງແລ້ວ, ບິນຈະກັບຄືນໄປຫາ pool ຂອງສາຂາປາຍທາງໃຫ້ຈັດຖ້ຽວຕໍ່.
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* Summary Card */}
            <div className="glass rounded-lg overflow-hidden">
              <div className="flex items-center gap-2 px-5 py-3 bg-emerald-500/10 border-b border-white/20 dark:border-white/5">
                <FaCheck className="text-emerald-500 text-sm" />
                <h2 className="text-sm font-bold text-gray-800 dark:text-gray-200">ສະຫຼຸບ</h2>
              </div>
              <div className="p-5 space-y-3">
                <div className="flex items-center justify-between py-2 border-b border-gray-100 dark:border-gray-800">
                  <span className="text-xs text-gray-500 dark:text-gray-400">ລົດ</span>
                  <span className="text-xs font-semibold text-gray-800 dark:text-gray-200">
                    {car ? cars.find((item) => item.code === car)?.name_1 || car : "-"}
                  </span>
                </div>
                <div className="flex items-center justify-between py-2 border-b border-gray-100 dark:border-gray-800">
                  <span className="text-xs text-gray-500 dark:text-gray-400">ຄົນຂັບ</span>
                  <span className="text-xs font-semibold text-gray-800 dark:text-gray-200">
                    {driver ? drivers.find((item) => item.code === driver)?.name_1 || driver : "-"}
                  </span>
                </div>
                <div className="flex items-center justify-between py-2 border-b border-gray-100 dark:border-gray-800">
                  <span className="text-xs text-gray-500 dark:text-gray-400">ກຳມະກອນ</span>
                  <span className="text-xs font-semibold text-gray-800 dark:text-gray-200">{selectedWorkers.length} ຄົນ</span>
                </div>
                <div className="flex items-center justify-between py-2 border-b border-gray-100 dark:border-gray-800">
                  <span className="text-xs text-gray-500 dark:text-gray-400">ບິນ</span>
                  <span className="text-xs font-semibold text-teal-600 dark:text-teal-400">{totalAddedBills}</span>
                </div>
                <div className="flex items-center justify-between py-2">
                  <span className="text-xs text-gray-500 dark:text-gray-400">ລາຍການ</span>
                  <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">{totalAddedItems}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Selected Items */}
          <div className="glass rounded-lg overflow-hidden transition-all">
            <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 bg-emerald-500/10 border-b border-white/20 dark:border-white/5">
              <div className="flex items-center gap-2">
                <FaBoxOpen className="text-emerald-500 text-sm" />
                <h2 className="text-sm font-bold text-gray-800 dark:text-gray-200">ລາຍການທີ່ເລືອກ</h2>
                <span className="hidden sm:inline-flex items-center px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-300 text-[10px] font-semibold">
                  {totalAddedBills} ບິນ · {totalAddedItems} ລາຍການ
                </span>
              </div>
              <button
                onClick={() => {
                  const nextBillNo =
                    availableBills.find((bill) => {
                      const addedGroup = addedByBill[bill.doc_no];
                      return Math.max(bill.count_item - (addedGroup?.items.length ?? 0), 0) > 0;
                    })?.doc_no ?? null;
                  setModalSelected({});
                  setSearchText("");
                  setShowModal(true);
                  if (nextBillNo) {
                    void handleOpenBill(nextBillNo);
                  } else {
                    setExpandedBill(null);
                  }
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-teal-600 to-teal-500 text-white rounded-lg text-xs font-semibold hover:from-teal-500 hover:to-teal-400 transition-all shadow-sm"
              >
                <FaPlus size={10} /> ເພີ່ມບິນ
              </button>
            </div>

            {totalAddedBills > 0 ? (
              <div className="divide-y divide-gray-100 dark:divide-gray-800">
                {Object.entries(addedByBill).map(([billNo, group]) => {
                  const isExpanded = expandedAdded === billNo;
                  const totalOriginal = group.bill.count_item;
                  const addedCount = group.items.length;
                  const hasPartialQty = group.items.some((item) => item.selectedQty < item.qty);
                  const isPartial = addedCount < totalOriginal || hasPartialQty;

                  return (
                    <Fragment key={billNo}>
                      <div
                        className={`flex items-center gap-3 px-5 py-3 cursor-pointer transition-all duration-200 ${
                          isExpanded ? "bg-emerald-50/40 dark:bg-emerald-950/20" : "hover:bg-gray-50/50 dark:hover:bg-gray-800/30"
                        }`}
                        onClick={() => setExpandedAdded(isExpanded ? null : billNo)}
                      >
                        <div className="text-gray-400 dark:text-gray-500">
                          {isExpanded ? <FaChevronDown size={10} /> : <FaChevronRight size={10} />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">{billNo}</p>
                            {isPartial && (
                              <span className="px-1.5 py-0.5 rounded-full bg-amber-100 dark:bg-amber-950/70 text-amber-700 dark:text-amber-300 text-[10px] font-semibold">
                                ບາງສ່ວນ
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
                            {group.bill.doc_date} · {group.bill.cust_name || group.bill.cust_code}
                          </p>
                        </div>
                        <span className="px-2 py-0.5 rounded-full bg-teal-100 dark:bg-teal-950/70 text-teal-700 dark:text-teal-300 text-[10px] font-semibold">
                          {addedCount}/{totalOriginal}
                        </span>
                        <button
                          onClick={(event) => {
                            event.stopPropagation();
                            handleRemoveBill(billNo);
                          }}
                          className="p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-lg transition-colors"
                        >
                          <FaTrash size={10} />
                        </button>
                      </div>
                      {isExpanded && (
                        <div className="bg-emerald-50/20 dark:bg-emerald-950/10 px-5 py-3 border-t border-gray-100 dark:border-gray-800">
                          <div className="space-y-1.5">
                            {group.items.map((product, index) => (
                              <div
                                key={product.item_code}
                                className="flex items-center gap-3 px-3 py-2 bg-white dark:bg-gray-900 rounded-lg border border-emerald-100 dark:border-emerald-900/50 shadow-sm"
                              >
                                <span className="text-[11px] text-gray-400 w-5">{index + 1}</span>
                                <div className="flex-1 min-w-0">
                                  <p className="text-xs font-medium text-gray-700 dark:text-gray-300">{product.item_name}</p>
                                  <p className="text-[10px] text-gray-400 font-mono">{product.item_code}</p>
                                </div>
                                <p className="text-xs font-bold text-emerald-700 dark:text-emerald-400">
                                  {product.selectedQty} <span className="font-normal text-gray-400">/ {product.qty} {product.unit_code}</span>
                                </p>
                                <button
                                  onClick={() => handleRemoveItem(billNo, product.item_code)}
                                  className="p-1 text-red-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 rounded transition-colors"
                                >
                                  <FaTimes size={8} />
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </Fragment>
                  );
                })}
              </div>
            ) : (
              <div className="px-5 py-12 text-center">
                <div className="w-14 h-14 rounded-lg bg-gray-100 dark:bg-gray-800 flex items-center justify-center mx-auto mb-3">
                  <FaBoxOpen className="text-gray-400 text-2xl" />
                </div>
                <p className="text-sm text-gray-500 dark:text-gray-400">ຍັງບໍ່ມີລາຍການ</p>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">ກົດ &quot;ເພີ່ມບິນ&quot; ເພື່ອເລືອກສິນຄ້າ</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Modal for selecting bills */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-gray-900/60 backdrop-blur-sm transition-opacity" onClick={() => setShowModal(false)} />
          <div className="relative glass-heavy glow-primary rounded-lg w-full max-w-4xl h-[95vh] flex flex-col overflow-hidden animate-fadeIn">
            {/* Modal Header */}
            <div className="px-5 py-4 border-b border-gray-200 dark:border-gray-800 flex-shrink-0 bg-gradient-to-r from-amber-50/50 to-orange-50/50 dark:from-amber-950/30 dark:to-orange-950/30">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-amber-100 dark:bg-amber-950/70 flex items-center justify-center">
                    <FaBoxOpen className="text-amber-600 dark:text-amber-400" size={14} />
                  </div>
                  <div>
                    <h2 className="text-base font-bold text-gray-900 dark:text-white">ເລືອກສິນຄ້າ</h2>
                    <p className="text-xs text-gray-500 dark:text-gray-400">{modalBills.length} ບິນລໍຖ້າ</p>
                  </div>
                </div>
                <button
                  onClick={() => setShowModal(false)}
                  className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
                >
                  <FaTimes size={14} />
                </button>
              </div>
              <div className="relative">
                <FaSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-gray-400" />
                <input
                  type="text"
                  value={searchText}
                  onChange={(event) => setSearchText(event.target.value)}
                  placeholder="ຄົ້ນຫາຕາມເລກບິນ, ລູກຄ້າ..."
                  className="h-9 w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 pl-9 pr-3 text-xs outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 transition-all"
                />
              </div>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-hidden">
              {modalBills.length === 0 ? (
                <div className="py-16 text-center">
                  <FaBoxOpen className="mx-auto text-gray-300 dark:text-gray-600 text-3xl mb-3" />
                  <p className="text-sm text-gray-500 dark:text-gray-400">ບໍ່ມີບິນລໍຖ້າ</p>
                </div>
              ) : (
                <div className="grid h-full lg:grid-cols-[320px_1fr]">
                  <div className="flex min-h-0 flex-col border-b border-gray-200 dark:border-gray-800 lg:border-b-0 lg:border-r bg-gray-50/60 dark:bg-gray-950/20">
                    <div className="border-b border-gray-200 dark:border-gray-800 px-4 py-3">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-gray-400">
                        Bill Queue
                      </p>
                      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                        ເລືອກບິນເພື່ອເບິ່ງລາຍການສິນຄ້າ
                      </p>
                    </div>
                    <div className="min-h-0 flex-1 overflow-y-auto p-3 space-y-2">
                      {modalBills.map((bill) => {
                        const isActive = activeModalBill?.doc_no === bill.doc_no;
                        const selectedCount = Object.keys(modalSelected[bill.doc_no] || {}).length;

                        return (
                          <button
                            key={bill.doc_no}
                            type="button"
                            onClick={() => void handleOpenBill(bill.doc_no)}
                            className={`w-full rounded-lg border px-3 py-3 text-left transition-all ${
                              isActive
                                ? "border-teal-300 bg-white shadow-sm dark:border-teal-700 dark:bg-gray-900"
                                : "border-gray-200 bg-white/80 hover:border-gray-300 hover:bg-white dark:border-gray-800 dark:bg-gray-900/70 dark:hover:border-gray-700"
                            }`}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">
                                  {bill.doc_no}
                                </p>
                                <p className="mt-1 text-[11px] text-gray-400">{bill.doc_date}</p>
                              </div>
                              <div className="flex items-center gap-1.5">
                                {selectedCount > 0 && (
                                  <span className="rounded-full bg-teal-100 px-2 py-0.5 text-[10px] font-semibold text-teal-700 dark:bg-teal-950/70 dark:text-teal-300">
                                    {selectedCount}
                                  </span>
                                )}
                                <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-600 dark:bg-gray-800 dark:text-gray-300">
                                  {bill.count_item}
                                </span>
                              </div>
                            </div>
                            <p className="mt-2 truncate text-[11px] text-gray-500 dark:text-gray-400">
                              {bill.cust_name || bill.cust_code}
                            </p>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="flex min-h-0 flex-col bg-white/70 dark:bg-gray-900/40">
                    {activeModalBill ? (
                      <>
                        <div className="border-b border-gray-200 dark:border-gray-800 px-5 py-4">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                              <div className="flex items-center gap-2 flex-wrap">
                                <h3 className="text-base font-bold text-gray-900 dark:text-white">
                                  {activeModalBill.doc_no}
                                </h3>
                                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700 dark:bg-amber-950/60 dark:text-amber-300">
                                  {activeModalBill.count_item} ລາຍການ
                                </span>
                              </div>
                              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                                {activeModalBill.doc_date} · {activeModalBill.cust_name || activeModalBill.cust_code}
                              </p>
                            </div>
                            {activeVisibleProducts.length > 0 && (
                              <button
                                type="button"
                                onClick={() => toggleAllItems(activeModalBill.doc_no, activeVisibleProducts)}
                                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                                  activeAllSelected
                                    ? "bg-teal-100 text-teal-700 dark:bg-teal-950/60 dark:text-teal-300"
                                    : "bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
                                }`}
                              >
                                <FaCheckSquare size={12} />
                                {activeAllSelected ? "ຍົກເລີກທັງໝົດ" : "ເລືອກທັງໝົດ"}
                              </button>
                            )}
                          </div>
                        </div>

                        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
                          {loadingBillNo === activeModalBill.doc_no ? (
                            <div className="flex h-full items-center justify-center gap-2 text-xs text-gray-500">
                              <FaSpinner className="animate-spin" size={14} />
                              ກຳລັງໂຫຼດ...
                            </div>
                          ) : activeVisibleProducts.length > 0 ? (
                            <div className="overflow-hidden rounded-lg border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
                              <div className="max-h-full overflow-auto">
                                <table className="min-w-full text-left">
                                  <thead className="sticky top-0 z-10 bg-gray-50 dark:bg-gray-950">
                                    <tr className="border-b border-gray-200 dark:border-gray-800">
                                      <th className="px-3 py-3 text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                                        ເລືອກ
                                      </th>
                                      <th className="px-3 py-3 text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                                        ລະຫັດສິນຄ້າ
                                      </th>
                                      <th className="px-3 py-3 text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                                        ຊື່ສິນຄ້າ
                                      </th>
                                      <th className="px-3 py-3 text-right text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                                        ຈຳນວນ
                                      </th>
                                      <th className="px-3 py-3 text-center text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                                        ຫົວໜ່ວຍ
                                      </th>
                                      <th className="px-3 py-3 text-center text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                                        ຈຳນວນທີ່ເລືອກ
                                      </th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {activeVisibleProducts.map((product) => {
                                      const isChecked =
                                        activeBillSelected[product.item_code] !== undefined;

                                      return (
                                        <tr
                                          key={product.item_code}
                                          className={`border-b border-gray-100 transition-colors last:border-b-0 dark:border-gray-800 ${
                                            isChecked
                                              ? "bg-teal-50/70 dark:bg-teal-950/20"
                                              : "hover:bg-gray-50/70 dark:hover:bg-gray-800/40"
                                          }`}
                                        >
                                          <td className="px-3 py-3 align-middle">
                                            <button
                                              type="button"
                                              onClick={() =>
                                                toggleItem(
                                                  activeModalBill.doc_no,
                                                  product.item_code,
                                                  product.qty
                                                )
                                              }
                                              className={`flex h-5 w-5 items-center justify-center rounded-md ${
                                                isChecked
                                                  ? "bg-teal-600 text-white"
                                                  : "border border-gray-300 dark:border-gray-600"
                                              }`}
                                            >
                                              {isChecked && <FaCheck size={9} />}
                                            </button>
                                          </td>
                                          <td className="px-3 py-3 align-middle">
                                            <span className="text-[11px] font-mono text-gray-500 dark:text-gray-400">
                                              {product.item_code}
                                            </span>
                                          </td>
                                          <td className="px-3 py-3 align-middle">
                                            <button
                                              type="button"
                                              onClick={() =>
                                                toggleItem(
                                                  activeModalBill.doc_no,
                                                  product.item_code,
                                                  product.qty
                                                )
                                              }
                                              className="text-left text-xs font-semibold text-gray-800 dark:text-gray-100"
                                            >
                                              {product.item_name}
                                            </button>
                                          </td>
                                          <td className="px-3 py-3 text-right align-middle">
                                            <span className="text-sm font-bold text-gray-700 dark:text-gray-200">
                                              {product.qty}
                                            </span>
                                          </td>
                                          <td className="px-3 py-3 text-center align-middle">
                                            <span className="text-[11px] text-gray-500 dark:text-gray-400">
                                              {product.unit_code}
                                            </span>
                                          </td>
                                          <td className="px-3 py-3 text-center align-middle">
                                            {isChecked ? (
                                              <input
                                                type="number"
                                                min={1}
                                                max={product.qty}
                                                value={
                                                  qtyDrafts[
                                                    `${activeModalBill.doc_no}::${product.item_code}`
                                                  ] ??
                                                  String(
                                                    activeBillSelected[product.item_code] ??
                                                      product.qty
                                                  )
                                                }
                                                onChange={(event) =>
                                                  setQtyDrafts((prev) => ({
                                                    ...prev,
                                                    [`${activeModalBill.doc_no}::${product.item_code}`]:
                                                      event.target.value,
                                                  }))
                                                }
                                                onBlur={() =>
                                                  commitItemQty(
                                                    activeModalBill.doc_no,
                                                    product.item_code,
                                                    product.qty
                                                  )
                                                }
                                                className="h-8 w-20 rounded-lg border border-teal-300 bg-white px-2 text-center text-xs font-bold text-teal-700 outline-none focus:ring-2 focus:ring-teal-500/20 dark:border-teal-700 dark:bg-gray-900 dark:text-teal-300"
                                              />
                                            ) : (
                                              <button
                                                type="button"
                                                onClick={() =>
                                                  toggleItem(
                                                    activeModalBill.doc_no,
                                                    product.item_code,
                                                    product.qty
                                                  )
                                                }
                                                className="rounded-lg bg-gray-100 px-3 py-1.5 text-[11px] font-semibold text-gray-600 transition-colors hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
                                              >
                                                ເລືອກ
                                              </button>
                                            )}
                                          </td>
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          ) : (
                            <div className="flex h-full items-center justify-center px-6 text-center">
                              <div>
                                <FaBoxOpen className="mx-auto mb-3 text-3xl text-gray-300 dark:text-gray-600" />
                                <p className="text-sm text-gray-500 dark:text-gray-400">
                                  ບິນນີ້ບໍ່ມີສິນຄ້າຄົງເຫຼືອ
                                </p>
                                <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
                                  ຖ້າເຄີຍຖືກເພີ່ມໄປແລ້ວ ລະບົບຈະບໍ່ສະແດງຊ້ຳ
                                </p>
                              </div>
                            </div>
                          )}
                        </div>
                      </>
                    ) : (
                      <div className="flex h-full items-center justify-center px-6 text-center">
                        <div>
                          <FaChevronRight className="mx-auto mb-3 text-2xl text-gray-300 dark:text-gray-600" />
                          <p className="text-sm text-gray-500 dark:text-gray-400">
                            ເລືອກບິນຈາກລາຍການດ້ານຊ້າຍ
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            {totalModalSelected > 0 && (
              <div className="flex items-center justify-between px-5 py-3 border-t border-gray-200 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-900/50 flex-shrink-0">
                <p className="text-xs text-gray-600 dark:text-gray-300">
                  ເລືອກ <span className="font-bold text-teal-600 dark:text-teal-400">{totalModalSelected}</span> ລາຍການ
                </p>
                <button
                  onClick={handleAddSelected}
                  className="flex items-center gap-1.5 px-4 py-1.5 bg-gradient-to-r from-teal-600 to-teal-500 text-white rounded-lg text-xs font-semibold hover:from-teal-500 hover:to-teal-400 transition-all shadow-sm"
                >
                  <FaCheck size={10} /> ເພີ່ມລາຍການ
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: scale(0.98); }
          to { opacity: 1; transform: scale(1); }
        }
        .animate-fadeIn {
          animation: fadeIn 0.2s ease-out;
        }
      `}</style>
    </div>
  );
}
