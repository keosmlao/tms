"use client";

import { useEffect, useMemo, useState } from "react";
import {
  FaBox,
  FaCalculator,
  FaClipboardCheck,
  FaClipboardList,
  FaSearch,
  FaSave,
  FaSpinner,
  FaTimes,
  FaTrash,
  FaTruckLoading,
  FaUser,
} from "react-icons/fa";
import { Actions } from "@/lib/api";
import { StatusPageHeader } from "@/components/status-page-shell";

type SelectRow = Record<string, unknown>;

type ProductRow = {
  name: string;
  qty: string;
  weight: string;
  package_type_id: string;
  width: string;
  long: string;
  height: string;
  price: string;
};

type FormState = {
  sender_addr_id: string;
  sender_order_no: string;
  receive_phone_no: string;
  receive_name: string;
  receive_address: string;
  receive_province: string;
  receive_district: string;
  receive_district_sub: string;
  service_type: string;
  product_name: string;
  qty: string;
  products: ProductRow[];
  weight: string;
  package_type_id: string;
  width: string;
  long: string;
  height: string;
  is_service_at_dest: boolean;
  is_cod: boolean;
  price: string;
  note_rider: string;
  note_hub: string;
  note_deliverer: string;
};

const initialForm: FormState = {
  sender_addr_id: "",
  sender_order_no: "",
  receive_phone_no: "",
  receive_name: "",
  receive_address: "",
  receive_province: "",
  receive_district: "",
  receive_district_sub: "",
  service_type: "",
  product_name: "",
  qty: "1",
  products: [],
  weight: "1",
  package_type_id: "0",
  width: "10",
  long: "10",
  height: "10",
  is_service_at_dest: false,
  is_cod: false,
  price: "0",
  note_rider: "",
  note_hub: "",
  note_deliverer: "",
};

function unwrapRows(value: unknown): SelectRow[] {
  if (Array.isArray(value)) return value as SelectRow[];
  if (value && typeof value === "object") {
    const data = (value as Record<string, unknown>).data;
    if (Array.isArray(data)) return data as SelectRow[];
  }
  return [];
}

function valueText(value: unknown) {
  return String(value ?? "").trim();
}

function positiveCeil(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.ceil(n) : 0;
}

function expandProductRows(rows: ProductRow[]) {
  return rows.flatMap((row) =>
    Array.from({ length: Math.max(positiveCeil(row.qty), 1) }, () => ({
      ...row,
      qty: "1",
    }))
  );
}

function senderId(row: SelectRow) {
  return valueText(row.sender_addr_id ?? row.id);
}

function findDefaultSender(rows: SelectRow[]) {
  return rows.find((row) =>
    [
      row.sender_addr_name,
      row.name,
      row.sender_addr,
      row.address,
      row.sender_addr_code,
      row.code,
    ].some((value) => valueText(value).toLowerCase().includes("odien"))
  );
}

function payloadFromForm(form: FormState) {
  const productSource = [
    ...form.products,
    ...(form.product_name.trim()
      ? [
          {
            name: form.product_name,
            qty: form.qty,
            weight: form.weight,
            package_type_id: form.package_type_id,
            width: form.width,
            long: form.long,
            height: form.height,
            price: form.price,
          },
        ]
      : []),
  ];
  return {
    sender_addr_id: form.sender_addr_id,
    sender_order_no: form.sender_order_no,
    receive_phone_no: form.receive_phone_no,
    receive_name: form.receive_name,
    receive_address: form.receive_address,
    receive_province: form.receive_province,
    receive_district: form.receive_district,
    receive_district_sub: form.receive_district_sub,
    service_type: form.service_type,
    product_name: form.product_name,
    qty: form.qty,
    product_list: productSource.map((product) => ({
      name: product.name,
      qty: product.qty,
      weight: product.weight || form.weight,
      package_type: {
        id: product.package_type_id || form.package_type_id,
        width: product.width || form.width,
        long: product.long || form.long,
        height: product.height || form.height,
      },
      is_service_at_dest: form.is_service_at_dest,
      is_cod: form.is_cod,
      price: product.price || form.price,
    })),
    thunjai_split_note: "This page can collect many items, but the server creates one ThunJai order per item unit with qty=1.",
    expected_thunjai_order_count: productSource.reduce(
      (sum, product) => sum + positiveCeil(product.qty),
      0
    ),
    weight: form.weight,
    package_type_id: form.package_type_id,
    width: form.width,
    long: form.long,
    height: form.height,
    is_service_at_dest: form.is_service_at_dest,
    is_cod: form.is_cod,
    price: form.price,
    note_rider: form.note_rider,
    note_hub: form.note_hub,
    note_deliverer: form.note_deliverer,
  };
}

