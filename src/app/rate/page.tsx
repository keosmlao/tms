"use client";

import { useEffect, useState } from "react";
import { FaCheck, FaSpinner, FaStar } from "react-icons/fa";
import { userErrorMessage } from "@/lib/action-error";

interface RatingInfo {
  bill_no: string;
  submitted: boolean;
  stars: number | null;
  comment: string | null;
}

export default function RatePage() {
  const [token, setToken] = useState("");
  const [info, setInfo] = useState<RatingInfo | null>(null);
  const [stars, setStars] = useState(0);
  const [comment, setComment] = useState("");
  const [hover, setHover] = useState(0);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("token") ?? "";
    setToken(t);
    if (!t) {
      setLoading(false);
      setError("ບໍ່ພົບ token");
      return;
    }
    void fetch(`/api/public/rating?token=${encodeURIComponent(t)}`)
      .then(async (r) => {
        if (!r.ok) {
          setError("ບໍ່ພົບການປະເມີນ ຫຼື ໝົດອາຍຸ");
          return;
        }
        const data = (await r.json()) as RatingInfo;
        setInfo(data);
        if (data.submitted) setDone(true);
      })
      .catch(() => setError("ໂຫຼດບໍ່ສຳເລັດ"))
      .finally(() => setLoading(false));
  }, []);

  const submit = async () => {
    if (!stars) return;
    setSubmitting(true);
    setError(null);
    try {
      const r = await fetch("/api/public/rating", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, stars, comment }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data?.error ?? "submit failed");
      setDone(true);
    } catch (e) {
      setError(userErrorMessage(e, "ບັນທຶກບໍ່ສຳເລັດ"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-teal-50 to-slate-100 dark:from-slate-950 dark:to-slate-900 p-4">
      <div className="w-full max-w-md rounded-xl bg-white dark:bg-slate-900 shadow-xl p-6 space-y-4">
        <h1 className="text-xl font-bold text-slate-800 dark:text-white">ປະເມີນການຂົນສົ່ງ</h1>
        {info?.bill_no && (
          <p className="text-xs text-slate-500">ບິນ: <span className="font-mono">{info.bill_no}</span></p>
        )}

        {loading ? (
          <div className="py-8 text-center text-slate-400">
            <FaSpinner className="animate-spin mx-auto mb-2" /> ກຳລັງໂຫຼດ...
          </div>
        ) : error && !info ? (
          <p className="text-rose-600 text-sm">{error}</p>
        ) : done ? (
          <div className="py-8 text-center">
            <FaCheck className="mx-auto text-emerald-500 text-3xl mb-2" />
            <p className="text-emerald-700 dark:text-emerald-400 font-semibold">ຂອບໃຈສຳລັບການປະເມີນ!</p>
            {info?.stars && (
              <div className="mt-3 flex items-center justify-center gap-1">
                {[1, 2, 3, 4, 5].map((s) => (
                  <FaStar key={s} className={s <= (info.stars ?? stars) ? "text-amber-400" : "text-slate-300"} />
                ))}
              </div>
            )}
          </div>
        ) : (
          <>
            <p className="text-sm text-slate-600 dark:text-slate-300">
              ກະລຸນາໃຫ້ດາວ 1–5 ສຳລັບການຂົນສົ່ງຄັ້ງນີ້
            </p>
            <div className="flex items-center justify-center gap-2 py-3">
              {[1, 2, 3, 4, 5].map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setStars(s)}
                  onMouseEnter={() => setHover(s)}
                  onMouseLeave={() => setHover(0)}
                  className="text-4xl transition-transform hover:scale-110"
                >
                  <FaStar className={s <= (hover || stars) ? "text-amber-400" : "text-slate-300 dark:text-slate-600"} />
                </button>
              ))}
            </div>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="ຄຳເຫັນເພີ່ມເຕີມ (ບໍ່ບັງຄັບ)"
              maxLength={1000}
              rows={3}
              className="w-full rounded-lg border border-slate-200 dark:border-slate-700 dark:bg-slate-800 px-3 py-2 text-sm"
            />
            {error && <p className="text-rose-600 text-sm">{error}</p>}
            <button
              type="button"
              onClick={() => void submit()}
              disabled={!stars || submitting}
              className="w-full rounded-lg bg-teal-600 hover:bg-teal-700 text-white py-2.5 text-sm font-semibold disabled:opacity-50 inline-flex items-center justify-center gap-2"
            >
              {submitting ? <><FaSpinner className="animate-spin" /> ກຳລັງສົ່ງ...</> : "ສົ່ງການປະເມີນ"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
