"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  FaArrowRight,
  FaCheckCircle,
  FaClipboardList,
  FaCog,
  FaDatabase,
  FaKey,
  FaMapMarkerAlt,
  FaPlug,
  FaPlus,
  FaRoute,
  FaSave,
  FaSpinner,
  FaTruckLoading,
} from "react-icons/fa";
import { Actions } from "@/lib/api";
import { StatusPageHeader } from "@/components/status-page-shell";
import {
  Field,
  PageLoading,
  SaveBar,
  SectionCard,
  Toggle,
} from "@/app/(dashboard)/manage/settings/_components";
import {
  THUNJAI_DEFAULTS,
  type ThunJaiSettings,
} from "@/lib/thunjai-config";

type TokenResult = {
  ok: boolean;
  status: number;
  statusText: string;
  url: string;
  body: unknown;
};

type ApiItem = { path: string; done: boolean };

const apiGroups: { title: string; icon: React.ReactNode; items: ApiItem[] }[] = [
  {
    title: "Auth",
    icon: <FaKey />,
    items: [
      { path: "POST /auth/requestToken", done: true },
      { path: "POST /auth/refreshToken", done: false },
    ],
  },
  {
    title: "Sender Address",
    icon: <FaMapMarkerAlt />,
    items: [
      { path: "GET /user/address/types", done: false },
      { path: "GET /user/address/list", done: true },
      { path: "GET /user/address/detail", done: false },
      { path: "PUT /user/address/add", done: false },
      { path: "POST /user/address/update", done: false },
      { path: "DELETE /user/address/delete", done: false },
    ],
  },
  {
    title: "Master Data",
    icon: <FaDatabase />,
    items: [
      { path: "GET /master/provinces", done: true },
      { path: "GET /master/districts", done: true },
      { path: "GET /master/villages", done: true },
      { path: "GET /master/packaging", done: true },
    ],
  },
  {
    title: "Order",
    icon: <FaClipboardList />,
    items: [
      { path: "GET /order/list", done: true },
      { path: "POST /order/service/checkServiceType", done: true },
      { path: "POST /order/service/estimatePrice", done: true },
      { path: "PUT /order/service/create", done: true },
      { path: "GET /order/detail", done: true },
      { path: "GET /order/tracking", done: true },
      { path: "GET /order/label", done: true },
      { path: "DELETE /order/delete", done: true },
    ],
  },
  {
    title: "Pickup",
    icon: <FaTruckLoading />,
    items: [
      { path: "PUT /pickup/request", done: true },
      { path: "GET /pickup/list", done: true },
      { path: "GET /pickup/detail", done: true },
    ],
  },
];

function endpointTone(index: number) {
  return [
    "bg-teal-500/10 text-teal-700 dark:text-teal-300",
    "bg-sky-500/10 text-sky-700 dark:text-sky-300",
    "bg-amber-500/10 text-amber-700 dark:text-amber-300",
    "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
    "bg-rose-500/10 text-rose-700 dark:text-rose-300",
  ][index % 5];
}

