"use client";

import { useEffect, useState } from "react";
import { FaSearch } from "react-icons/fa";
import { Actions } from "@/lib/api";
// Ported from server actions: getBillShipmentData, saveBillShipment

interface BillItem { doc_date: string; doc_no: string; cust_code: string; transport_code: string; transport_name: string; cus_name: string; }
interface Transport { code: string; name_1: string; }

export default function BillShipmentPage() {
  const [items, setItems] = useState<BillItem[]>([]);
  const [transports, setTransports] = useState<Transport[]>([]);
  const [searchText, setSearchText] = useState("");
  const [loading, setLoading] = useState(true);

  const fetchItems = (search?: string) => {
    setLoading(true);
    Actions.getBillShipmentData(search).then((data) => { setItems((data.data || []) as BillItem[]); setTransports((data.transport || []) as Transport[]); }).catch(console.error).finally(() => setLoading(false));
  };

  useEffect(() => { fetchItems(); }, []);

  const handleSave = async (docNo: string, transportCode: string) => {
    await Actions.saveBillShipment(docNo, transportCode);
    fetchItems(searchText || undefined);
  };

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-800 dark:text-white mb-6">ຂໍ້ມູນບິນຈັດສົ່ງ</h1>
      <div className="glass rounded-lg p-4 mb-6">
        <form onSubmit={(e) => { e.preventDefault(); fetchItems(searchText); }} className="flex gap-4">
          <input type="text" value={searchText} onChange={(e) => setSearchText(e.target.value)} placeholder="ຄົ້ນຫາເລກບິນ..." className="flex-1 px-3 py-2 glass-input rounded-lg" />
          <button type="submit" className="bg-teal-600 hover:bg-teal-700 text-white px-4 py-2 rounded-lg flex items-center gap-2"><FaSearch /> ຄົ້ນຫາ</button>
        </form>
      </div>
      <div className="glass rounded-lg overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-white/30 dark:bg-white/5"><tr><th className="px-4 py-3 text-left text-slate-600 dark:text-slate-300">ວັນທີ</th><th className="px-4 py-3 text-left text-slate-600 dark:text-slate-300">ເລກທີ</th><th className="px-4 py-3 text-left text-slate-600 dark:text-slate-300">ລູກຄ້າ</th><th className="px-4 py-3 text-left text-slate-600 dark:text-slate-300">ຊື່ລູກຄ້າ</th><th className="px-4 py-3 text-left text-slate-600 dark:text-slate-300">ຂົນສົ່ງ</th><th className="px-4 py-3 text-left text-slate-600 dark:text-slate-300">ເລືອກຂົນສົ່ງ</th></tr></thead>
          <tbody>
            {loading ? <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-400 dark:text-slate-500">ກຳລັງໂຫຼດ...</td></tr>
            : items.length === 0 ? <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-400 dark:text-slate-500">ບໍ່ມີຂໍ້ມູນ</td></tr>
            : items.map((item) => (
              <tr key={item.doc_no} className="border-t border-slate-200/30 dark:border-white/5 hover:bg-white/30 dark:hover:bg-white/5">
                <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{item.doc_date}</td><td className="px-4 py-3 font-medium text-slate-800 dark:text-white">{item.doc_no}</td><td className="px-4 py-3 text-slate-600 dark:text-slate-300">{item.cust_code}</td><td className="px-4 py-3 text-slate-600 dark:text-slate-300">{item.cus_name}</td><td className="px-4 py-3 text-slate-600 dark:text-slate-300">{item.transport_name || "-"}</td>
                <td className="px-4 py-3"><select className="px-2 py-1 glass-input rounded text-xs" defaultValue={item.transport_code || ""} onChange={(e) => handleSave(item.doc_no, e.target.value)}><option value="" disabled>ເລືອກ</option>{transports.map((t) => <option key={t.code} value={t.code}>{t.name_1}</option>)}</select></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
