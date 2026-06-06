"use client";

import { useEffect, useState } from "react";
import { FaHistory, FaSearch, FaSpinner, FaUser } from "react-icons/fa";
import { Actions } from "@/lib/api";
import { StatusPageHeader } from "@/components/status-page-shell";
import { FIXED_YEAR_END, FIXED_YEAR_START } from "@/lib/fixed-year";

interface AuditEntry {
  id: number;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  user_code: string | null;
  user_name: string | null;
  ip_addr: string | null;
  changes: Record<string, unknown> | null;
  created_at: string;
}

function actionLabel(action: string) {
  const map: Record<string, string> = {
    "auth.login": "ເຂົ້າລະບົບ",
    "auth.login_failed": "ເຂົ້າລະບົບບໍ່ສຳເລັດ",
    "auth.logout": "ອອກຈາກລະບົບ",
    "bill.update_transport": "ປ່ຽນຂົນສົ່ງ",
    "pending_bill.add_manual": "ເພີ່ມບິນເຂົ້າຄິວ",
    "pending_bill.remove_manual": "ລົບບິນຈາກຄິວ",
    "pending_bill.bulk_update": "ປັບປຸງຫຼາຍບິນພ້ອມກັນ",
    "push.sent": "ສົ່ງ Push Notification",
  };
  return map[action] ?? action;
}

function userAgentLabel(changes: Record<string, unknown> | null) {
  const value = changes?.user_agent;
  return typeof value === "string" && value.trim() ? value : "";
}