export default function ThunJaiPage() {
  const [settings, setSettings] = useState<ThunJaiSettings>(THUNJAI_DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tokenResult, setTokenResult] = useState<TokenResult | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const data = (await Actions.getThunJaiSettings()) as ThunJaiSettings;
        setSettings({ ...THUNJAI_DEFAULTS, ...data });
      } catch (err) {
        setError(err instanceof Error ? err.message : "ໂຫຼດຕັ້ງຄ່າບໍ່ສຳເລັດ");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const enabled =
    settings["thunjai.enabled"] === "1" ||
    settings["thunjai.enabled"] === "true";

  const baseUrl = useMemo(() => {
    const custom = settings["thunjai.base_url"].trim();
    if (custom) return custom.replace(/\/+$/, "");
    return settings["thunjai.environment"] === "production"
      ? "https://apis.thunjaiexpress.com"
      : "https://stg-apis.thunjaiexpress.com";
  }, [settings]);

  const setValue = (key: keyof ThunJaiSettings, value: string) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await Actions.saveThunJaiSettings(settings);
      setSavedAt(Date.now());
    } catch (err) {
      setError(err instanceof Error ? err.message : "ບັນທຶກບໍ່ສຳເລັດ");
    } finally {
      setSaving(false);
    }
  };

  const testToken = async () => {
    setTesting(true);
    setError(null);
    setTokenResult(null);
    try {
      await Actions.saveThunJaiSettings(settings);
      const result = (await Actions.testThunJaiToken()) as TokenResult;
      setTokenResult(result);
      setSavedAt(Date.now());
    } catch (err) {
      setError(err instanceof Error ? err.message : "ທົດສອບ Token ບໍ່ສຳເລັດ");
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="space-y-5">
      <StatusPageHeader
        title="ລະບົບ ThunJai Express"
        subtitle="Module ແຍກສຳລັບອອເດີ, ໃບປະໜ້າ, tracking ແລະ pickup ຂອງ ThunJai ໂດຍບໍ່ປົນກັບ TMS ເດີມ"
        icon={<FaPlug />}
        tone="teal"
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <Link
          href="/thunjai/orders/create"
          className="group flex items-center justify-between gap-3 rounded-xl border border-teal-200 bg-teal-500/10 p-4 transition hover:bg-teal-500/20 dark:border-teal-500/30"
        >
          <span className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-teal-600 text-white">
              <FaPlus />
            </span>
            <span>
              <span className="block text-sm font-bold text-slate-800 dark:text-white">ສ້າງ Order ThunJai</span>
              <span className="block text-[11px] text-slate-500 dark:text-slate-400">ສ້າງອອเດີ ຈາກເອກະສານ ic_trans</span>
            </span>
          </span>
          <FaArrowRight className="text-teal-600 transition group-hover:translate-x-1 dark:text-teal-300" />
        </Link>
        <Link
          href="/thunjai/shipping"
          className="group flex items-center justify-between gap-3 rounded-xl border border-sky-200 bg-sky-500/10 p-4 transition hover:bg-sky-500/20 dark:border-sky-500/30"
        >
          <span className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-sky-600 text-white">
              <FaTruckLoading />
            </span>
            <span>
              <span className="block text-sm font-bold text-slate-800 dark:text-white">ຈັດການ Order / Pickup</span>
              <span className="block text-[11px] text-slate-500 dark:text-slate-400">ຄົ້ນຫາ, ຕິດຕາມ, ໃບປະໜ້າ, ເອີ້ນຮັບພັດສະດຸ</span>
            </span>
          </span>
          <FaArrowRight className="text-sky-600 transition group-hover:translate-x-1 dark:text-sky-300" />
        </Link>
      </div>

      {loading ? (
        <PageLoading />
      ) : (
        <>
          <SectionCard
            title="ການເຊື່ອມຕໍ່ ThunJai"
            subtitle="Config ນີ້ເກັບແຍກຈາກ TMS ເດີມ ແລະໃຊ້ສະເພາະ ThunJai API"
            icon={<FaCog className="text-teal-500" />}
          >
            <Toggle
              label="ເປີດໃຊ້ Module ThunJai"
              description="ໃຊ້ສຳລັບງານ ThunJai ເທົ່ານັ້ນ; ບໍ່ຜູກກັບ workflow ຂົນສົ່ງ TMS ເດີມ"
              checked={enabled}
              onChange={(v) => setValue("thunjai.enabled", v ? "1" : "0")}
            />

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-slate-600 dark:text-slate-300">
                  Environment
                </label>
                <select
                  value={settings["thunjai.environment"]}
                  onChange={(e) => {
                    const env = e.target.value;
                    setSettings((prev) => ({
                      ...prev,
                      "thunjai.environment": env,
                      "thunjai.base_url":
                        env === "production"
                          ? "https://apis.thunjaiexpress.com"
                          : "https://stg-apis.thunjaiexpress.com",
                    }));
                  }}
                  className="glass-input w-full rounded-lg px-3 py-2 text-xs text-slate-700 dark:text-slate-200"
                >
                  <option value="staging">Staging</option>
                  <option value="production">Production</option>
                </select>
              </div>
              <Field
                label="Locale"
                hint="la, th ຫຼື en"
                value={settings["thunjai.locale"]}
                onChange={(v) => setValue("thunjai.locale", v)}
                placeholder="la"
              />
            </div>

            <Field
              label="Base URL"
              hint={`ປັດຈຸບັນຈະເອີ້ນ: ${baseUrl}`}
              value={settings["thunjai.base_url"]}
              onChange={(v) => setValue("thunjai.base_url", v)}
              placeholder="https://stg-apis.thunjaiexpress.com"
              icon={<FaRoute />}
              type="url"
            />

            <div className="grid gap-4 md:grid-cols-3">
              <Field
                label="API User"
                value={settings["thunjai.user"]}
                onChange={(v) => setValue("thunjai.user", v)}
                placeholder="username"
                icon={<FaKey />}
              />
              <Field
                label="API Password"
                value={settings["thunjai.pwd"]}
                onChange={(v) => setValue("thunjai.pwd", v)}
                placeholder="password"
                icon={<FaKey />}
                type="password"
              />
              <Field
                label="Secret Key"
                hint="ໃຊ້ HMAC SHA256 ສ້າງ sign"
                value={settings["thunjai.secret_key"]}
                onChange={(v) => setValue("thunjai.secret_key", v)}
                placeholder="secret key"
                icon={<FaKey />}
                type="password"
              />
            </div>

            <div className="flex flex-wrap justify-end gap-3">
              <button
                onClick={() => void testToken()}
                disabled={testing || saving}
                className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50 dark:bg-white dark:text-slate-900"
              >
                {testing ? <FaSpinner className="animate-spin" /> : <FaPlug />}
                ທົດສອບ Token
              </button>
              <button
                onClick={() => void save()}
                disabled={saving || testing}
                className="inline-flex items-center gap-2 rounded-lg bg-teal-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-50"
              >
                {saving ? <FaSpinner className="animate-spin" /> : <FaSave />}
                ບັນທຶກ
              </button>
            </div>
          </SectionCard>

          {tokenResult && (
            <div
              className={`rounded-lg border p-4 text-sm ${
                tokenResult.ok
                  ? "border-emerald-200 bg-emerald-500/10 text-emerald-700 dark:border-emerald-500/20 dark:text-emerald-300"
                  : "border-rose-200 bg-rose-500/10 text-rose-700 dark:border-rose-500/20 dark:text-rose-300"
              }`}
            >
              <div className="mb-2 flex items-center gap-2 font-semibold">
                <FaCheckCircle />
                HTTP {tokenResult.status} {tokenResult.statusText || ""}
              </div>
              <p className="mb-2 text-xs opacity-80">{tokenResult.url}</p>
              <pre className="max-h-64 overflow-auto rounded-lg bg-black/80 p-3 text-[11px] text-white">
                {JSON.stringify(tokenResult.body, null, 2)}
              </pre>
            </div>
          )}

          <SectionCard
            title="API ຂອງ ThunJai"
            subtitle="ຂອບເຂດນີ້ເປັນ external courier module ແຍກຕ່າງຫາກຈາກລະບົບເດີມ"
            icon={<FaClipboardList className="text-sky-500" />}
          >
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {apiGroups.map((group, index) => (
                <div
                  key={group.title}
                  className="rounded-lg border border-slate-200/70 bg-white/60 p-4 dark:border-white/10 dark:bg-white/5"
                >
                  <div className="mb-3 flex items-center gap-2">
                    <span
                      className={`flex h-8 w-8 items-center justify-center rounded-lg ${endpointTone(index)}`}
                    >
                      {group.icon}
                    </span>
                    <h2 className="text-sm font-bold text-slate-800 dark:text-white">
                      {group.title}
                    </h2>
                  </div>
                  <div className="space-y-1.5">
                    {group.items.map((item) => (
                      <div
                        key={item.path}
                        className={`flex items-center justify-between gap-2 rounded-md px-2 py-1.5 font-mono text-[11px] ${
                          item.done
                            ? "bg-slate-100 text-slate-700 dark:bg-slate-950/50 dark:text-slate-300"
                            : "bg-slate-50 text-slate-400 line-through dark:bg-slate-950/30 dark:text-slate-500"
                        }`}
                      >
                        <span>{item.path}</span>
                        {item.done ? (
                          <FaCheckCircle className="shrink-0 text-emerald-500" />
                        ) : (
                          <span className="shrink-0 rounded bg-slate-200 px-1 text-[9px] not-italic no-underline dark:bg-white/10">
                            ຍັງ
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </SectionCard>

          <SaveBar
            saving={saving}
            savedAt={savedAt}
            error={error}
            onSave={() => void save()}
          />
        </>
      )}
    </div>
  );
}
