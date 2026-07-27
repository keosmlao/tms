"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import {
  FaBoxOpen,
  FaCalendar,
  FaCheck,
  FaChevronDown,
  FaChevronRight,
  FaPlus,
  FaRoute,
  FaSpinner,
  FaTimes,
  FaTruck,
  FaUserTie,
  FaUsers,
  FaClock,
  FaPaperPlane,
  FaSearch,
} from "react-icons/fa";
import { Actions } from "@/lib/api";
import { FIXED_YEAR_END, FIXED_YEAR_START, getFixedTodayDate } from "@/lib/fixed-year";
import { useConfirm } from "@/components/confirm-dialog";
import { useSession } from "@/providers/session-provider";
import { DELIVERY_CONDITIONS, PICKUP_AT_CUSTOMER } from "../add/page";

// ຮ່າງຖ້ຽວ — ວັນ × ຮອບ × ສາຍ.
// The dispatcher plans the day here: one draft per (ຮອບ, ສາຍ), bills dropped in
// as orders arrive, crew chosen only when it is time to leave. Pressing
// ພ້ອມອອກ converts the draft into a real trip through the normal createJob
// path, after which the existing approval / driver flow takes over unchanged.

interface Draft {
  draft_id: number;
  date_logistic: string;
  date_logistic_display: string;
  origin_transport_code: string;
  origin_transport_name: string;
  delivery_route_code: string;
  delivery_route_name: string;
  delivery_round_code: string;
  delivery_round_name: string;
  delivery_round_time: string;
  car: string;
  car_name: string;
  driver: string;
  driver_name: string;
  workers: string;
  remark: string;
  created_by_name: string;
  created_at: string;
  bill_count: number;
}

interface DraftBill {
  doc_no: string;
  doc_date: string;
  cust_code: string;
  cust_name: string;
  cust_area?: string;
  count_item: number;
  delivery_condition?: string;
  forward_transport_code?: string;
  pickup_transport_code?: string;
  picked_item_count?: number;
  picked_qty?: number;
  items?: Array<{ item_code: string; item_name: string; qty: number; unit_code: string }>;
}

interface Product {
  item_code: string;
  item_name: string;
  qty: number;
  unit_code: string;
}

/** Bill waiting for its item selection before it joins a draft. */
interface PendingAdd {
  draftId: number;
  docNo: string;
  custName: string;
}

// A row from getBillsPending — the SAME source the ລໍຖ້າຈັດຖ້ຽວ page reads, so
// the counts here can never drift from that screen.
interface Candidate {
  doc_no: string;
  doc_date: string;
  cust_code: string;
  cust_name?: string;
  transport_name?: string;
  transport_code?: string;
  cust_area?: string;
  sale?: string;
  department?: string;
  transport?: string;
  action_status?: string;
  scheduled_date?: string | null;
  scheduled_date_display?: string | null;
  scheduled_date_overridden?: boolean;
  delivery_route_code?: string;
  delivery_round_code?: string;
  cancelled_delivery?: boolean;
  remaining_count?: number;
  count_item?: number;
}

interface Option {
  code: string;
  name_1: string;
}
interface RouteOption {
  code: string;
  name: string;
}
interface RoundOption {
  code: string;
  name: string;
  time_label?: string;
}
interface BranchOption {
  code: string;
  name_1: string;
}

// leading-[1.7] matters: Lao stacks vowels above and below the base glyph, and
// the tight default line-height clipped them inside selects.
const CONTROL =
  "rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs leading-[1.7] text-slate-700 outline-none focus:border-teal-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200";