export default function AuditLogPage() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [fromDate, setFromDate] = useState(FIXED_YEAR_START);
  const [toDate, setToDate] = useState(FIXED_YEAR_END);
  const [entityId, setEntityId] = useState("");
  const [userCode, setUserCode] = useState("");
  const [action, setAction] = useState("");

  const fetchLog = async (override?: { action?: string; entityId?: string }) => {
    setLoading(true);
    try {
      const data = await Actions.getAuditLog({
        fromDate,
        toDate,
        entityId: (override?.entityId ?? entityId).trim() || undefined,
        userCode: userCode.trim() || undefined,
        action: (override?.action ?? action).trim() || undefined,
        limit: 500,
      });
      setEntries((data ?? []) as AuditEntry[]);
    } catch (e) {
      console.error(e);
      setEntries([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchLog();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-5">
      <StatusPageHeader
        title="Audit Log"
        subtitle="ກວດປະຫວັດ login/logout ແລະການປ່ຽນແປງສຳຄັນຂອງລະບົບ"
        icon={<FaHistory />}
        tone="slate"
      />

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void fetchLog();
        }}
        className="glass rounded-lg p-4 grid grid-cols-2 md:grid-cols-6 gap-3"
      >
        <div className="col-span-1">
          <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">ຈາກວັນທີ</label>
          <input
            type="date"
            value={fromDate}
            min={FIXED_YEAR_START}
            max={FIXED_YEAR_END}
            onChange={(e) => setFromDate(e.target.value)}
            className="w-full glass-input rounded-lg px-3 py-2 text-xs text-slate-700 dark:text-slate-200"
          />
        </div>
        <div className="col-span-1">
          <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">ຫາວັນທີ</label>
          <input
            type="date"
            value={toDate}
            min={FIXED_YEAR_START}
            max={FIXED_YEAR_END}
            onChange={(e) => setToDate(e.target.value)}
            className="w-full glass-input rounded-lg px-3 py-2 text-xs text-slate-700 dark:text-slate-200"
          />
        </div>
        <div className="col-span-1">
          <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">ເລກບິນ / Entity</label>
          <input
            type="text"
            value={entityId}
            onChange={(e) => setEntityId(e.target.value)}
            placeholder="doc_no..."
            className="w-full glass-input rounded-lg px-3 py-2 text-xs text-slate-700 dark:text-slate-200"
          />
        </div>
        <div className="col-span-1">
          <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">ຜູ້ໃຊ້</label>
          <input
            type="text"
            value={userCode}
            onChange={(e) => setUserCode(e.target.value)}
            placeholder="user code"
            className="w-full glass-input rounded-lg px-3 py-2 text-xs text-slate-700 dark:text-slate-200"
          />
        </div>
        <div className="col-span-1">
          <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">Action</label>
          <select
            value={action}
            onChange={(e) => setAction(e.target.value)}
            className="w-full glass-input rounded-lg px-3 py-2 text-xs text-slate-700 dark:text-slate-200"
          >
            <option value="">ທັງໝົດ</option>
            <option value="auth.login">ເຂົ້າລະບົບ</option>
            <option value="auth.login_failed">ເຂົ້າລະບົບບໍ່ສຳເລັດ</option>
            <option value="auth.logout">ອອກຈາກລະບົບ</option>
            <option value="bill.update_transport">ປ່ຽນຂົນສົ່ງ</option>
            <option value="pending_bill.add_manual">ເພີ່ມບິນເຂົ້າຄິວ</option>
            <option value="pending_bill.remove_manual">ລົບບິນຈາກຄິວ</option>
            <option value="pending_bill.bulk_update">ປັບປຸງຫຼາຍບິນ</option>
            <option value="push.sent">Push Notification</option>
          </select>
        </div>
        <div className="col-span-1 flex items-end">
          <button
            type="submit"
            disabled={loading}
            className="w-full px-3 py-2 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold disabled:opacity-50 inline-flex items-center justify-center gap-1.5"
          >
            <FaSearch size={10} /> ຄົ້ນຫາ
          </button>
        </div>
        <div className="col-span-2 md:col-span-6 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => {
              setAction("auth.login");
              setEntityId("");
              void fetchLog({ action: "auth.login", entityId: "" });
            }}
            className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-[11px] font-bold text-emerald-700 dark:text-emerald-400"
          >
            ເບິ່ງຜູ້ເຂົ້າໃຊ້
          </button>
          <button
            type="button"
            onClick={() => {
              setAction("auth.login_failed");
              setEntityId("");
              void fetchLog({ action: "auth.login_failed", entityId: "" });
            }}
            className="rounded-full border border-rose-500/20 bg-rose-500/10 px-3 py-1 text-[11px] font-bold text-rose-700 dark:text-rose-400"
          >
            login ຜິດ
          </button>
        </div>
      </form>

      {loading ? (
        <div className="glass rounded-lg py-14 flex items-center justify-center text-slate-400">
          <FaSpinner className="animate-spin mr-2" /> ກຳລັງໂຫຼດ...
        </div>
      ) : entries.length === 0 ? (
        <div className="glass rounded-lg py-14 text-center text-sm text-slate-400">ບໍ່ມີລາຍການ</div>
      ) : (
        <div className="glass rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 dark:bg-white/5 text-slate-500 dark:text-slate-400 text-[10px] uppercase tracking-wider">
                <tr>
                  <th className="px-3 py-2 text-left font-semibold">ເວລາ</th>
                  <th className="px-3 py-2 text-left font-semibold">Action</th>
                  <th className="px-3 py-2 text-left font-semibold">Entity</th>
                  <th className="px-3 py-2 text-left font-semibold">User</th>
                  <th className="px-3 py-2 text-left font-semibold">IP / Device</th>
                  <th className="px-3 py-2 text-left font-semibold">ການປ່ຽນແປງ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200/60 dark:divide-white/5">
                {entries.map((e) => (
                  <tr key={e.id} className="hover:bg-white/40 dark:hover:bg-white/5">
                    <td className="px-3 py-2 text-slate-500 dark:text-slate-400 font-mono text-[10px]">{e.created_at}</td>
                    <td className="px-3 py-2 font-semibold text-slate-700 dark:text-slate-200">{actionLabel(e.action)}</td>
                    <td className="px-3 py-2 font-mono text-slate-600 dark:text-slate-300">{e.entity_id || "-"}</td>
                    <td className="px-3 py-2 text-slate-600 dark:text-slate-300">
                      <span className="inline-flex items-center gap-1 font-semibold">
                        <FaUser className="text-slate-400" size={9} />
                        {e.user_name || e.user_code || "system"}
                      </span>
                      {e.user_code && e.user_name !== e.user_code && (
                        <span className="block font-mono text-[10px] text-slate-400">{e.user_code}</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-[10px] text-slate-500 dark:text-slate-400">
                      <span className="block font-mono">{e.ip_addr || "-"}</span>
                      {userAgentLabel(e.changes) && (
                        <span className="block max-w-[220px] truncate" title={userAgentLabel(e.changes)}>
                          {userAgentLabel(e.changes)}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-[10px] font-mono text-slate-500 dark:text-slate-400 max-w-md truncate">
                      {e.changes ? JSON.stringify(e.changes) : "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
