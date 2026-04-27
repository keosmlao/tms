"use client";

import { useEffect, useState } from "react";
import { FaPlus, FaEdit, FaTrash, FaSave, FaTimes } from "react-icons/fa";
import { Actions } from "@/lib/api";
// Ported from server actions: getDrivers, addDriver, updateDriver, deleteDriver

interface Driver { code: string; name_1: string; }

export default function DriversManagePage() {
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [editCode, setEditCode] = useState<string | null>(null);
  const [form, setForm] = useState({ code: "", name_1: "" });

  const fetchDrivers = () => { setLoading(true); Actions.getDrivers().then((data) => setDrivers(data as Driver[])).catch(console.error).finally(() => setLoading(false)); };
  useEffect(() => { fetchDrivers(); }, []);

  const handleAdd = async () => {
    if (!form.code || !form.name_1) return;
    await Actions.addDriver(form.code, form.name_1);
    setForm({ code: "", name_1: "" }); setShowAdd(false); fetchDrivers();
  };
  const handleUpdate = async (code: string, name_1: string) => {
    await Actions.updateDriver(code, name_1);
    setEditCode(null); fetchDrivers();
  };
  const handleDelete = async (code: string) => {
    if (!confirm("ຕ້ອງການລຶບແທ້ບໍ່?")) return;
    await Actions.deleteDriver(code); fetchDrivers();
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-800 dark:text-white">ຄົນຂັບລົດ</h1>
        <button onClick={() => setShowAdd(!showAdd)} className="bg-teal-600 text-white px-4 py-2 rounded-lg hover:bg-teal-700 flex items-center gap-2"><FaPlus /> ເພີ່ມຄົນຂັບ</button>
      </div>
      {showAdd && (
        <div className="glass rounded-lg p-4 mb-6">
          <div className="flex gap-4 items-end">
            <div><label className="block text-sm font-medium text-gray-700 dark:text-slate-200 mb-1">ລະຫັດ</label><input type="text" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} className="glass-input px-3 py-2 rounded-lg" /></div>
            <div><label className="block text-sm font-medium text-gray-700 dark:text-slate-200 mb-1">ຊື່</label><input type="text" value={form.name_1} onChange={(e) => setForm({ ...form, name_1: e.target.value })} className="glass-input px-3 py-2 rounded-lg" /></div>
            <button onClick={handleAdd} className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 flex items-center gap-2"><FaSave /> ບັນທຶກ</button>
            <button onClick={() => setShowAdd(false)} className="bg-gray-400 text-white px-4 py-2 rounded-lg hover:bg-gray-500 flex items-center gap-2"><FaTimes /> ຍົກເລີກ</button>
          </div>
        </div>
      )}
      <div className="glass rounded-lg overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-white/30 dark:bg-white/5"><tr><th className="px-4 py-3 text-left dark:text-slate-300">ລະຫັດ</th><th className="px-4 py-3 text-left dark:text-slate-300">ຊື່</th><th className="px-4 py-3 text-left dark:text-slate-300">ຈັດການ</th></tr></thead>
          <tbody>
            {loading ? <tr><td colSpan={3} className="px-4 py-8 text-center text-gray-400">ກຳລັງໂຫຼດ...</td></tr>
            : drivers.length === 0 ? <tr><td colSpan={3} className="px-4 py-8 text-center text-gray-400">ບໍ່ມີຂໍ້ມູນ</td></tr>
            : drivers.map((d) => (
              <tr key={d.code} className="border-t border-slate-200/30 dark:border-white/5 hover:bg-white/30 dark:hover:bg-white/5">
                <td className="px-4 py-3 font-medium dark:text-white">{d.code}</td>
                <td className="px-4 py-3 dark:text-slate-200">{editCode === d.code ? <input type="text" defaultValue={d.name_1} onKeyDown={(e) => { if (e.key === "Enter") handleUpdate(d.code, (e.target as HTMLInputElement).value); }} onBlur={(e) => handleUpdate(d.code, e.target.value)} className="glass-input px-2 py-1 rounded" autoFocus /> : d.name_1}</td>
                <td className="px-4 py-3"><div className="flex gap-1"><button onClick={() => setEditCode(d.code)} className="p-1.5 text-teal-600 dark:text-teal-400 hover:bg-teal-500/10 rounded"><FaEdit /></button><button onClick={() => handleDelete(d.code)} className="p-1.5 text-red-600 dark:text-red-400 hover:bg-red-500/10 rounded"><FaTrash /></button></div></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
