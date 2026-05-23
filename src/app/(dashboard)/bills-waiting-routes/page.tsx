"use client";

import { useEffect, useMemo, useState } from "react";
import {
  FaBox,
  FaCalendarAlt,
  FaChevronDown,
  FaChevronRight,
  FaClock,
  FaFileInvoice,
  FaRoute,
  FaSearch,
  FaSpinner,
} from "react-icons/fa";
import { Actions } from "@/lib/api";
import { StatusPageHeader, StatusStatGrid } from "@/components/status-page-shell";

interface WaitingRouteBill {
  doc_no: string;
  doc_date: string;
  cust_code: string;
  cust_name: string;
  telephone: string;
  count_item: number | string;
  scheduled_date?: string | null;
  scheduled_date_display?: string | null;
  delivery_route_code?: string | null;
  delivery_round_code?: string | null;
  delivery_round_name?: string | null;
  delivery_round_time_label?: string | null;
  incoming_forwarded?: boolean;
  forward_from_transport_name?: string;
  forwarded_at?: string;
  planned_lat?: string | null;
  planned_lng?: string | null;
}

interface DeliveryRoute {
  code: string;
  name: string;
  origin_lat?: number | null;
  origin_lng?: number | null;
}

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function billDistanceFromRoute(bill: WaitingRouteBill, route: DeliveryRoute | undefined) {
  if (!route?.origin_lat || !route?.origin_lng) return null;
  const lat = Number(bill.planned_lat ?? "");
  const lng = Number(bill.planned_lng ?? "");
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || (lat === 0 && lng === 0)) return null;
  return haversineKm(Number(route.origin_lat), Number(route.origin_lng), lat, lng);
}

interface Product {
  item_code: string;
  item_name: string;
  qty: number | string;
  unit_code: string;
}

interface RoundBillGroup {
  key: string;
  time: string;
  roundName: string;
  bills: WaitingRouteBill[];
  itemCount: number;
}

interface DateBillGroup {
  key: string;
  date: string;
  rounds: RoundBillGroup[];
  billCount: number;
  itemCount: number;
}

interface RouteBillGroup {
  key: string;
  routeCode: string;
  routeName: string;
  dates: DateBillGroup[];
  billCount: number;
  itemCount: number;
}

function toNumber(value: number | string | null | undefined) {
  return Number(value ?? 0);
}

function billGroupLabel(bill: WaitingRouteBill, routeMap: Map<string, DeliveryRoute>) {
  const routeCode = bill.delivery_route_code?.trim() || "none";
  const route = routeMap.get(routeCode);
  return {
    routeCode,
    routeName: route?.name || bill.delivery_route_code?.trim() || "ບໍ່ກຳນົດເສັ້ນທາງ",
    date: bill.scheduled_date_display || bill.scheduled_date || "-",
    time: bill.delivery_round_time_label?.trim() || "-",
    roundName:
      bill.delivery_round_name?.trim() ||
      bill.delivery_round_code?.trim() ||
      "ບໍ່ກຳນົດຮອບ",
  };
}