function Panel({
  title,
  icon,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-slate-200/70 bg-white/70 shadow-sm dark:border-white/10 dark:bg-white/5">
      <div className="flex items-center gap-2 border-b border-slate-200/70 px-4 py-2.5 dark:border-white/10">
        <span className="text-teal-600 dark:text-teal-300">{icon}</span>
        <h2 className="text-sm font-bold text-slate-800 dark:text-white">{title}</h2>
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-semibold text-slate-600 dark:text-slate-300">
        {label}
      </span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 outline-none focus:border-teal-400 dark:border-white/10 dark:bg-slate-950/40 dark:text-slate-100"
      />
    </label>
  );
}

function Select({
  label,
  value,
  onChange,
  options,
  placeholder,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  placeholder?: string;
  disabled?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-semibold text-slate-600 dark:text-slate-300">
        {label}
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 outline-none focus:border-teal-400 disabled:cursor-not-allowed disabled:opacity-60 dark:border-white/10 dark:bg-slate-950/40 dark:text-slate-100"
      >
        <option value="">{placeholder ?? "ເລືອກ"}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`flex items-center justify-between rounded-lg border px-3 py-2.5 text-xs font-semibold ${
        checked
          ? "border-teal-300 bg-teal-500/10 text-teal-700 dark:border-teal-500/30 dark:text-teal-300"
          : "border-slate-200 bg-white text-slate-600 dark:border-white/10 dark:bg-slate-950/40 dark:text-slate-300"
      }`}
    >
      <span>{label}</span>
      <span className={`h-4 w-8 rounded-full p-0.5 ${checked ? "bg-teal-500" : "bg-slate-300"}`}>
        <span
          className={`block h-3 w-3 rounded-full bg-white transition-transform ${
            checked ? "translate-x-4" : ""
          }`}
        />
      </span>
    </button>
  );
}

function Button({
  children,
  onClick,
  loading,
  tone = "teal",
}: {
  children: React.ReactNode;
  onClick: () => void;
  loading?: boolean;
  tone?: "teal" | "slate";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading}
      className={`inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50 ${
        tone === "slate" ? "bg-slate-900 hover:bg-slate-800" : "bg-teal-600 hover:bg-teal-700"
      }`}
    >
      {loading ? <FaSpinner className="animate-spin" /> : null}
      {children}
    </button>
  );
}

