"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { FaSpinner, FaArrowLeft, FaExclamationTriangle } from "react-icons/fa";
import Link from "next/link";
import { Actions } from "@/lib/api";
import AddJobClient, { type JobForEdit } from "../add/page";
import { userErrorMessage } from "@/lib/action-error";

export default function EditJobPage() {
  const router = useRouter();
  const params = useSearchParams();
  const docNo = params.get("id") || "";

  const [job, setJob] = useState<JobForEdit | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!docNo) {
      setError("ບໍ່ມີ id ໃນ URL");
      setLoading(false);
      return;
    }
    let active = true;
    setLoading(true);
    setError(null);
    Actions.getJobForEdit(docNo)
      .then((data) => {
        if (!active) return;
        setJob(data as JobForEdit);
      })
      .catch((e) => {
        if (!active) return;
        setError(userErrorMessage(e, String(e)));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [docNo]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 dark:bg-slate-950">
        <div className="flex flex-col items-center gap-3 text-slate-500 dark:text-slate-400">
          <FaSpinner className="animate-spin text-2xl" />
          <p className="text-sm">ກຳລັງໂຫຼດຂໍ້ມູນຖ້ຽວ...</p>
        </div>
      </div>
    );
  }

  if (error || !job) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 dark:bg-slate-950">
        <div className="max-w-md rounded-2xl border border-amber-200 bg-amber-50 p-6 text-center dark:border-amber-900 dark:bg-amber-950/40">
          <FaExclamationTriangle className="mx-auto mb-3 text-3xl text-amber-500" />
          <h2 className="text-lg font-bold text-amber-800 dark:text-amber-200">
            ບໍ່ສາມາດແກ້ໄຂໄດ້
          </h2>
          <p className="mt-2 text-sm text-amber-700 dark:text-amber-300">
            {error || "ບໍ່ພົບຂໍ້ມູນຖ້ຽວ"}
          </p>
          <div className="mt-4 flex items-center justify-center gap-2">
            <Link
              href="/jobs"
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition-all hover:border-slate-300 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
            >
              <FaArrowLeft size={11} /> ກັບຄືນ
            </Link>
            <button
              type="button"
              onClick={() => router.refresh()}
              className="rounded-xl bg-amber-600 px-4 py-2 text-sm font-semibold text-white transition-all hover:bg-amber-500"
            >
              ລອງໃໝ່
            </button>
          </div>
        </div>
      </div>
    );
  }

  return <AddJobClient mode="edit" initialJob={job} />;
}
