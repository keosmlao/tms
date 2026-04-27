"use client";

import { useEffect, useState } from "react";
import { FaSearch, FaMapMarkerAlt } from "react-icons/fa";
import { Actions } from "@/lib/api";
// Ported from server actions: getLocations

interface LocationItem { doc_no: string; doc_date: string; transport_name: string; destination: string; log_name: string; latitude: number; longitude: number; }

export default function LocationPage() {
  const [items, setItems] = useState<LocationItem[]>([]);
  const [searchText, setSearchText] = useState("");
  const [loading, setLoading] = useState(true);

  const fetchItems = (search?: string) => {
    setLoading(true);
    Actions.getLocations(search).then((data) => setItems(data as LocationItem[])).catch(console.error).finally(() => setLoading(false));
  };

  useEffect(() => { fetchItems(); }, []);

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-800 dark:text-white mb-6">ທີ່ຕັ້ງການຈັດສົ່ງ</h1>
      <div className="glass rounded-lg p-4 mb-6">
        <form onSubmit={(e) => { e.preventDefault(); fetchItems(searchText); }} className="flex gap-4">
          <input type="text" value={searchText} onChange={(e) => setSearchText(e.target.value)} placeholder="ຄົ້ນຫາ..." className="flex-1 glass-input px-3 py-2 rounded-lg" />
          <button type="submit" className="bg-teal-600 text-white px-4 py-2 rounded-lg hover:bg-teal-700 transition-colors flex items-center gap-2"><FaSearch /> ຄົ້ນຫາ</button>
        </form>
      </div>
      <div className="glass rounded-lg overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-white/30 dark:bg-white/5"><tr><th className="px-4 py-3 text-left text-slate-600 dark:text-slate-300">ເລກທີ</th><th className="px-4 py-3 text-left text-slate-600 dark:text-slate-300">ວັນທີ</th><th className="px-4 py-3 text-left text-slate-600 dark:text-slate-300">ລູກຄ້າ</th><th className="px-4 py-3 text-left text-slate-600 dark:text-slate-300">ປາຍທາງ</th><th className="px-4 py-3 text-left text-slate-600 dark:text-slate-300">ຂົນສົ່ງ</th><th className="px-4 py-3 text-left text-slate-600 dark:text-slate-300">ແຜນທີ່</th></tr></thead>
          <tbody>
            {loading ? <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-400 dark:text-slate-500">ກຳລັງໂຫຼດ...</td></tr>
            : items.length === 0 ? <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-400 dark:text-slate-500">ບໍ່ມີຂໍ້ມູນ</td></tr>
            : items.map((item) => (
              <tr key={item.doc_no} className="border-t border-slate-200/20 dark:border-white/5 hover:bg-white/30 dark:hover:bg-white/5">
                <td className="px-4 py-3 font-medium text-slate-800 dark:text-white">{item.doc_no}</td><td className="px-4 py-3 text-slate-700 dark:text-slate-200">{item.doc_date}</td><td className="px-4 py-3 text-slate-700 dark:text-slate-200">{item.transport_name}</td><td className="px-4 py-3 text-slate-700 dark:text-slate-200">{item.destination}</td><td className="px-4 py-3 text-slate-700 dark:text-slate-200">{item.log_name}</td>
                <td className="px-4 py-3">{item.latitude && item.longitude ? <a href={`https://www.google.com/maps?q=${item.latitude},${item.longitude}`} target="_blank" rel="noopener noreferrer" className="text-teal-600 hover:text-teal-800 dark:text-teal-400 dark:hover:text-teal-300 flex items-center gap-1"><FaMapMarkerAlt /> ເບິ່ງ</a> : <span className="text-slate-400 dark:text-slate-500">-</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