export default function CreateThunJaiOrderPage() {
  const [form, setForm] = useState<FormState>(initialForm);
  const [senders, setSenders] = useState<SelectRow[]>([]);
  const [packaging, setPackaging] = useState<SelectRow[]>([]);
  const [provinces, setProvinces] = useState<SelectRow[]>([]);
  const [districts, setDistricts] = useState<SelectRow[]>([]);
  const [villages, setVillages] = useState<SelectRow[]>([]);
  const [services, setServices] = useState<SelectRow[]>([]);
  const [estimate, setEstimate] = useState<number | null>(null);
  const [createResult, setCreateResult] = useState<SelectRow | null>(null);
  const [productModalOpen, setProductModalOpen] = useState(false);
  const [sourceSearch, setSourceSearch] = useState("");
  const [sourceRows, setSourceRows] = useState<SelectRow[]>([]);
  const [sourceError, setSourceError] = useState<string | null>(null);
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const payload = useMemo(() => payloadFromForm(form), [form]);
  const splitOrderCount = useMemo(
    () => payload.product_list.reduce((sum, product) => sum + positiveCeil(product.qty), 0),
    [payload]
  );

  useEffect(() => {
    void (async () => {
      setLoading("init");
      try {
        const [senderRes, packageRes, provinceRes] = await Promise.all([
          Actions.listThunJaiSenderAddresses(),
          Actions.listThunJaiPackaging(),
          Actions.listThunJaiProvinces(),
        ]);
        const senderRows = unwrapRows(senderRes);
        const defaultSender = findDefaultSender(senderRows);
        setSenders(senderRows);
        setPackaging(unwrapRows(packageRes));
        setProvinces(unwrapRows(provinceRes));
        if (defaultSender) {
          setForm((prev) => {
            if (prev.sender_addr_id) return prev;
            return {
              ...prev,
              sender_addr_id: senderId(defaultSender),
              receive_province:
                prev.receive_province || valueText(defaultSender.sender_addr_province_id),
              receive_district:
                prev.receive_district || valueText(defaultSender.sender_addr_district_id),
            };
          });
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "ໂຫຼດຂໍ້ມູນ ThunJai ບໍ່ສຳເລັດ");
      } finally {
        setLoading(null);
      }
    })();
  }, []);

  useEffect(() => {
    const provinceId = form.receive_province.trim();
    if (!provinceId) {
      setDistricts([]);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const res = await Actions.listThunJaiDistricts(provinceId);
        if (!cancelled) setDistricts(unwrapRows(res));
      } catch (err) {
        if (!cancelled) {
          setDistricts([]);
          setError(err instanceof Error ? err.message : "ໂຫຼດລາຍຊື່ເມືອງບໍ່ສຳເລັດ");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [form.receive_province]);

  useEffect(() => {
    const districtId = form.receive_district.trim();
    if (!districtId) {
      setVillages([]);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const res = await Actions.listThunJaiVillages(districtId);
        if (!cancelled) setVillages(unwrapRows(res));
      } catch (err) {
        if (!cancelled) {
          setVillages([]);
          setError(err instanceof Error ? err.message : "ໂຫຼດລາຍຊື່ບ້ານບໍ່ສຳເລັດ");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [form.receive_district]);

  useEffect(() => {
    const senderId = form.sender_addr_id.trim();
    const villageId = form.receive_district_sub.trim();
    if (!senderId || !villageId) {
      setServices([]);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const res = await Actions.checkThunJaiServiceType({
          sender_addr_id: senderId,
          district_sub_id: villageId,
        });
        if (cancelled) return;
        const rows = unwrapRows(res);
        setServices(rows);
        setForm((prev) =>
          prev.service_type || rows[0]?.id == null
            ? prev
            : { ...prev, service_type: String(rows[0].id) }
        );
      } catch (err) {
        if (!cancelled) {
          setServices([]);
          setError(err instanceof Error ? err.message : "ໂຫຼດ Service Type ບໍ່ສຳເລັດ");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [form.sender_addr_id, form.receive_district_sub]);

  const setValue = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const applyProvince = (id: string) => {
    setForm((prev) => ({
      ...prev,
      receive_province: id,
      receive_district: "",
      receive_district_sub: "",
    }));
    setEstimate(null);
  };

  const applyDistrict = (id: string) => {
    setForm((prev) => ({
      ...prev,
      receive_district: id,
      receive_district_sub: "",
      service_type: "",
    }));
    setServices([]);
    setEstimate(null);
  };

  const applyVillage = (id: string) => {
    setForm((prev) => ({ ...prev, receive_district_sub: id, service_type: "" }));
    setServices([]);
    setEstimate(null);
  };

  const applySender = (id: string) => {
    const row = senders.find((item) => String(item.sender_addr_id ?? item.id ?? "") === id);
    setForm((prev) => ({
      ...prev,
      sender_addr_id: id,
      receive_province: prev.receive_province || valueText(row?.sender_addr_province_id),
      receive_district: prev.receive_district || valueText(row?.sender_addr_district_id),
    }));
  };

  const updateProduct = (index: number, key: keyof ProductRow, value: string) => {
    setForm((prev) => ({
      ...prev,
      products: prev.products.map((item, idx) =>
        idx === index ? { ...item, [key]: value } : item
      ),
    }));
  };

  const updateProductPackaging = (index: number, id: string) => {
    const row = packaging.find((item) => String(item.id ?? "") === id);
    setForm((prev) => ({
      ...prev,
      products: prev.products.map((item, idx) =>
        idx === index
          ? {
              ...item,
              package_type_id: id,
              width: valueText(row?.width) || item.width,
              long: valueText(row?.long) || item.long,
              height: valueText(row?.height) || item.height,
            }
          : item
      ),
    }));
  };

  const removeProduct = (index: number) => {
    setForm((prev) => ({
      ...prev,
      products: prev.products.filter((_, idx) => idx !== index),
    }));
  };

  const searchProducts = async () => {
    const keyword = sourceSearch.trim();
    if (keyword.length < 2) {
      setSourceRows([]);
      setSourceError("ກະລຸນາພິມຢ່າງໜ້ອຍ 2 ຕົວອັກສອນ");
      return;
    }
    setLoading("source-products");
    setSourceError(null);
    try {
      const rows = await Actions.searchThunJaiSourceProducts(keyword);
      setSourceRows(Array.isArray(rows) ? rows : []);
    } catch (err) {
      setSourceRows([]);
      setSourceError(err instanceof Error ? err.message : "ຄົ້ນຫາພັດສະດຸບໍ່ສຳເລັດ");
    } finally {
      setLoading(null);
    }
  };

  const applySourceProduct = (row: SelectRow) => {
    const itemLines = Array.isArray(row.item_lines) ? (row.item_lines as SelectRow[]) : [];
    const products = expandProductRows(
      itemLines.length > 0
        ? itemLines.map((item) => ({
            name: valueText(item.item_name || item.item_code),
            qty: valueText(item.qty) || "1",
            weight: form.weight || "1",
            package_type_id: form.package_type_id || "0",
            width: form.width || "10",
            long: form.long || "10",
            height: form.height || "10",
            price: form.price || "0",
          }))
        : [
            {
              name: valueText(row.item_summary || row.item_name || row.item_code),
              qty: valueText(row.qty) || "1",
              weight: form.weight || "1",
              package_type_id: form.package_type_id || "0",
              width: form.width || "10",
              long: form.long || "10",
              height: form.height || "10",
              price: form.price || "0",
            },
          ]
    );
    const docNo = valueText(row.doc_no);
    setForm((prev) => ({
      ...prev,
      sender_order_no: prev.sender_order_no || docNo,
      receive_name: valueText(row.cust_name) || prev.receive_name,
      receive_phone_no: valueText(row.telephone) || prev.receive_phone_no,
      products,
      product_name: "",
      qty: "1",
    }));
    setProductModalOpen(false);
  };

  const run = async (key: string, task: () => Promise<unknown>) => {
    setLoading(key);
    setError(null);
    try {
      const result = await task();
      return result;
    } catch (err) {
      setError(err instanceof Error ? err.message : "ThunJai API request failed");
      return null;
    } finally {
      setLoading(null);
    }
  };

  const estimatePrice = async () => {
    const sender = senders.find(
      (item) => String(item.sender_addr_id ?? item.id ?? "") === form.sender_addr_id
    );
    const result = await run("estimate", () =>
      Actions.estimateThunJaiPrice({
        src_province: valueText(sender?.sender_addr_province ?? sender?.province_id),
        src_district: valueText(sender?.sender_addr_district ?? sender?.district_id),
        dest_province: form.receive_province,
        dest_district: form.receive_district,
        service_type: form.service_type,
        weight: form.weight,
        width: form.width,
        long: form.long,
        height: form.height,
      })
    );
    if (result == null) return;
    const data =
      result && typeof result === "object" && "data" in result
        ? (result as { data?: unknown }).data
        : result;
    const total =
      data && typeof data === "object"
        ? Number((data as Record<string, unknown>).price_total)
        : Number(data);
    setEstimate(Number.isFinite(total) ? total : null);
  };

  const createOrder = async () => {
    const missing: string[] = [];
    if (!form.sender_addr_id) missing.push("ຜູ້ສົ່ງ");
    if (!form.receive_name.trim()) missing.push("ຊື່ຜູ້ຮັບ");
    if (!form.receive_phone_no.trim()) missing.push("ເບີໂທຜູ້ຮັບ");
    if (!form.receive_address.trim()) missing.push("ທີ່ຢູ່ຜູ້ຮັບ");
    if (!form.receive_province) missing.push("ແຂວງ");
    if (!form.receive_district) missing.push("ເມືອງ");
    if (!form.receive_district_sub) missing.push("ບ້ານ");
    if (!form.service_type) missing.push("Service Type");
    if (payload.product_list.length === 0) missing.push("ພັດສະດຸ (ຢ່າງໜ້ອຍ 1 ລາຍການ)");
    if (missing.length > 0) {
      setCreateResult(null);
      setError(`ກະລຸນາປ້ອນ/ເລືອກ: ${missing.join(", ")}`);
      return;
    }
    setCreateResult(null);
    const result = await run("create", () => Actions.createThunJaiOrder(payload));
    if (result && typeof result === "object") {
      setCreateResult(result as SelectRow);
    }
  };

  return (
    <div className="space-y-4">
      <StatusPageHeader
        title="ສ້າງ Order ThunJai"
        subtitle="ສ້າງອອເດີຂົນສົ່ງໃນ ThunJai Express ໂດຍແຍກຈາກ workflow TMS ເດີມ"
        icon={<FaClipboardCheck />}
        tone="teal"
      />

      {error && (
        <div className="rounded-md border border-rose-200 bg-rose-500/10 p-2 text-xs text-rose-700 dark:border-rose-500/20 dark:text-rose-300">
          {error}
        </div>
      )}

      {createResult && (() => {
        const results = Array.isArray(createResult.results)
          ? (createResult.results as SelectRow[])
          : [];
        const created = results.filter((r) => r.ok);
        const failed = results.filter((r) => !r.ok);
        const success = createResult.success === true;
        return (
          <div
            className={`rounded-md border p-3 text-xs ${
              success
                ? "border-emerald-200 bg-emerald-500/10 text-emerald-700 dark:border-emerald-500/20 dark:text-emerald-300"
                : "border-amber-200 bg-amber-500/10 text-amber-800 dark:border-amber-500/20 dark:text-amber-200"
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="font-bold">
                {success ? "✓ ສ້າງ order ສຳເລັດ" : "⚠ ສ້າງ order ບໍ່ຄົບ"} —{" "}
                {valueText(createResult.created_order_count) || String(created.length)}/
                {valueText(createResult.requested_order_count) || String(results.length)} ໃບ
              </span>
              <button
                type="button"
                onClick={() => setCreateResult(null)}
                className="opacity-70 hover:opacity-100"
                aria-label="Close"
              >
                <FaTimes />
              </button>
            </div>
            {created.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {created.map((r, i) => {
                  const response =
                    r.response && typeof r.response === "object" && "data" in r.response
                      ? (r.response as Record<string, unknown>).data
                      : r.response;
                  const no =
                    response && typeof response === "object"
                      ? valueText((response as Record<string, unknown>).order_no)
                      : "";
                  return (
                    <span
                      key={i}
                      className="rounded-md bg-white/60 px-2 py-0.5 font-mono font-semibold dark:bg-white/10"
                    >
                      {no || `#${valueText(r.index)}`}
                    </span>
                  );
                })}
              </div>
            )}
            {failed.length > 0 && (
              <ul className="mt-2 list-disc pl-4">
                {failed.map((r, i) => (
                  <li key={i}>
                    ໃບທີ {valueText(r.index)} ({valueText(r.product_name)}): {valueText(r.error)}
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })()}

      <div className="space-y-4">
          <Panel title="ພັດສະດຸ" icon={<FaBox />}>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                ThunJai ຮອງຮັບ 1 order = 1 ພັດສະດຸ ແລະ qty 1; ລະບົບຈະແຕກໃຫ້ອັດຕະໂນມັດ
              </p>
              <Button tone="slate" onClick={() => setProductModalOpen(true)}>
                <FaSearch /> ຄົ້ນຫາເອກະສານ
              </Button>
            </div>
            <div className="mb-3 rounded-md border border-teal-200 bg-teal-500/10 px-2.5 py-1.5 text-[11px] font-semibold text-teal-800 dark:border-teal-500/30 dark:text-teal-200">
              ຈະສ້າງ ThunJai order ທັງໝົດ {splitOrderCount} ໃບ. ທຸກໃບຈະສົ່ງ product_list 1 ລາຍການ ແລະ qty = 1.
            </div>
            <div className="grid gap-2 md:grid-cols-3">
              <div className="md:col-span-3">
                <div className="overflow-auto rounded-lg border border-slate-200 dark:border-white/10">
                  <table className="w-full min-w-[1060px] text-left text-[11px]">
                    <thead className="bg-slate-100 text-slate-600 dark:bg-slate-900 dark:text-slate-300">
                      <tr>
                        <th className="px-2 py-1.5 font-semibold min-w-[320px]">ພັດສະດຸ</th>
                        <th className="px-2 py-1.5 text-right font-semibold">Qty/Order</th>
                        <th className="px-2 py-1.5 text-right font-semibold">ນ້ຳໜັກ kg</th>
                        <th className="px-2 py-1.5 font-semibold">ປະເພດ</th>
                        <th className="px-2 py-1.5 text-right font-semibold">ກວ້າງ</th>
                        <th className="px-2 py-1.5 text-right font-semibold">ຍາວ</th>
                        <th className="px-2 py-1.5 text-right font-semibold">ສູງ</th>
                        <th className="px-2 py-1.5 text-right font-semibold">COD</th>
                        <th className="px-2 py-1.5 text-right font-semibold">ລຶບ</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-white/10">
                      {form.products.map((product, index) => (
                        <tr key={`${product.name}-${index}`}>
                          <td className="px-2 py-1.5">
                            <input
                              value={product.name}
                              onChange={(e) => updateProduct(index, "name", e.target.value)}
                              className="w-full min-w-[320px] rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] text-slate-800 outline-none focus:border-teal-400 dark:border-white/10 dark:bg-slate-950/40 dark:text-slate-100"
                            />
                          </td>
                          <td className="px-2 py-1.5">
                            <input
                              type="number"
                              value={product.qty}
                              readOnly
                              className="w-20 rounded-md border border-slate-200 bg-slate-100 px-2 py-1 text-right text-[11px] text-slate-600 outline-none dark:border-white/10 dark:bg-slate-900 dark:text-slate-300"
                            />
                          </td>
                          <td className="px-2 py-1.5">
                            <input
                              type="number"
                              value={product.weight}
                              onChange={(e) => updateProduct(index, "weight", e.target.value)}
                              className="w-20 rounded-md border border-slate-200 bg-white px-2 py-1 text-right text-[11px] text-slate-800 outline-none focus:border-teal-400 dark:border-white/10 dark:bg-slate-950/40 dark:text-slate-100"
                            />
                          </td>
                          <td className="px-2 py-1.5">
                            <select
                              value={product.package_type_id}
                              onChange={(e) => updateProductPackaging(index, e.target.value)}
                              className="w-36 rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] text-slate-800 outline-none focus:border-teal-400 dark:border-white/10 dark:bg-slate-950/40 dark:text-slate-100"
                            >
                              <option value="0">0 - ກຳນົດເອງ</option>
                              {packaging.map((row, optionIndex) => (
                                <option key={`${row.id ?? optionIndex}`} value={valueText(row.id)}>
                                  {valueText(row.id)} - {valueText(row.name)}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="px-2 py-1.5">
                            <input
                              type="number"
                              value={product.width}
                              onChange={(e) => updateProduct(index, "width", e.target.value)}
                              className="w-16 rounded-md border border-slate-200 bg-white px-2 py-1 text-right text-[11px] text-slate-800 outline-none focus:border-teal-400 dark:border-white/10 dark:bg-slate-950/40 dark:text-slate-100"
                            />
                          </td>
                          <td className="px-2 py-1.5">
                            <input
                              type="number"
                              value={product.long}
                              onChange={(e) => updateProduct(index, "long", e.target.value)}
                              className="w-16 rounded-md border border-slate-200 bg-white px-2 py-1 text-right text-[11px] text-slate-800 outline-none focus:border-teal-400 dark:border-white/10 dark:bg-slate-950/40 dark:text-slate-100"
                            />
                          </td>
                          <td className="px-2 py-1.5">
                            <input
                              type="number"
                              value={product.height}
                              onChange={(e) => updateProduct(index, "height", e.target.value)}
                              className="w-16 rounded-md border border-slate-200 bg-white px-2 py-1 text-right text-[11px] text-slate-800 outline-none focus:border-teal-400 dark:border-white/10 dark:bg-slate-950/40 dark:text-slate-100"
                            />
                          </td>
                          <td className="px-2 py-1.5">
                            <input
                              type="number"
                              value={product.price}
                              onChange={(e) => updateProduct(index, "price", e.target.value)}
                              className="w-24 rounded-md border border-slate-200 bg-white px-2 py-1 text-right text-[11px] text-slate-800 outline-none focus:border-teal-400 dark:border-white/10 dark:bg-slate-950/40 dark:text-slate-100"
                            />
                          </td>
                          <td className="px-2 py-1.5 text-right">
                            <button
                              type="button"
                              onClick={() => removeProduct(index)}
                              className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-rose-200 text-rose-600 hover:bg-rose-50 dark:border-rose-500/30 dark:text-rose-300 dark:hover:bg-rose-500/10"
                              aria-label="Remove product"
                            >
                              <FaTrash />
                            </button>
                          </td>
                        </tr>
                      ))}
                      {form.products.length === 0 && (
                        <tr>
                          <td colSpan={9} className="px-2 py-5 text-center text-xs text-slate-500 dark:text-slate-400">
                            ເພີ່ມພັດສະດຸໄດ້ຫຼາຍລາຍການ ຫຼືເລືອກຈາກເອກະສານ
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
            <div className="mt-3 grid gap-2 md:grid-cols-2">
              <Toggle
                label="ຊຳລະຄ່າຂົນສົ່ງປາຍທາງ"
                checked={form.is_service_at_dest}
                onChange={(v) => setValue("is_service_at_dest", v)}
              />
              <Toggle
                label="ເກັບເງິນຄ່າສິນຄ້າ COD"
                checked={form.is_cod}
                onChange={(v) => setValue("is_cod", v)}
              />
            </div>
          </Panel>

          <Panel title="ຜູ້ສົ່ງ ແລະຜູ້ຮັບ" icon={<FaUser />}>
            <div className="grid gap-2 md:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                  Sender Address
                </span>
                <select
                  value={form.sender_addr_id}
                  onChange={(e) => applySender(e.target.value)}
                  className="w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-[11px] text-slate-800 outline-none focus:border-teal-400 dark:border-white/10 dark:bg-slate-950/40 dark:text-slate-100"
                >
                  <option value="">ເລືອກຜູ້ສົ່ງ</option>
                  {senders.map((row, index) => {
                    const id = senderId(row);
                    return (
                      <option key={`${id}-${index}`} value={id}>
                        {id} - {valueText(row.sender_addr_name ?? row.name)}
                      </option>
                    );
                  })}
                </select>
              </label>
              <Field
                label="Sender Order No"
                value={form.sender_order_no}
                onChange={(v) => setValue("sender_order_no", v)}
                placeholder="ODG/TJ/..."
              />
              <Field
                label="ຊື່ຜູ້ຮັບ"
                value={form.receive_name}
                onChange={(v) => setValue("receive_name", v)}
              />
              <Field
                label="ເບີໂທຜູ້ຮັບ"
                value={form.receive_phone_no}
                onChange={(v) => setValue("receive_phone_no", v)}
                placeholder="85620..."
              />
              <div className="md:col-span-2">
                <Field
                  label="ທີ່ຢູ່ຜູ້ຮັບ"
                  value={form.receive_address}
                  onChange={(v) => setValue("receive_address", v)}
                />
              </div>
            </div>
          </Panel>

          <Panel title="ປາຍທາງ / Service" icon={<FaTruckLoading />}>
            <p className="mb-2 text-[11px] text-slate-500 dark:text-slate-400">
              ID ເຫຼົ່ານີ້ແມ່ນຄ່າທີ່ ThunJai API ຕ້ອງໃຊ້ສຳລັບປາຍທາງແລະປະເພດບໍລິການ
            </p>
            <div className="grid gap-2 md:grid-cols-2">
              <Select
                label="ແຂວງ"
                value={form.receive_province}
                onChange={applyProvince}
                placeholder="ເລືອກແຂວງ"
                options={provinces.map((row) => ({
                  value: valueText(row.id),
                  label: valueText(row.name),
                }))}
              />
              <Select
                label="ເມືອງ"
                value={form.receive_district}
                onChange={applyDistrict}
                placeholder={form.receive_province ? "ເລືອກເມືອງ" : "ເລືອກແຂວງກ່ອນ"}
                disabled={!form.receive_province}
                options={districts.map((row) => ({
                  value: valueText(row.id),
                  label: valueText(row.name),
                }))}
              />
              <Select
                label="ບ້ານ"
                value={form.receive_district_sub}
                onChange={applyVillage}
                placeholder={form.receive_district ? "ເລືອກບ້ານ" : "ເລືອກເມືອງກ່ອນ"}
                disabled={!form.receive_district}
                options={villages.map((row) => ({
                  value: valueText(row.id),
                  label: valueText(row.name),
                }))}
              />
              <Select
                label="Service Type"
                value={form.service_type}
                onChange={(v) => setValue("service_type", v)}
                placeholder={
                  loading === "service"
                    ? "ກຳລັງໂຫຼດ..."
                    : form.receive_district_sub
                    ? "ເລືອກ service"
                    : "ເລືອກບ້ານກ່ອນ"
                }
                disabled={!form.receive_district_sub || loading === "service"}
                options={services.map((row) => ({
                  value: valueText(row.id),
                  label: `${valueText(row.name)}${row.badge ? ` - ${valueText(row.badge)}` : ""}`,
                }))}
              />
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Button tone="slate" onClick={() => void estimatePrice()} loading={loading === "estimate"}>
                <FaCalculator /> ປະເມີນລາຄາ
              </Button>
              {estimate != null && (
                <span className="inline-flex items-center rounded-md border border-teal-200 bg-teal-500/10 px-2.5 py-1.5 text-[11px] font-semibold text-teal-800 dark:border-teal-500/30 dark:text-teal-200">
                  ຄ່າຂົນສົ່ງໂດຍປະມານ: {estimate.toLocaleString("en-US")} ກີບ
                </span>
              )}
            </div>
          </Panel>

          <Panel title="ໝາຍເຫດ" icon={<FaClipboardList />}>
            <div className="grid gap-2 md:grid-cols-3">
              <Field label="ເຖິງ Rider" value={form.note_rider} onChange={(v) => setValue("note_rider", v)} />
              <Field label="ເຖິງ Hub" value={form.note_hub} onChange={(v) => setValue("note_hub", v)} />
              <Field
                label="ເຖິງ Deliverer"
                value={form.note_deliverer}
                onChange={(v) => setValue("note_deliverer", v)}
              />
            </div>
            <div className="mt-3 flex justify-end">
              <Button onClick={() => void createOrder()} loading={loading === "create"}>
                <FaSave /> ສ້າງ {splitOrderCount} Order
              </Button>
            </div>
          </Panel>
      </div>

      {productModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-3">
          <div className="flex max-h-[88vh] w-full max-w-3xl flex-col overflow-hidden rounded-md bg-white shadow-2xl dark:bg-slate-950">
            <div className="flex items-center justify-between border-b border-slate-200 px-3 py-2 dark:border-white/10">
              <div>
                <h3 className="text-xs font-bold text-slate-900 dark:text-white">
                  ຄົ້ນຫາຫົວເອກະສານ
                </h3>
                <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                  ເລືອກຈາກ ic_trans ແລະສະຫຼຸບພັດສະດຸຈາກ ic_trans_detail
                </p>
              </div>
              <button
                type="button"
                onClick={() => setProductModalOpen(false)}
                className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 text-slate-600 hover:bg-slate-100 dark:border-white/10 dark:text-slate-200 dark:hover:bg-white/10"
                aria-label="Close"
              >
                <FaTimes />
              </button>
            </div>

            <div className="border-b border-slate-200 p-3 dark:border-white/10">
              <div className="flex flex-col gap-2 md:flex-row">
                <input
                  value={sourceSearch}
                  onChange={(e) => setSourceSearch(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void searchProducts();
                  }}
                  placeholder="ຄົ້ນຫາ: ເລກເອກະສານ, ລູກຄ້າ, ເບີໂທ, ລະຫັດສິນຄ້າ, ຊື່ສິນຄ້າ"
                  className="min-w-0 flex-1 rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-800 outline-none focus:border-teal-400 dark:border-white/10 dark:bg-slate-900 dark:text-slate-100"
                  autoFocus
                />
                <Button onClick={() => void searchProducts()} loading={loading === "source-products"}>
                  <FaSearch /> ຄົ້ນຫາ
                </Button>
              </div>
              {sourceError && (
                <div className="mt-2 rounded-md border border-rose-200 bg-rose-500/10 p-2 text-[11px] text-rose-700 dark:border-rose-500/20 dark:text-rose-300">
                  {sourceError}
                </div>
              )}
            </div>

            <div className="min-h-0 flex-1 overflow-auto">
              <table className="w-full min-w-[900px] text-left text-[11px]">
                <thead className="sticky top-0 bg-slate-100 text-slate-600 dark:bg-slate-900 dark:text-slate-300">
                  <tr>
                    <th className="px-2 py-1.5 font-semibold">ວັນທີ</th>
                    <th className="px-2 py-1.5 font-semibold">ເລກເອກະສານ</th>
                    <th className="px-2 py-1.5 font-semibold">ລູກຄ້າ</th>
                    <th className="px-2 py-1.5 font-semibold">ເບີໂທ</th>
                    <th className="px-2 py-1.5 text-right font-semibold">ລາຍການ</th>
                    <th className="px-2 py-1.5 font-semibold">ສະຫຼຸບພັດສະດຸ</th>
                    <th className="px-2 py-1.5 text-right font-semibold">ຈຳນວນ</th>
                    <th className="px-2 py-1.5 text-right font-semibold">ເລືອກ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-white/10">
                  {sourceRows.map((row, index) => (
                    <tr
                      key={`${row.doc_no ?? "doc"}-${row.item_code ?? "item"}-${index}`}
                      className="text-slate-700 hover:bg-teal-50 dark:text-slate-200 dark:hover:bg-teal-500/10"
                    >
                      <td className="px-2 py-1.5 whitespace-nowrap">{valueText(row.doc_date)}</td>
                      <td className="px-2 py-1.5 whitespace-nowrap font-semibold">{valueText(row.doc_no)}</td>
                      <td className="px-2 py-1.5">{valueText(row.cust_name || row.cust_code)}</td>
                      <td className="px-2 py-1.5 whitespace-nowrap">{valueText(row.telephone)}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{valueText(row.line_count)}</td>
                      <td className="px-2 py-1.5">{valueText(row.item_summary)}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{valueText(row.qty)}</td>
                      <td className="px-2 py-1.5 text-right">
                        <button
                          type="button"
                          onClick={() => applySourceProduct(row)}
                          className="rounded-md bg-teal-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-teal-700"
                        >
                          ເລືອກ
                        </button>
                      </td>
                    </tr>
                  ))}
                  {sourceRows.length === 0 && (
                    <tr>
                      <td colSpan={8} className="px-2 py-8 text-center text-xs text-slate-500 dark:text-slate-400">
                        {loading === "source-products" ? "ກຳລັງຄົ້ນຫາ..." : "ຍັງບໍ່ມີຂໍ້ມູນ"}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