export default function TripDraftsPage() {
  const confirm = useConfirm();
  const { session } = useSession();
  // Branch staff only ever see their own branch — getBillsPending enforces that
  // server-side from the session, so the branch controls here are meaningless
  // for them and are hidden rather than left looking like they do something.
  const myBranches = (session?.branch_codes || session?.logistic_code || "")
    .split(",")
    .map((c) => c.trim())
    .filter((c) => c && c !== "02-0004");
  const isBranchStaff = myBranches.length > 0;
  const today = getFixedTodayDate();
  // The planning board spans several days at once — a dispatcher lines up
  // tomorrow's rounds while today's are still running.
  const [dateFrom, setDateFrom] = useState(getFixedTodayDate);
  const [dateTo, setDateTo] = useState(getFixedTodayDate);
  // Day the "ສ້າງຮ່າງ" form and the bill pool act on. Follows the selected
  // draft, so adding bills always targets the right day.
  const [workDay, setWorkDay] = useState(getFixedTodayDate);
  const [branch, setBranch] = useState("");
  // Default view is every outstanding draft: one left over from an earlier day
  // is the thing most worth seeing, and it would be invisible behind a date
  // range. Untick to focus on a specific span.
  const [showAll, setShowAll] = useState(true);

  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [billsByDraft, setBillsByDraft] = useState<Record<number, DraftBill[]>>({});
  // "ທັງບິນ" rows have no stored selection, so their goods are fetched here —
  // the dispatcher still has to SEE what is being loaded.
  const [productsByBill, setProductsByBill] = useState<Record<string, Product[]>>({});
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [activeDraft, setActiveDraft] = useState<number | null>(null);
  // Bill currently being dragged out of the pool, and the draft it is hovering
  // over — the highlight is what tells the dispatcher the drop will land.
  const [pendingAdd, setPendingAdd] = useState<PendingAdd | null>(null);
  const [draggingBill, setDraggingBill] = useState<string | null>(null);
  const [dragOverDraft, setDragOverDraft] = useState<number | null>(null);

  const [routes, setRoutes] = useState<RouteOption[]>([]);
  const [rounds, setRounds] = useState<RoundOption[]>([]);
  const [branches, setBranches] = useState<BranchOption[]>([]);
  const [cars, setCars] = useState<Option[]>([]);
  const [drivers, setDrivers] = useState<Option[]>([]);
  const [workers, setWorkers] = useState<Option[]>([]);

  const [newRound, setNewRound] = useState("");
  const [newRoute, setNewRoute] = useState("");
  const [search, setSearch] = useState("");
  // Two queues: orders the salesperson dated, and orders they left undated —
  // the second group needs a decision before it can be planned at all.
  const [poolTab, setPoolTab] = useState<"dated" | "undated">("dated");
  const [draftedBills, setDraftedBills] = useState<Set<string>>(new Set());
  // Branch of the selected draft. The pool must show that branch's bills —
  // dragging a ດອນຕິ້ວ bill into a ປາກເຊ trip is never right.
  const [activeBranch, setActiveBranch] = useState("");
  // Off by default: the pool shows EVERY pending bill, exactly like the
  // ລໍຖ້າຈັດຖ້ຽວ page. Narrowing it to the draft's branch is opt-in, because a
  // filter that hides bills by default is what kept this panel looking empty.
  const [lockToDraftBranch, setLockToDraftBranch] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [d, pendingData, drafted] = await Promise.all([
        showAll ? Actions.listTripDrafts() : Actions.listTripDrafts(dateFrom, dateTo),
        // Identical call to the ລໍຖ້າຈັດຖ້ຽວ page: whole fixed year, same
        // branch filter. Anything else and the two screens disagree.
        // "all" is this API's word for every branch — passing "" made it look
        // for a branch whose code is the empty string, which matches nothing.
        Actions.getBillsPending(
          FIXED_YEAR_START,
          FIXED_YEAR_END,
          (lockToDraftBranch ? activeBranch : "") || branch || "all"
        ),
        Actions.listDraftedBillNos(),
      ]);
      setDrafts((d ?? []) as Draft[]);
      // Keep the FULL pending list so this header always matches the
      // ລໍຖ້າຈັດຖ້ຽວ page; bills already placed in a draft are marked, not
      // dropped, so the two totals can never disagree.
      setDraftedBills(new Set((drafted ?? []) as string[]));
      setCandidates((pendingData?.trans ?? []) as Candidate[]);
    } catch (e) {
      setError(String((e as Error)?.message ?? e));
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo, branch, showAll, activeBranch, lockToDraftBranch]);

  useEffect(() => {
    void load();
  }, [load]);

  // Branch staff: preselect their branch so ສ້າງຮ່າງ works without a choice
  // they do not actually have.
  useEffect(() => {
    if (isBranchStaff && !branch) setBranch(myBranches[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isBranchStaff]);


  useEffect(() => {
    void Actions.listDeliveryRoutes(true)
      .then((r) => setRoutes((r ?? []) as RouteOption[]))
      .catch(() => setRoutes([]));
    void Actions.listDeliveryRounds(true)
      .then((r) => setRounds((r ?? []) as RoundOption[]))
      .catch(() => setRounds([]));
    void Actions.getTransportBranches()
      .then((r) => setBranches((r ?? []) as BranchOption[]))
      .catch(() => setBranches([]));
    void Actions.getCars()
      .then((r) => setCars((r ?? []) as Option[]))
      .catch(() => setCars([]));
    void Actions.getDispatchDrivers()
      .then((r) => setDrivers((r ?? []) as Option[]))
      .catch(() => setDrivers([]));
    void Actions.getDispatchWorkers()
      .then((r) => setWorkers((r ?? []) as Option[]))
      .catch(() => setWorkers([]));
  }, []);

  const run = async (fn: () => Promise<unknown>, after?: () => Promise<void> | void) => {
    setBusy(true);
    setError("");
    try {
      await fn();
      if (after) await after();
      else await load();
    } catch (e) {
      setError(String((e as Error)?.message ?? e));
    } finally {
      setBusy(false);
    }
  };

  const loadDraftBills = async (draftId: number) => {
    const rows = ((await Actions.getTripDraftBills(draftId)) ?? []) as DraftBill[];
    setBillsByDraft((prev) => ({ ...prev, [draftId]: rows }));
    // Fill in the goods for whole-bill rows (skip ones already cached).
    const needed = rows.filter(
      (b) => (!Array.isArray(b.items) || b.items.length === 0) && !productsByBill[b.doc_no]
    );
    if (needed.length === 0) return;
    const loaded = await Promise.all(
      needed.map(async (b) => {
        try {
          return [b.doc_no, ((await Actions.getAvailableBillProducts(b.doc_no)) ?? []) as Product[]] as const;
        } catch {
          return [b.doc_no, [] as Product[]] as const;
        }
      })
    );
    setProductsByBill((prev) => ({ ...prev, ...Object.fromEntries(loaded) }));
  };

  const toggleDraft = async (draftId: number) => {
    setActiveDraft(draftId);
    const row = drafts.find((x) => x.draft_id === draftId);
    if (row?.date_logistic && row.date_logistic !== workDay) setWorkDay(row.date_logistic);
    setActiveBranch(row?.origin_transport_code ?? "");
    // The bill pool follows the selected draft's transport branch. This also
    // reloads from the server with the same branch filter, so candidates from
    // another warehouse can never be added by mistake.
    if (row?.origin_transport_code && row.origin_transport_code !== branch) {
      setBranch(row.origin_transport_code);
    }
    const next = new Set(expanded);
    if (next.has(draftId)) next.delete(draftId);
    else {
      next.add(draftId);
      if (!billsByDraft[draftId]) await loadDraftBills(draftId);
    }
    setExpanded(next);
  };

  const createDraft = () =>
    run(async () => {
      await Actions.createTripDraft({
        dateLogistic: workDay,
        originTransportCode: branch,
        deliveryRouteCode: newRoute,
        deliveryRoundCode: newRound,
      });
      setNewRoute("");
    });

  // Dropping a bill opens the item picker — the dispatcher decides which lines
  // and how much of each go on this trip before it is committed to the draft.
  const addBillTo = (draftId: number, docNo: string) => {
    setActiveDraft(draftId);
    const bill = candidates.find((c) => c.doc_no === docNo);
    setPendingAdd({
      draftId,
      docNo,
      custName: bill?.transport_name || bill?.cust_name || "",
    });
  };

  const commitAdd = (items: Product[]) => {
    if (!pendingAdd) return;
    const { draftId, docNo } = pendingAdd;
    setPendingAdd(null);
    void run(
      () => Actions.addBillsToTripDraft(draftId, [docNo], items),
      async () => {
        await loadDraftBills(draftId);
        await load();
      }
    );
  };

  const setBillOptions = (draftId: number, docNo: string, options: Record<string, unknown>) =>
    run(
      () => Actions.setTripDraftBillOptions(draftId, docNo, options),
      async () => {
        await loadDraftBills(draftId);
      }
    );

  // The ✓ button still works for anyone who prefers tapping (and on mobile,
  // where HTML5 drag events don't fire).
  const addBill = (docNo: string) => {
    if (!activeDraft) {
      setError("ເລືອກຮ່າງຖ້ຽວກ່ອນ ຫຼື ລາກບິນໄປວາງໃສ່ຮ່າງ");
      return;
    }
    addBillTo(activeDraft, docNo);
  };

  const removeBill = (draftId: number, docNo: string) =>
    run(
      () => Actions.removeBillFromTripDraft(draftId, docNo),
      async () => {
        await loadDraftBills(draftId);
        await load();
      }
    );

  // Picking a car pulls that car's usual driver + crew, exactly as ອອກໃບງານ
  // does — the dispatcher only overrides when someone is off.
  const pickCar = async (draftId: number, car: string) => {
    const patch: Record<string, unknown> = { car };
    if (car) {
      try {
        const defaults = (await Actions.getCarDefaults(car)) as {
          drivers?: { code: string }[];
          workers?: { code: string }[];
        };
        if (defaults?.drivers?.length) patch.driver = defaults.drivers[0].code;
        if (defaults?.workers?.length) patch.workers = defaults.workers.map((w) => w.code);
      } catch {
        // No saved defaults for this car — leave the crew as it is.
      }
    }
    await setCrew(draftId, patch);
  };

  const toggleWorker = (d: Draft, code: string) => {
    const current = (d.workers ?? "").split(",").filter(Boolean);
    const next = current.includes(code)
      ? current.filter((w) => w !== code)
      : [...current, code];
    return setCrew(d.draft_id, { workers: next });
  };

  const setCrew = (draftId: number, patch: Record<string, unknown>) =>
    run(() => Actions.updateTripDraft(draftId, patch));

  const dispatchDraft = async (d: Draft) => {
    const ok = await confirm({
      title: "ປ່ຽນເປັນພ້ອມອອກ?",
      message: `ຮ່າງ ${d.delivery_round_name} · ${d.delivery_route_name} (${d.bill_count} ບິນ) ຈະກາຍເປັນຖ້ຽວຈິງ ແລະ ສົ່ງໄປລໍອະນຸມັດ`,
      confirmLabel: "ພ້ອມອອກ",
    });
    if (!ok) return;
    void run(() =>
      Actions.dispatchTripDraft(d.draft_id, {
        car: d.car,
        driver: d.driver,
        workers: d.workers ? d.workers.split(",").filter(Boolean) : [],
      })
    );
  };

  const deleteDraft = async (d: Draft) => {
    const ok = await confirm({
      title: "ລຶບຮ່າງຖ້ຽວ?",
      message: `ບິນ ${d.bill_count} ໃບຈະກັບຄືນໄປລໍຈັດຖ້ຽວ`,
      confirmLabel: "ລຶບ",
      tone: "danger",
    });
    if (!ok) return;
    void run(() => Actions.deleteTripDraft(d.draft_id));
  };

  // ວັນ → ຮອບ → ສາຍ, the order the work actually happens in.
  const groupedByDay = useMemo(() => {
    const days = new Map<string, { display: string; rounds: Map<string, Draft[]> }>();
    for (const d of drafts) {
      const day = days.get(d.date_logistic) ?? {
        display: d.date_logistic_display,
        rounds: new Map<string, Draft[]>(),
      };
      const roundKey = `${d.delivery_round_name || d.delivery_round_code || "-"}${
        d.delivery_round_time ? ` · ${d.delivery_round_time}` : ""
      }`;
      const list = day.rounds.get(roundKey) ?? [];
      list.push(d);
      day.rounds.set(roundKey, list);
      days.set(d.date_logistic, day);
    }
    return [...days.entries()];
  }, [drafts]);

  // Same ວັນ+ຮອບ+ສາຍ can legitimately need more than one truck. Show the line
  // once and number the trips inside it (ຖ້ຽວ 1, ຖ້ຽວ 2) instead of repeating
  // an identical-looking card.
  const byRoute = (list: Draft[]) => {
    const map = new Map<string, Draft[]>();
    for (const d of list) {
      const key = d.delivery_route_code || d.delivery_route_name || "-";
      map.set(key, [...(map.get(key) ?? []), d]);
    }
    return [...map.values()];
  };

  // Only ONE thing decides which queue a bill belongs to here: did the
  // salesperson give a delivery date?
  //
  // The ລໍຖ້າຈັດຖ້ຽວ page also demands a route and a round before calling a bill
  // ready — but on this screen the DRAFT supplies those (ວັນ × ຮອບ × ສາຍ), so
  // requiring them up front is circular and left the main tab permanently at 0.
  const isSalesPending = useCallback((b: Candidate) => {
    if (b.cancelled_delivery || b.action_status === "customer_cancelled") return false;
    return b.action_status === "sales_not_notified";
  }, []);

  const isProblem = (b: Candidate) =>
    !!b.cancelled_delivery || b.action_status === "customer_cancelled";

  const activeDraftRow = drafts.find((d) => d.draft_id === activeDraft) ?? null;
  // No date filtering, by instruction: a bill promised for any day may go on
  // any draft — the draft's ວັນ/ຮອບ/ສາຍ become the bill's schedule when it is
  // dispatched. Branch narrowing stays opt-in (lockToDraftBranch), applied
  // server-side in the getBillsPending call above.
  const candidatesForDraft = candidates;

  const datedCount = useMemo(
    () =>
      candidatesForDraft.filter(
        (c) => !draftedBills.has(c.doc_no) && !isSalesPending(c) && !isProblem(c)
      ).length,
    [candidatesForDraft, isSalesPending, draftedBills]
  );

  const filteredCandidates = useMemo(() => {
    const kw = search.trim().toLowerCase();
    const inTab = candidatesForDraft.filter((c) =>
      draftedBills.has(c.doc_no) || isProblem(c)
        ? false
        : poolTab === "dated"
        ? !isSalesPending(c)
        : isSalesPending(c)
    );
    if (!kw) return inTab;
    return inTab.filter((c) =>
      [c.doc_no, c.cust_name, c.cust_code, c.cust_area, c.sale]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(kw)
    );
  }, [candidatesForDraft, search, poolTab, isSalesPending, draftedBills]);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-teal-500 to-sky-600 shadow-md">
          <FaRoute className="text-lg text-white" />
        </div>
        <div>
          <h1 className="text-lg font-bold text-slate-800 dark:text-white">ຮ່າງຖ້ຽວ</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            ວາງແຜນແຕ່ລະວັນ · ແຕ່ລະຮອບ · ແຕ່ລະສາຍ — ໃສ່ລົດ/ຄົນຂັບເມື່ອຮອດເວລາອອກ
          </p>
        </div>
      </div>

      {/* Day + branch + create */}
      <div className="glass space-y-3 rounded-lg p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[140px] flex-1">
            <label className="mb-1.5 block text-xs font-medium text-slate-600 dark:text-slate-300">
              <FaCalendar className="mr-1.5 inline text-slate-400" size={11} /> ຈາກວັນທີ
            </label>
            <input
              type="date"
              value={dateFrom}
              min={FIXED_YEAR_START}
              max={FIXED_YEAR_END}
              onChange={(e) => {
                setDateFrom(e.target.value);
                if (e.target.value > dateTo) setDateTo(e.target.value);
                setWorkDay(e.target.value);
              }}
              className={`${CONTROL} w-full`}
            />
          </div>
          <div className="min-w-[140px] flex-1">
            <label className="mb-1.5 block text-xs font-medium text-slate-600 dark:text-slate-300">
              <FaCalendar className="mr-1.5 inline text-slate-400" size={11} /> ຫາວັນທີ
            </label>
            <input
              type="date"
              value={dateTo}
              min={dateFrom}
              max={FIXED_YEAR_END}
              onChange={(e) => setDateTo(e.target.value)}
              className={`${CONTROL} w-full`}
            />
          </div>
          <div className="min-w-[150px] flex-1">
            <label className="mb-1.5 block text-xs font-medium text-slate-600 dark:text-slate-300">
              <FaTruck className="mr-1.5 inline text-slate-400" size={11} /> ສາຂາຂົນສົ່ງ
              <span className="ml-0.5 text-rose-500">*</span>
              {isBranchStaff && (
                <span className="ml-1 text-[10px] font-normal text-slate-400">
                  (ລັອກຕາມສິດຂອງທ່ານ)
                </span>
              )}
            </label>
            <select
              value={branch}
              onChange={(e) => setBranch(e.target.value)}
              title="ໃຊ້ທັງກອງລາຍການ ແລະ ເປັນສາຂາຂອງຮ່າງທີ່ຈະສ້າງ"
              className={`${CONTROL} w-full`}
            >
              {!isBranchStaff && <option value="">ທຸກສາຂາ (ເບິ່ງຢ່າງດຽວ)</option>}
              {branches
                .filter((b) => !isBranchStaff || myBranches.includes(b.code))
                .map((b) => (
                  <option key={b.code} value={b.code}>
                    {b.name_1}
                  </option>
                ))}
            </select>
          </div>
          <div className="min-w-[140px] flex-1">
            <label className="mb-1.5 block text-xs font-medium text-slate-600 dark:text-slate-300">
              <FaCalendar className="mr-1.5 inline text-slate-400" size={11} /> ວັນຂອງຮ່າງ
            </label>
            <input
              type="date"
              value={workDay}
              min={FIXED_YEAR_START}
              max={FIXED_YEAR_END}
              onChange={(e) => setWorkDay(e.target.value)}
              className={`${CONTROL} w-full`}
            />
          </div>
          <div className="min-w-[130px] flex-1">
            <label className="mb-1.5 block text-xs font-medium text-slate-600 dark:text-slate-300">
              <FaClock className="mr-1.5 inline text-slate-400" size={11} /> ຮອບ
            </label>
            <select
              value={newRound}
              onChange={(e) => setNewRound(e.target.value)}
              className={`${CONTROL} w-full`}
            >
              <option value="">- ເລືອກຮອບ -</option>
              {rounds.map((r) => (
                <option key={r.code} value={r.code}>
                  {r.name}
                  {r.time_label ? ` · ${r.time_label}` : ""}
                </option>
              ))}
            </select>
          </div>
          <div className="min-w-[150px] flex-1">
            <label className="mb-1.5 block text-xs font-medium text-slate-600 dark:text-slate-300">
              <FaRoute className="mr-1.5 inline text-slate-400" size={11} /> ສາຍ
            </label>
            <select
              value={newRoute}
              onChange={(e) => setNewRoute(e.target.value)}
              className={`${CONTROL} w-full`}
            >
              <option value="">- ເລືອກສາຍ -</option>
              {routes.map((r) => (
                <option key={r.code} value={r.code}>
                  {r.name}
                </option>
              ))}
            </select>
          </div>
          <label className="flex cursor-pointer select-none items-center gap-2 pb-2 text-xs font-medium text-slate-600 dark:text-slate-300">
            <input
              type="checkbox"
              checked={showAll}
              onChange={(e) => setShowAll(e.target.checked)}
              className="h-3.5 w-3.5 accent-teal-600"
            />
            ຮ່າງຄ້າງທັງໝົດ
          </label>
          <button
            type="button"
            onClick={createDraft}
            disabled={busy || !newRound || !newRoute || !branch}
            title={!branch ? "ເລືອກສາຂາຂົນສົ່ງກ່ອນ ຈຶ່ງສ້າງຮ່າງໄດ້" : ""}
            className="inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-lg bg-teal-600 px-4 py-2 text-xs font-bold text-white transition-colors hover:bg-teal-700 disabled:opacity-40"
          >
            {busy ? <FaSpinner className="animate-spin" size={11} /> : <FaPlus size={11} />}
            ສ້າງຮ່າງ
          </button>
        </div>
        {error && (
          <p className="rounded-lg border border-rose-500/30 px-3 py-2 text-xs text-rose-600 dark:text-rose-400">
            {error}
          </p>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        {/* Drafts, grouped by round */}
        <div className="space-y-3">
          {loading ? (
            <div className="glass rounded-lg p-10 text-center text-sm text-slate-500">
              <FaSpinner className="mx-auto mb-2 animate-spin text-teal-600" /> ກຳລັງໂຫຼດ...
            </div>
          ) : drafts.length === 0 ? (
            <div className="glass rounded-lg p-10 text-center">
              <FaRoute className="mx-auto mb-3 text-2xl text-slate-400" />
              <p className="text-sm font-medium text-slate-600 dark:text-slate-300">
                ຍັງບໍ່ມີຮ່າງຖ້ຽວຂອງມື້ນີ້
              </p>
              <p className="mt-1 text-xs text-slate-400">ເລືອກ ຮອບ + ສາຍ ຂ້າງເທິງ ແລ້ວກົດ "ສ້າງຮ່າງ"</p>
            </div>
          ) : (
            groupedByDay.map(([day, { display, rounds }]) => (
              <div key={day} className="space-y-2">
                <div
                  className={`flex items-center justify-between rounded-lg px-3 py-1.5 ${
                    day === workDay
                      ? "bg-teal-600 text-white"
                      : day < today
                      ? "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300"
                      : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => setWorkDay(day)}
                    className="cursor-pointer text-xs font-bold"
                    title="ໃຊ້ວັນນີ້ສຳລັບສ້າງຮ່າງ / ໃສ່ບິນ"
                  >
                    📅 {display}
                    {day < today && " · ຄ້າງ"}
                  </button>
                  <span className="text-[10px] font-semibold opacity-80">
                    {[...rounds.values()].reduce((n, l) => n + l.length, 0)} ຮ່າງ ·{" "}
                    {[...rounds.values()].flat().reduce((n, d) => n + d.bill_count, 0)} ບິນ
                  </span>
                </div>
                {[...rounds.entries()].map(([roundLabel, list]) => (
              <div key={roundLabel} className="space-y-2 pl-1">
                <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  <FaClock size={10} /> {roundLabel}
                </p>
                {byRoute(list).map((routeTrips) => (
                  <div
                    key={routeTrips[0].draft_id}
                    className={
                      routeTrips.length > 1
                        ? "space-y-1.5 rounded-lg border border-dashed border-slate-300 p-1.5 dark:border-slate-700"
                        : "space-y-1.5"
                    }
                  >
                    {routeTrips.length > 1 && (
                      <p className="px-1 text-[10px] font-bold text-slate-500 dark:text-slate-400">
                        {routeTrips[0].delivery_route_name || routeTrips[0].delivery_route_code} ·{" "}
                        {routeTrips.length} ຖ້ຽວ
                      </p>
                    )}
                    {routeTrips.map((d, tripIndex) => {
                  const isActive = activeDraft === d.draft_id;
                  const isOpen = expanded.has(d.draft_id);
                  const bills = billsByDraft[d.draft_id] ?? [];
                  const ready = !!d.car && !!d.driver && d.bill_count > 0;
                  return (
                    <div
                      key={d.draft_id}
                      onDragOver={(e) => {
                        if (!draggingBill) return;
                        e.preventDefault();
                        e.dataTransfer.dropEffect = "move";
                        setDragOverDraft(d.draft_id);
                      }}
                      onDragLeave={() => setDragOverDraft((cur) => (cur === d.draft_id ? null : cur))}
                      onDrop={(e) => {
                        e.preventDefault();
                        const billNo = e.dataTransfer.getData("text/plain") || draggingBill;
                        setDragOverDraft(null);
                        setDraggingBill(null);
                        if (billNo) addBillTo(d.draft_id, billNo);
                      }}
                      className={`glass overflow-hidden rounded-lg border transition-colors ${
                        dragOverDraft === d.draft_id
                          ? "border-teal-500 ring-2 ring-teal-400/50 dark:border-teal-500"
                          : isActive
                          ? "border-teal-400 dark:border-teal-700"
                          : "border-transparent"
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => void toggleDraft(d.draft_id)}
                        className="flex w-full cursor-pointer items-center gap-2.5 px-3 py-2.5 text-left hover:bg-white/40 dark:hover:bg-white/5"
                      >
                        {isOpen ? (
                          <FaChevronDown size={11} className="text-slate-400" />
                        ) : (
                          <FaChevronRight size={11} className="text-slate-400" />
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-bold text-slate-800 dark:text-white">
                            {routeTrips.length > 1 && (
                              <span className="mr-1.5 rounded bg-slate-200 px-1.5 py-0.5 text-[10px] font-bold text-slate-600 dark:bg-slate-700 dark:text-slate-200">
                                ຖ້ຽວ {tripIndex + 1}
                              </span>
                            )}
                            {d.delivery_route_name || d.delivery_route_code}
                          </p>
                          <p className="truncate text-[11px] text-slate-500 dark:text-slate-400">
                            {d.origin_transport_name || "ບໍ່ກຳນົດສາຂາ"}
                            {d.driver_name ? ` · ${d.driver_name}` : ""}
                            {d.car_name ? ` · ${d.car_name}` : ""}
                          </p>
                        </div>
                        <span className="shrink-0 rounded bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                          {d.bill_count} ບິນ
                        </span>
                        {isActive && (
                          <span className="shrink-0 rounded bg-teal-600 px-2 py-0.5 text-[10px] font-bold text-white">
                            ກຳລັງເລືອກ
                          </span>
                        )}
                      </button>

                      {isOpen && (
                        <div className="space-y-3 border-t border-slate-200/50 px-3 py-3 dark:border-white/5">
                          {/* Bills first: what goes on the trip is decided before who drives it */}
                          {bills.length === 0 ? (
                            <p className="rounded border border-dashed border-slate-300 py-3 text-center text-[11px] text-slate-400 dark:border-slate-700">
                              ຍັງບໍ່ມີບິນ — ກົດ + ຢູ່ລາຍການທາງຂວາເພື່ອໃສ່
                            </p>
                          ) : (
                            <div className="space-y-1">
                              {bills.map((b) => (
                                <div
                                  key={b.doc_no}
                                  className="space-y-1.5 rounded border border-slate-200 bg-white px-2 py-1.5 dark:border-slate-800 dark:bg-slate-900"
                                >
                                <div className="flex items-center gap-2">
                                  <FaBoxOpen size={10} className="shrink-0 text-slate-400" />
                                  <div className="min-w-0 flex-1">
                                    <p className="truncate text-[11px] font-bold text-slate-800 dark:text-slate-100">
                                      {b.doc_no}
                                      <span className="ml-1.5 text-[10px] font-medium text-teal-600 dark:text-teal-400">
                                        {b.picked_item_count
                                          ? `${b.picked_item_count} ລາຍການ · ${b.picked_qty ?? 0}`
                                          : "ທັງບິນ"}
                                      </span>
                                    </p>
                                    <p className="truncate text-[10px] text-slate-500">
                                      {b.cust_name}
                                    </p>
                                    <p className="truncate text-[10px] font-medium text-sky-600 dark:text-sky-400">
                                      📍 ປາຍທາງ:{" "}
                                      {(b.delivery_condition ?? "to_customer") === "to_branch"
                                        ? branches.find(
                                            (br) => br.code === b.forward_transport_code
                                          )?.name_1 || "ຍັງບໍ່ເລືອກສາຂາ"
                                        : (b.delivery_condition ?? "to_customer") ===
                                            "to_customer"
                                          ? b.cust_area || "ບ້ານ/ຮ້ານລູກຄ້າ"
                                          :
                                          DELIVERY_CONDITIONS.find(
                                            (cond) =>
                                              cond.code ===
                                              (b.delivery_condition ?? "to_customer")
                                          )?.label ||
                                          "ສົ່ງລູກຄ້າ"}
                                    </p>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => void removeBill(d.draft_id, b.doc_no)}
                                    disabled={busy}
                                    className="shrink-0 cursor-pointer rounded p-1 text-rose-500 hover:bg-rose-50 disabled:opacity-40 dark:hover:bg-rose-950/30"
                                    title="ເອົາອອກຈາກຮ່າງ"
                                  >
                                    <FaTimes size={10} />
                                  </button>
                                </div>

                                {/* The goods themselves — a bill row that only
                                    said "3 ລາຍການ" hid what was being loaded. */}
                                {(() => {
                                  const picked =
                                    Array.isArray(b.items) && b.items.length > 0 ? b.items : null;
                                  const goods = picked ?? productsByBill[b.doc_no] ?? [];
                                  return (
                                    <div className="space-y-0.5 rounded bg-slate-50 px-2 py-1 dark:bg-slate-800/50">
                                      <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">
                                        {picked ? "ລາຍການທີ່ເລືອກ" : "ທັງບິນ (ຕາມຈຳນວນຄົງເຫຼືອ)"}
                                      </p>
                                      {goods.length === 0 ? (
                                        <p className="text-[10px] text-slate-400">ກຳລັງໂຫຼດລາຍການ...</p>
                                      ) : (
                                        goods.map((it) => (
                                          <div
                                            key={it.item_code}
                                            className="flex items-start justify-between gap-2 text-[10px]"
                                          >
                                            <span className="min-w-0 flex-1 break-words text-slate-600 dark:text-slate-300">
                                              {it.item_name}
                                            </span>
                                            <span className="shrink-0 font-bold tabular-nums text-slate-700 dark:text-slate-200">
                                              {it.qty} {it.unit_code}
                                            </span>
                                          </div>
                                        ))
                                      )}
                                    </div>
                                  );
                                })()}

                                {/* ຮັບເຄື່ອງ + ປາຍທາງ — same choices as the
                                    create-trip page, so a draft carries
                                    everything the trip needs. */}
                                <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 border-t border-slate-100 pt-2 dark:border-slate-800">
                                  <span className="text-[10px] font-bold text-slate-400">🏬 ຮັບເຄື່ອງ:</span>
                                  <select
                                    value={b.pickup_transport_code ?? ""}
                                    onChange={(e) =>
                                      void setBillOptions(d.draft_id, b.doc_no, {
                                        pickupTransportCode: e.target.value,
                                        deliveryCondition: b.delivery_condition,
                                        forwardTransportCode: b.forward_transport_code,
                                      })
                                    }
                                    className={`${CONTROL} w-[215px] max-w-full shrink-0 text-[11px] leading-normal`}
                                  >
                                    <option value="">ຄ່າເລີ່ມຕົ້ນ (ສາງຂອງບິນ)</option>
                                    {branches.map((br) => (
                                      <option key={br.code} value={br.code}>
                                        ສາງ {br.name_1}
                                      </option>
                                    ))}
                                    <option value={PICKUP_AT_CUSTOMER}>🏠 ບ້ານ/ຮ້ານລູກຄ້າ</option>
                                  </select>
                                  <span className="ml-1 text-[10px] font-bold text-slate-400">ປາຍທາງ:</span>
                                  {DELIVERY_CONDITIONS.map((cond) => {
                                    const on = (b.delivery_condition ?? "to_customer") === cond.code;
                                    return (
                                      <button
                                        key={cond.code}
                                        type="button"
                                        onClick={() =>
                                          void setBillOptions(d.draft_id, b.doc_no, {
                                            deliveryCondition: cond.code,
                                            pickupTransportCode: b.pickup_transport_code,
                                            forwardTransportCode:
                                              cond.code === "to_branch" ? b.forward_transport_code : "",
                                          })
                                        }
                                        className={`cursor-pointer rounded px-2.5 py-1.5 text-[11px] font-bold leading-normal transition-colors ${
                                          on
                                            ? "bg-teal-600 text-white"
                                            : "border border-slate-200 text-slate-500 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"
                                        }`}
                                      >
                                        {cond.label}
                                      </button>
                                    );
                                  })}
                                  {(b.delivery_condition ?? "") === "to_branch" && (
                                    <select
                                      value={b.forward_transport_code ?? ""}
                                      onChange={(e) =>
                                        void setBillOptions(d.draft_id, b.doc_no, {
                                          deliveryCondition: "to_branch",
                                          forwardTransportCode: e.target.value,
                                          pickupTransportCode: b.pickup_transport_code,
                                        })
                                      }
                                      className={`${CONTROL} w-[190px] max-w-full shrink-0 text-[11px] leading-normal`}
                                    >
                                      <option value="">- ເລືອກສາຂາປາຍທາງ -</option>
                                      {branches.map((br) => (
                                        <option key={br.code} value={br.code}>
                                          {br.name_1}
                                        </option>
                                      ))}
                                    </select>
                                  )}
                                </div>
                                </div>
                              ))}
                            </div>
                          )}

                          {/* Crew — chosen last, when it is time to leave.
                              Same controls as ອອກໃບງານ: search the car, and
                              picking it fills in that car's usual driver and
                              crew (getCarDefaults), which is how the trip page
                              already works. */}
                          <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50/60 p-2 dark:border-slate-800 dark:bg-slate-800/30">
                            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                              ພາຫະນະ ແລະ ທີມງານ
                            </p>
                            <div className="mb-2">
                              <label className="mb-1 block text-[10px] font-semibold text-slate-500">
                                <FaTruck className="mr-1 inline" size={9} /> ສາຂາຂົນສົ່ງ (ຂອງຖ້ຽວ)
                              </label>
                              <select
                                value={d.origin_transport_code}
                                onChange={(e) =>
                                  void setCrew(d.draft_id, { originTransportCode: e.target.value })
                                }
                                className={`${CONTROL} w-full sm:w-1/2`}
                              >
                                <option value="">- ຍັງບໍ່ກຳນົດ (ຈະເອົາຕາມບິນ) -</option>
                                {branches.map((b2) => (
                                  <option key={b2.code} value={b2.code}>
                                    {b2.name_1}
                                  </option>
                                ))}
                              </select>
                            </div>
                            <div className="grid gap-2 sm:grid-cols-2">
                              <SearchPicker
                                label="ລົດ"
                                icon={<FaTruck size={9} />}
                                options={cars}
                                value={d.car}
                                valueLabel={d.car_name}
                                placeholder="ຄົ້ນຫາລົດ..."
                                onPick={(code) => void pickCar(d.draft_id, code)}
                              />
                              <SearchPicker
                                label="ຄົນຂັບ"
                                icon={<FaUserTie size={9} />}
                                options={drivers}
                                value={d.driver}
                                valueLabel={d.driver_name}
                                placeholder="ຄົ້ນຫາຄົນຂັບ..."
                                onPick={(code) => void setCrew(d.draft_id, { driver: code })}
                              />
                            </div>
                            <WorkerPicker
                              options={workers.filter((w) => w.code !== d.driver)}
                              selected={(d.workers ?? "").split(",").filter(Boolean)}
                              onToggle={(code) => void toggleWorker(d, code)}
                            />
                          </div>

                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() => void dispatchDraft(d)}
                              disabled={busy || !ready}
                              title={
                                ready
                                  ? ""
                                  : "ຕ້ອງມີບິນ + ລົດ + ຄົນຂັບ ກ່ອນຈຶ່ງພ້ອມອອກໄດ້"
                              }
                              className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-[11px] font-bold text-white transition-colors hover:bg-emerald-700 disabled:opacity-40"
                            >
                              <FaPaperPlane size={10} /> ພ້ອມອອກ
                            </button>
                            <button
                              type="button"
                              onClick={() => void deleteDraft(d)}
                              disabled={busy}
                              className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-rose-200 px-3 py-1.5 text-[11px] font-bold text-rose-600 transition-colors hover:bg-rose-50 disabled:opacity-40 dark:border-rose-900 dark:hover:bg-rose-950/30"
                            >
                              <FaTimes size={10} /> ລຶບຮ່າງ
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
                  </div>
                ))}
              </div>
                ))}
              </div>
            ))
          )}
        </div>

        {/* Bill pool for the day */}
        <div className="glass h-fit rounded-lg">
          <div className="border-b border-slate-200/50 px-3 py-2.5 dark:border-white/5">
            <p className="text-xs font-bold text-slate-700 dark:text-slate-200">
              ບິນລໍຈັດຖ້ຽວ ({candidatesForDraft.length})
              {draftedBills.size > 0 && (
                <span className="ml-1.5 text-[10px] font-medium text-slate-400">
                  · ຢູ່ໃນຮ່າງແລ້ວ{" "}
                  {candidatesForDraft.filter((c) => draftedBills.has(c.doc_no)).length}
                </span>
              )}
            </p>
            <p className="text-[10px] text-slate-400">
              {isBranchStaff
                ? "ບິນ pending ຂອງສາຂາທ່ານ · ບໍ່ກອງວັນຈັດສົ່ງ, ບໍ່ກອງຮອບ/ສາຍ"
                : "ບິນ pending ທັງໝົດ · ບໍ່ກອງວັນຈັດສົ່ງ, ບໍ່ກອງຮອບ/ສາຍ"}
            </p>
            {activeBranch && !isBranchStaff && (
              <label className="mt-1.5 flex cursor-pointer select-none items-center gap-1.5 text-[10px] font-semibold text-slate-500 dark:text-slate-400">
                <input
                  type="checkbox"
                  checked={lockToDraftBranch}
                  onChange={(e) => setLockToDraftBranch(e.target.checked)}
                  className="h-3 w-3 accent-teal-600"
                />
                ສະເພາະສາຂາຂອງຮ່າງ
                {!lockToDraftBranch && " (ປິດຢູ່ — ເຫັນທຸກສາຂາ)"}
              </label>
            )}
            <div className="mt-2 flex gap-1">
              <button
                type="button"
                onClick={() => setPoolTab("dated")}
                className={`flex-1 cursor-pointer rounded-md px-2 py-1.5 text-[10px] font-bold transition-colors ${
                  poolTab === "dated"
                    ? "bg-teal-600 text-white"
                    : "bg-slate-100 text-slate-500 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400"
                }`}
              >
                ລໍຈັດຖ້ຽວ ({datedCount})
              </button>
              <button
                type="button"
                onClick={() => setPoolTab("undated")}
                className={`flex-1 cursor-pointer rounded-md px-2 py-1.5 text-[10px] font-bold transition-colors ${
                  poolTab === "undated"
                    ? "bg-amber-500 text-white"
                    : "bg-slate-100 text-slate-500 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400"
                }`}
              >
                ພະນັກຂາຍຍັງບໍ່ບອກວັນສົ່ງ (
                {
                  candidatesForDraft.filter(
                    (c) => !draftedBills.has(c.doc_no) && isSalesPending(c)
                  ).length
                })
              </button>
            </div>
            <p className="mt-0.5 text-[10px] text-slate-400">
              {activeDraftRow
                ? `ໃສ່ຮ່າງ: ${
                    activeDraftRow.delivery_route_name || activeDraftRow.delivery_route_code
                  } · ${activeDraftRow.date_logistic_display}`
                : `ວັນ ${workDay} — ເລືອກຮ່າງຖ້ຽວທາງຊ້າຍກ່ອນ`}
            </p>
            <div className="relative mt-2">
              <FaSearch className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[11px] text-slate-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="ຄົ້ນຫາເລກບິນ, ລູກຄ້າ, ທີ່ຢູ່..."
                className={`${CONTROL} w-full pl-8`}
              />
            </div>
          </div>
          <div className="max-h-[70vh] space-y-1.5 overflow-y-auto p-3">
            {filteredCandidates.length === 0 ? (
              <div className="py-8 text-center">
                <p className="text-xs text-slate-400">
                  {candidates.length === 0
                    ? "ບໍ່ມີບິນລໍຈັດຖ້ຽວ"
                    : poolTab === "dated"
                    ? "ບິນທັງໝົດຢູ່ໃນ tab ‘ພະນັກຂາຍຍັງບໍ່ບອກວັນສົ່ງ’"
                    : "ບໍ່ມີບິນທີ່ພະນັກຂາຍຍັງບໍ່ບອກວັນສົ່ງ"}
                </p>
                {activeBranch && lockToDraftBranch && (
                  <button
                    type="button"
                    onClick={() => setLockToDraftBranch(false)}
                    className="mt-2 cursor-pointer text-[11px] font-bold text-teal-600 underline dark:text-teal-400"
                  >
                    ເບິ່ງບິນທຸກສາຂາ
                  </button>
                )}
              </div>
            ) : (
              filteredCandidates.map((c) => (
                <Fragment key={c.doc_no}>
                  <div
                    draggable
                    onDragStart={(e) => {
                      setDraggingBill(c.doc_no);
                      e.dataTransfer.setData("text/plain", c.doc_no);
                      e.dataTransfer.effectAllowed = "move";
                    }}
                    onDragEnd={() => {
                      setDraggingBill(null);
                      setDragOverDraft(null);
                    }}
                    className={`flex cursor-grab items-center gap-2 rounded-md border border-slate-200 bg-white px-2.5 py-2 active:cursor-grabbing dark:border-slate-800 dark:bg-slate-900 ${
                      draggingBill === c.doc_no ? "opacity-40" : ""
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-bold text-slate-800 dark:text-slate-100">
                        {c.doc_no}
                        <span className="ml-1.5 text-[10px] font-medium text-slate-400">
                          {c.remaining_count ?? c.count_item ?? 0} ລາຍການ
                        </span>
                      </p>
                      <p className="truncate text-[10px] text-slate-500">
                        {c.transport_name || c.cust_name}
                      </p>
                      <p className="truncate text-[10px] font-medium text-sky-600 dark:text-sky-400">
                        📍 ປາຍທາງ: {c.cust_area || "ບ້ານ/ຮ້ານລູກຄ້າ"}
                      </p>
                      <p
                        className={`truncate text-[10px] font-semibold ${
                          isSalesPending(c)
                            ? "text-amber-600 dark:text-amber-400"
                            : "text-slate-400"
                        }`}
                      >
                        {isSalesPending(c)
                          ? `⚠️ ຍັງບໍ່ບອກວັນສົ່ງ · ເປີດ ${c.doc_date}`
                          : `📅 ${c.scheduled_date_display || c.doc_date}`}
                        {c.sale ? ` · ${c.sale}` : ""}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => addBill(c.doc_no)}
                      disabled={busy || !activeDraft}
                      className="flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded bg-teal-600 text-white transition-colors hover:bg-teal-700 disabled:opacity-30"
                      title={activeDraft ? "ໃສ່ຮ່າງທີ່ເລືອກ" : "ເລືອກຮ່າງກ່ອນ"}
                    >
                      {busy ? <FaSpinner className="animate-spin" size={10} /> : <FaCheck size={10} />}
                    </button>
                  </div>
                </Fragment>
              ))
            )}
          </div>
        </div>
      </div>

      {pendingAdd && (
        <BillItemPicker
          billNo={pendingAdd.docNo}
          custName={pendingAdd.custName}
          onCancel={() => setPendingAdd(null)}
          onConfirm={commitAdd}
        />
      )}
    </div>
  );
}

// Searchable single-select, the same interaction the ອອກໃບງານ page uses: type
// to filter, click to choose. A plain <select> listing every car or driver is
// unusable once the fleet grows past a screenful.
function SearchPicker({
  label,
  icon,
  options,
  value,
  valueLabel,
  placeholder,
  onPick,
}: {
  label: string;
  icon: React.ReactNode;
  options: Option[];
  value: string;
  valueLabel: string;
  placeholder: string;
  onPick: (code: string) => void;
}) {
  const [term, setTerm] = useState("");
  const [open, setOpen] = useState(false);
  const shown = options
    .filter(
      (o) =>
        !term.trim() ||
        o.name_1.toLowerCase().includes(term.toLowerCase()) ||
        o.code.toLowerCase().includes(term.toLowerCase())
    )
    .slice(0, 40);

  return (
    <div className="relative">
      <label className="mb-1 block text-[10px] font-semibold text-slate-500">
        <span className="mr-1 inline-block align-middle">{icon}</span> {label}
      </label>
      <input
        type="text"
        value={open ? term : valueLabel || ""}
        placeholder={placeholder}
        onFocus={() => {
          setOpen(true);
          setTerm("");
        }}
        onChange={(e) => setTerm(e.target.value)}
        onBlur={() => window.setTimeout(() => setOpen(false), 150)}
        className={`${CONTROL} w-full`}
      />
      {value && !open && (
        <button
          type="button"
          onClick={() => onPick("")}
          className="absolute right-2 top-[26px] cursor-pointer text-slate-400 hover:text-rose-500"
          title="ລ້າງ"
        >
          <FaTimes size={10} />
        </button>
      )}
      {open && (
        <div className="absolute z-20 mt-1 max-h-48 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-900">
          {shown.length === 0 ? (
            <p className="px-3 py-2 text-[11px] text-slate-400">ບໍ່ພົບ</p>
          ) : (
            shown.map((o) => (
              <button
                key={o.code}
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  onPick(o.code);
                  setOpen(false);
                }}
                className={`block w-full cursor-pointer px-3 py-1.5 text-left text-[11px] hover:bg-teal-50 dark:hover:bg-teal-950/30 ${
                  o.code === value
                    ? "bg-teal-50 font-bold text-teal-700 dark:bg-teal-950/40 dark:text-teal-300"
                    : "text-slate-700 dark:text-slate-200"
                }`}
              >
                {o.name_1}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

// Workers: search to add, chips to remove. Listing the whole crew as chips
// buried the few who are actually on the trip.
function WorkerPicker({
  options,
  selected,
  onToggle,
}: {
  options: Option[];
  selected: string[];
  onToggle: (code: string) => void;
}) {
  const [term, setTerm] = useState("");
  const [open, setOpen] = useState(false);
  const picked = options.filter((o) => selected.includes(o.code));
  const shown = options
    .filter((o) => !selected.includes(o.code))
    .filter((o) => !term.trim() || o.name_1.toLowerCase().includes(term.toLowerCase()))
    .slice(0, 40);

  return (
    <div className="relative">
      <label className="mb-1 block text-[10px] font-semibold text-slate-500">
        <FaUsers className="mr-1 inline" size={9} /> ກຳມະກອນ ({picked.length})
      </label>
      {picked.length > 0 && (
        <div className="mb-1 flex flex-wrap gap-1">
          {picked.map((w) => (
            <button
              key={w.code}
              type="button"
              onClick={() => onToggle(w.code)}
              className="inline-flex cursor-pointer items-center gap-1 rounded-full bg-teal-600 px-2 py-0.5 text-[10px] font-semibold text-white"
              title="ເອົາອອກ"
            >
              {w.name_1} <FaTimes size={8} />
            </button>
          ))}
        </div>
      )}
      <input
        type="text"
        value={term}
        placeholder="ຄົ້ນຫາເພື່ອເພີ່ມກຳມະກອນ..."
        onFocus={() => setOpen(true)}
        onChange={(e) => setTerm(e.target.value)}
        onBlur={() => window.setTimeout(() => setOpen(false), 150)}
        className={`${CONTROL} w-full`}
      />
      {open && (
        <div className="absolute z-20 mt-1 max-h-44 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-900">
          {shown.length === 0 ? (
            <p className="px-3 py-2 text-[11px] text-slate-400">ບໍ່ພົບ</p>
          ) : (
            shown.map((o) => (
              <button
                key={o.code}
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  onToggle(o.code);
                  setTerm("");
                }}
                className="block w-full cursor-pointer px-3 py-1.5 text-left text-[11px] text-slate-700 hover:bg-teal-50 dark:text-slate-200 dark:hover:bg-teal-950/30"
              >
                {o.name_1}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

// Item picker shown when a bill is dropped into a draft: tick the lines that go
// on this trip and set how much of each. Quantities default to everything still
// owed, so the common "send it all" case is one tap.
function BillItemPicker({
  billNo,
  custName,
  onCancel,
  onConfirm,
}: {
  billNo: string;
  custName: string;
  onCancel: () => void;
  onConfirm: (items: Product[]) => void;
}) {
  const [products, setProducts] = useState<Product[]>([]);
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [qty, setQty] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    void Actions.getAvailableBillProducts(billNo)
      .then((rows) => {
        if (!alive) return;
        const list = (rows ?? []) as Product[];
        setProducts(list);
        setChecked(Object.fromEntries(list.map((p) => [p.item_code, true])));
        setQty(Object.fromEntries(list.map((p) => [p.item_code, String(p.qty)])));
      })
      .catch((e) => alive && setError(String((e as Error)?.message ?? e)))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [billNo]);

  const allOn = products.length > 0 && products.every((p) => checked[p.item_code]);
  const picked = products.filter((p) => checked[p.item_code]);
  const total = picked.reduce((sum, p) => {
    const v = Number(qty[p.item_code]);
    return sum + (Number.isFinite(v) ? Math.max(0, Math.min(v, p.qty)) : 0);
  }, 0);

  const confirm = () => {
    const items = picked
      .map((p) => {
        const v = Number(qty[p.item_code]);
        return {
          ...p,
          qty: Number.isFinite(v) ? Math.max(0, Math.min(v, p.qty)) : p.qty,
        };
      })
      .filter((p) => p.qty > 0);
    if (items.length === 0) {
      setError("ເລືອກຢ່າງໜ້ອຍ 1 ລາຍການ ແລະ ຈຳນວນຕ້ອງຫຼາຍກວ່າ 0");
      return;
    }
    // Everything at full quantity = "whole bill"; keep it empty so the trip
    // picks up whatever is still owed at dispatch time.
    const whole =
      items.length === products.length && items.every((p) => p.qty === products.find((x) => x.item_code === p.item_code)?.qty);
    onConfirm(whole ? [] : items);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
      <div className="w-full max-w-lg rounded-xl bg-white shadow-xl dark:bg-slate-900">
        <div className="flex items-start justify-between border-b border-slate-200 px-4 py-3 dark:border-slate-800">
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-slate-800 dark:text-white">{billNo}</p>
            <p className="truncate text-[11px] text-slate-500">{custName}</p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="cursor-pointer rounded p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <FaTimes size={12} />
          </button>
        </div>

        <div className="max-h-[55vh] overflow-y-auto px-4 py-3">
          {loading ? (
            <p className="py-8 text-center text-xs text-slate-500">
              <FaSpinner className="mr-2 inline animate-spin" /> ກຳລັງໂຫຼດລາຍການ...
            </p>
          ) : products.length === 0 ? (
            <p className="py-8 text-center text-xs text-slate-500">ບໍ່ມີສິນຄ້າຄົງເຫຼືອທີ່ຕ້ອງສົ່ງ</p>
          ) : (
            <>
              <div className="mb-2 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() =>
                    setChecked(Object.fromEntries(products.map((p) => [p.item_code, !allOn])))
                  }
                  className="inline-flex cursor-pointer items-center gap-1.5 text-[11px] font-bold text-slate-600 dark:text-slate-300"
                >
                  <span
                    className={`flex h-4 w-4 items-center justify-center rounded ${
                      allOn
                        ? "bg-teal-600 text-white"
                        : "border border-slate-300 dark:border-slate-600"
                    }`}
                  >
                    {allOn && <FaCheck size={8} />}
                  </span>
                  ເລືອກທັງໝົດ
                </button>
                <span className="text-[10px] font-semibold text-slate-400">
                  ເລືອກ {picked.length}/{products.length} · ລວມ {total}
                </span>
              </div>
              <div className="space-y-1">
                {products.map((p) => {
                  const on = !!checked[p.item_code];
                  return (
                    <div
                      key={p.item_code}
                      className={`flex items-center gap-2 rounded border px-2 py-1.5 ${
                        on
                          ? "border-teal-200 bg-teal-50/60 dark:border-teal-900 dark:bg-teal-950/20"
                          : "border-slate-200 dark:border-slate-800"
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => setChecked((c) => ({ ...c, [p.item_code]: !on }))}
                        className={`flex h-5 w-5 shrink-0 cursor-pointer items-center justify-center rounded ${
                          on
                            ? "bg-teal-600 text-white"
                            : "border border-slate-300 dark:border-slate-600"
                        }`}
                      >
                        {on && <FaCheck size={9} />}
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
                        value={qty[p.item_code] ?? ""}
                        disabled={!on}
                        onChange={(e) => setQty((q) => ({ ...q, [p.item_code]: e.target.value }))}
                        className={`${CONTROL} h-7 w-16 text-center disabled:opacity-40`}
                      />
                    </div>
                  );
                })}
              </div>
            </>
          )}
          {error && <p className="mt-2 text-[11px] text-rose-600">{error}</p>}
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-200 px-4 py-3 dark:border-slate-800">
          <button
            type="button"
            onClick={onCancel}
            className="cursor-pointer rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            ຍົກເລີກ
          </button>
          <button
            type="button"
            onClick={confirm}
            disabled={loading || products.length === 0}
            className="cursor-pointer rounded-lg bg-teal-600 px-4 py-1.5 text-xs font-bold text-white hover:bg-teal-700 disabled:opacity-40"
          >
            ໃສ່ຮ່າງ ({picked.length})
          </button>
        </div>
      </div>
    </div>
  );
}