export default function BillsWaitingRoutesPage() {
  const [bills, setBills] = useState<WaitingRouteBill[]>([]);
  const [routes, setRoutes] = useState<DeliveryRoute[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchText, setSearchText] = useState("");
  const [selectedRoute, setSelectedRoute] = useState("all");
  const [expandedBill, setExpandedBill] = useState<string | null>(null);
  const [productsByBill, setProductsByBill] = useState<Record<string, Product[]>>({});
  const [loadingProducts, setLoadingProducts] = useState<string | null>(null);
  const [sortByDistance, setSortByDistance] = useState(false);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    void Promise.all([
      Actions.getAvailableBills() as Promise<WaitingRouteBill[]>,
      Actions.listDeliveryRoutes(true) as Promise<DeliveryRoute[]>,
    ])
      .then(([billRows, routeRows]) => {
        if (!alive) return;
        setBills(billRows ?? []);
        setRoutes(routeRows ?? []);
      })
      .catch((error) => {
        console.error(error);
        if (!alive) return;
        setBills([]);
        setRoutes([]);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  const routeMap = useMemo(
    () => new Map(routes.map((route) => [route.code, route])),
    [routes]
  );

  const routeOptions = useMemo(() => {
    const map = new Map<string, string>();
    bills.forEach((bill) => {
      const label = billGroupLabel(bill, routeMap);
      if (label.routeCode !== "none") map.set(label.routeCode, label.routeName);
    });
    return Array.from(map.entries())
      .map(([code, name]) => ({ code, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [bills, routeMap]);

  const filteredBills = useMemo(() => {
    const keyword = searchText.trim().toLowerCase();
    return bills
      .filter((bill) => bill.scheduled_date && bill.delivery_route_code && bill.delivery_round_code)
      .filter((bill) => selectedRoute === "all" || bill.delivery_route_code === selectedRoute)
      .filter((bill) => {
        if (!keyword) return true;
        const label = billGroupLabel(bill, routeMap);
        return [
          bill.doc_no,
          bill.doc_date,
          bill.cust_code,
          bill.cust_name,
          bill.telephone,
          label.routeName,
          label.roundName,
          label.time,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(keyword);
      });
  }, [bills, routeMap, searchText, selectedRoute]);

  const routeGroups = useMemo<RouteBillGroup[]>(() => {
    const routeMapByKey = new Map<string, RouteBillGroup>();
    const dateMapByKey = new Map<string, DateBillGroup>();
    const roundMapByKey = new Map<string, RoundBillGroup>();

    filteredBills.forEach((bill) => {
      const label = billGroupLabel(bill, routeMap);
      const routeKey = label.routeCode;
      const dateKey = `${routeKey}|${label.date}`;
      const roundKey = `${dateKey}|${label.time}|${label.roundName}`;
      const itemCount = toNumber(bill.count_item);

      let routeGroup = routeMapByKey.get(routeKey);
      if (!routeGroup) {
        routeGroup = {
          key: routeKey,
          routeCode: label.routeCode,
          routeName: label.routeName,
          dates: [],
          billCount: 0,
          itemCount: 0,
        };
        routeMapByKey.set(routeKey, routeGroup);
      }

      let dateGroup = dateMapByKey.get(dateKey);
      if (!dateGroup) {
        dateGroup = {
          key: dateKey,
          date: label.date,
          rounds: [],
          billCount: 0,
          itemCount: 0,
        };
        dateMapByKey.set(dateKey, dateGroup);
        routeGroup.dates.push(dateGroup);
      }

      let roundGroup = roundMapByKey.get(roundKey);
      if (!roundGroup) {
        roundGroup = {
          key: roundKey,
          time: label.time,
          roundName: label.roundName,
          bills: [],
          itemCount: 0,
        };
        roundMapByKey.set(roundKey, roundGroup);
        dateGroup.rounds.push(roundGroup);
      }

      routeGroup.billCount += 1;
      routeGroup.itemCount += itemCount;
      dateGroup.billCount += 1;
      dateGroup.itemCount += itemCount;
      roundGroup.bills.push(bill);
      roundGroup.itemCount += itemCount;
    });

    const result = Array.from(routeMapByKey.values())
      .map((routeGroup) => ({
        ...routeGroup,
        dates: routeGroup.dates
          .map((dateGroup) => ({
            ...dateGroup,
            rounds: dateGroup.rounds.sort((a, b) => {
              const timeOrder = a.time.localeCompare(b.time);
              if (timeOrder !== 0) return timeOrder;
              return a.roundName.localeCompare(b.roundName);
            }),
          }))
          .sort((a, b) => a.date.localeCompare(b.date)),
      }))
      .sort((a, b) => a.routeName.localeCompare(b.routeName));

    if (sortByDistance) {
      for (const routeGroup of result) {
        const route = routeMap.get(routeGroup.routeCode);
        for (const dateGroup of routeGroup.dates) {
          for (const roundGroup of dateGroup.rounds) {
            roundGroup.bills.sort((a, b) => {
              const da = billDistanceFromRoute(a, route);
              const db = billDistanceFromRoute(b, route);
              if (da == null && db == null) return a.doc_no.localeCompare(b.doc_no);
              if (da == null) return 1;
              if (db == null) return -1;
              return da - db;
            });
          }
        }
      }
    }
    return result;
  }, [filteredBills, routeMap, sortByDistance]);

  const summary = useMemo(
    () =>
      routeGroups.reduce(
        (acc, group) => {
          acc.routes += 1;
          acc.groups += group.dates.reduce((sum, date) => sum + date.rounds.length, 0);
          acc.bills += group.billCount;
          acc.items += group.itemCount;
          return acc;
        },
        { routes: 0, groups: 0, bills: 0, items: 0 }
      ),
    [routeGroups]
  );

  const toggleProducts = async (billNo: string) => {
    if (expandedBill === billNo) {
      setExpandedBill(null);
      return;
    }

    setExpandedBill(billNo);
    if (productsByBill[billNo]) return;

    setLoadingProducts(billNo);
    try {
      const rows = await Actions.getAvailableBillProducts(billNo);
      setProductsByBill((current) => ({
        ...current,
        [billNo]: (rows ?? []) as Product[],
      }));
    } catch (error) {
      console.error(error);
      setProductsByBill((current) => ({ ...current, [billNo]: [] }));
    } finally {
      setLoadingProducts(null);
    }
  };

  return (
    <div className="space-y-5">
      <StatusPageHeader
        title="ບິນລໍຖ້າຈັດຖ້ຽວຕາມເສັ້ນທາງ"
        subtitle="ເສັ້ນທາງ + ວັນທີ + ຮອບ + ລາຍການບິນ"
        icon={<FaRoute />}
        tone="emerald"
      />

      <StatusStatGrid
        stats={[
          { label: "ເສັ້ນທາງ", value: summary.routes, icon: <FaRoute />, tone: "emerald" },
          { label: "ກຸ່ມວັນທີ/ຮອບ", value: summary.groups, icon: <FaClock />, tone: "sky" },
          { label: "ບິນລໍຖ້າຈັດຖ້ຽວ", value: summary.bills, icon: <FaFileInvoice />, tone: "amber" },
          { label: "ລາຍການສິນຄ້າ", value: summary.items, icon: <FaBox />, tone: "slate" },
        ]}
      />

      <section className="rounded-lg border border-slate-200/50 bg-white/70 p-4 shadow-sm dark:border-white/10 dark:bg-white/[0.04]">
        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_260px]">
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-slate-600 dark:text-slate-300">
              <FaSearch className="mr-1.5 inline text-slate-400" size={11} />
              ຄົ້ນຫາ
            </span>
            <input
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
              placeholder="ຄົ້ນຫາເລກບິນ, ລູກຄ້າ, ເສັ້ນທາງ..."
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 outline-none transition-all focus:border-emerald-400 focus:ring-2 focus:ring-emerald-500/20 dark:border-white/10 dark:bg-slate-950 dark:text-slate-200"
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-slate-600 dark:text-slate-300">
              <FaRoute className="mr-1.5 inline text-slate-400" size={11} />
              ເສັ້ນທາງ
            </span>
            <select
              value={selectedRoute}
              onChange={(event) => setSelectedRoute(event.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 outline-none transition-all focus:border-emerald-400 focus:ring-2 focus:ring-emerald-500/20 dark:border-white/10 dark:bg-slate-950 dark:text-slate-200"
            >
              <option value="all">ທັງໝົດ</option>
              {routeOptions.map((route) => (
                <option key={route.code} value={route.code}>
                  {route.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="mt-3 flex items-center justify-end">
          <label className="inline-flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={sortByDistance}
              onChange={(e) => setSortByDistance(e.target.checked)}
              className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
            />
            <span className="text-[11px] text-slate-600 dark:text-slate-300">
              ຈັດຮຽງຕາມໄລຍະທາງຈາກຕົ້ນທາງ (ໃກ້→ໄກ)
            </span>
          </label>
        </div>
      </section>

      {loading ? (
        <div className="rounded-lg border border-slate-200/50 bg-white/70 py-14 text-center text-xs text-slate-400 shadow-sm dark:border-white/10 dark:bg-white/[0.04]">
          <FaSpinner className="mx-auto mb-2 animate-spin" size={18} />
          ກຳລັງໂຫຼດ...
        </div>
      ) : routeGroups.length === 0 ? (
        <div className="rounded-lg border border-slate-200/50 bg-white/70 py-14 text-center text-xs text-slate-400 shadow-sm dark:border-white/10 dark:bg-white/[0.04]">
          ບໍ່ມີບິນລໍຖ້າຈັດຖ້ຽວທີ່ກຳນົດເສັ້ນທາງແລະຮອບແລ້ວ
        </div>
      ) : (
        <div className="space-y-5">
          {routeGroups.map((routeGroup) => (
            <section
              key={routeGroup.key}
              className="overflow-hidden rounded-lg border border-slate-200/60 bg-white shadow-sm dark:border-white/10 dark:bg-slate-900"
            >
              <div className="border-b border-slate-200/60 bg-emerald-50/80 px-4 py-3 dark:border-white/10 dark:bg-emerald-950/20">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 text-base font-bold text-slate-800 dark:text-white">
                      <FaRoute className="shrink-0 text-emerald-600 dark:text-emerald-400" size={13} />
                      <span className="truncate">{routeGroup.routeName}</span>
                    </p>
                    <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                      {routeGroup.dates.length} ວັນທີ · {routeGroup.billCount} ບິນ · {routeGroup.itemCount} ລາຍການ
                    </p>
                  </div>
                  <span className="shrink-0 rounded-full bg-emerald-600 px-3 py-1 text-[11px] font-bold text-white">
                    ເສັ້ນທາງ
                  </span>
                </div>
              </div>

              <div className="space-y-4 p-4">
                {routeGroup.dates.map((dateGroup) => (
                  <div
                    key={dateGroup.key}
                    className="rounded-lg border border-slate-200/60 bg-slate-50/70 dark:border-white/10 dark:bg-slate-950/40"
                  >
                    <div className="flex flex-col gap-1 border-b border-slate-200/60 px-3 py-2 dark:border-white/10 sm:flex-row sm:items-center sm:justify-between">
                      <p className="flex items-center gap-2 text-sm font-bold text-slate-800 dark:text-white">
                        <FaCalendarAlt className="text-slate-400" size={12} />
                        {dateGroup.date}
                      </p>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">
                        {dateGroup.rounds.length} ຮອບ · {dateGroup.billCount} ບິນ
                      </p>
                    </div>

                    <div className="space-y-3 p-3">
                      {dateGroup.rounds.map((roundGroup) => (
                        <div
                          key={roundGroup.key}
                          className="overflow-hidden rounded-lg border border-slate-200/70 bg-white dark:border-white/10 dark:bg-slate-900"
                        >
                          <div className="flex flex-col gap-1 border-b border-slate-200/60 px-3 py-2 dark:border-white/10 sm:flex-row sm:items-center sm:justify-between">
                            <p className="flex items-center gap-2 text-xs font-bold text-slate-700 dark:text-slate-200">
                              <FaClock className="text-amber-500" size={11} />
                              {roundGroup.roundName}
                              <span className="font-medium text-slate-400">({roundGroup.time})</span>
                            </p>
                            <p className="text-[11px] font-semibold text-amber-700 dark:text-amber-400">
                              {roundGroup.bills.length} ບິນ · {roundGroup.itemCount} ລາຍການ
                            </p>
                          </div>

                          <div className="divide-y divide-slate-200/60 dark:divide-white/10">
                            {roundGroup.bills.map((bill) => {
                              const route = routeMap.get(routeGroup.routeCode);
                              const distanceKm = billDistanceFromRoute(bill, route);
                              return (
                              <div key={bill.doc_no}>
                                <div className="px-3 py-3">
                                  <button
                                    type="button"
                                    onClick={() => void toggleProducts(bill.doc_no)}
                                    className="w-full min-w-0 text-left"
                                  >
                                    <div className="flex flex-wrap items-center gap-2">
                                      <span className="flex h-5 w-5 items-center justify-center rounded-md bg-slate-100 text-slate-500 dark:bg-white/10 dark:text-slate-300">
                                        {expandedBill === bill.doc_no ? (
                                          <FaChevronDown size={10} />
                                        ) : (
                                          <FaChevronRight size={10} />
                                        )}
                                      </span>
                                      <p className="font-mono text-sm font-bold text-slate-800 dark:text-white">
                                        {bill.doc_no}
                                      </p>
                                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500 dark:bg-white/10 dark:text-slate-300">
                                        {toNumber(bill.count_item)} ລາຍການ
                                      </span>
                                      {distanceKm != null && (
                                        <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:text-emerald-400">
                                          {distanceKm < 1 ? `${Math.round(distanceKm * 1000)} m` : `${distanceKm.toFixed(1)} km`}
                                        </span>
                                      )}
                                      {bill.incoming_forwarded && (
                                        <span className="rounded-full bg-sky-500/10 px-2 py-0.5 text-[10px] font-semibold text-sky-700 dark:text-sky-400">
                                          ສົ່ງຕໍ່
                                        </span>
                                      )}
                                    </div>
                                    <p className="mt-1 truncate pl-7 text-[11px] text-slate-500 dark:text-slate-400">
                                      {bill.cust_name || bill.cust_code || "-"} · ວັນບິນ {bill.doc_date || "-"}
                                    </p>
                                    {bill.incoming_forwarded && (
                                      <p className="mt-0.5 truncate pl-7 text-[10px] text-sky-600 dark:text-sky-400">
                                        ຈາກ {bill.forward_from_transport_name || "-"} · {bill.forwarded_at || "-"}
                                      </p>
                                    )}
                                  </button>
                                </div>

                                {expandedBill === bill.doc_no && (
                                  <div className="border-t border-slate-200/60 bg-slate-50/80 px-3 py-3 dark:border-white/10 dark:bg-slate-950/40">
                                    {loadingProducts === bill.doc_no ? (
                                      <div className="flex items-center justify-center gap-2 py-5 text-[11px] text-slate-400">
                                        <FaSpinner className="animate-spin" size={12} />
                                        ກຳລັງໂຫຼດລາຍການສິນຄ້າ...
                                      </div>
                                    ) : (productsByBill[bill.doc_no] ?? []).length === 0 ? (
                                      <p className="py-4 text-center text-[11px] text-slate-400">
                                        ບໍ່ພົບລາຍການສິນຄ້າ
                                      </p>
                                    ) : (
                                      <div className="overflow-hidden rounded-lg border border-slate-200/70 bg-white dark:border-white/10 dark:bg-slate-900">
                                        <table className="w-full text-[11px]">
                                          <thead className="bg-slate-50 text-slate-500 dark:bg-white/5 dark:text-slate-400">
                                            <tr>
                                              <th className="w-10 px-2 py-2 text-left font-semibold">#</th>
                                              <th className="px-2 py-2 text-left font-semibold">ລະຫັດ</th>
                                              <th className="px-2 py-2 text-left font-semibold">ຊື່ສິນຄ້າ</th>
                                              <th className="px-2 py-2 text-right font-semibold">ຈຳນວນ</th>
                                              <th className="px-2 py-2 text-left font-semibold">ຫົວໜ່ວຍ</th>
                                            </tr>
                                          </thead>
                                          <tbody className="divide-y divide-slate-200/60 dark:divide-white/10">
                                            {productsByBill[bill.doc_no].map((product, index) => (
                                              <tr key={`${bill.doc_no}-${product.item_code}-${index}`}>
                                                <td className="px-2 py-2 text-slate-400">{index + 1}</td>
                                                <td className="px-2 py-2 font-mono text-[10px] text-slate-500 dark:text-slate-400">
                                                  {product.item_code}
                                                </td>
                                                <td className="px-2 py-2 text-slate-700 dark:text-slate-200">
                                                  {product.item_name}
                                                </td>
                                                <td className="px-2 py-2 text-right font-bold text-emerald-600 dark:text-emerald-400">
                                                  {product.qty}
                                                </td>
                                                <td className="px-2 py-2 text-slate-500 dark:text-slate-400">
                                                  {product.unit_code}
                                                </td>
                                              </tr>
                                            ))}
                                          </tbody>
                                        </table>
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
