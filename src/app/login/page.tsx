"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  FaTruck,
  FaUser,
  FaLock,
  FaSpinner,
  FaEye,
  FaEyeSlash,
  FaArrowRight,
  FaShieldAlt,
  FaRoute,
  FaChartLine,
} from "react-icons/fa";
import { Auth } from "@/lib/api";
import { useSession } from "@/providers/session-provider";

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <Login />
    </Suspense>
  );
}

function Login() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { refresh } = useSession();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const from = searchParams.get("from") ?? "/";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      await Auth.login(username, password);
      await refresh();
      router.replace(from);
    } catch (err: any) {
      setError(
        err?.message || err?.response?.data?.error || "ຊື່ຜູ້ໃຊ້ ຫຼື ລະຫັດຜ່ານບໍ່ຖືກຕ້ອງ"
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-slate-50 dark:bg-slate-950">
      {/* Decorative background blobs */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-32 -left-32 h-96 w-96 rounded-full bg-teal-400/20 blur-3xl dark:bg-teal-500/15" />
        <div className="absolute top-1/3 -right-32 h-[28rem] w-[28rem] rounded-full bg-emerald-300/20 blur-3xl dark:bg-emerald-500/10" />
        <div className="absolute -bottom-40 left-1/4 h-96 w-96 rounded-full bg-cyan-300/15 blur-3xl dark:bg-cyan-500/10" />
      </div>

      <div className="relative z-10 grid min-h-screen lg:grid-cols-2">
        {/* Left brand panel */}
        <div className="relative hidden overflow-hidden bg-gradient-to-br from-[#0b1b18] via-[#0e2a26] to-[#13403a] lg:flex lg:flex-col lg:justify-between lg:p-12 lg:text-white">
          {/* Subtle grid overlay */}
          <div
            className="pointer-events-none absolute inset-0 opacity-[0.07]"
            style={{
              backgroundImage:
                "linear-gradient(rgba(255,255,255,0.6) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.6) 1px, transparent 1px)",
              backgroundSize: "48px 48px",
              maskImage: "radial-gradient(ellipse at center, black 40%, transparent 75%)",
            }}
          />
          {/* Glow accents */}
          <div className="pointer-events-none absolute -top-24 -right-24 h-72 w-72 rounded-full bg-teal-400/25 blur-3xl" />
          <div className="pointer-events-none absolute bottom-0 left-1/3 h-64 w-64 rounded-full bg-emerald-400/15 blur-3xl" />

          <div className="relative flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/10 ring-1 ring-white/20 backdrop-blur">
              <FaTruck className="text-lg text-teal-200" />
            </div>
            <div className="leading-tight">
              <p className="text-base font-bold tracking-wide">ODIEN GROUP</p>
              <p className="text-[11px] uppercase tracking-[0.18em] text-teal-200/70">
                Transport Suite
              </p>
            </div>
          </div>

          <div className="relative max-w-md">
            <span className="inline-flex items-center gap-2 rounded-full border border-teal-300/30 bg-teal-300/10 px-3 py-1 text-[11px] font-medium uppercase tracking-wider text-teal-200">
              <span className="h-1.5 w-1.5 rounded-full bg-teal-300 shadow-[0_0_8px_rgba(94,234,212,0.8)]" />
              ODG · TMS 2026
            </span>
            <h2 className="mt-5 text-4xl font-bold leading-tight">
              ຈັດການການຂົນສົ່ງ
              <br />
              <span className="bg-gradient-to-r from-teal-200 via-emerald-200 to-cyan-200 bg-clip-text text-transparent">
                ໃຫ້ສະຫຼາດກວ່າ
              </span>
            </h2>
            <p className="mt-4 text-sm leading-relaxed text-slate-300/85">
              ລະບົບບໍລິຫານການຂົນສົ່ງແບບຄົບວົງຈອນ — ຕິດຕາມເສັ້ນທາງ,
              ບໍລິຫານກອງລົດ, ແລະ ວິເຄາະຜົນງານໃນທີ່ດຽວ.
            </p>

            <div className="mt-8 grid grid-cols-3 gap-3">
              <Feature icon={<FaRoute />} label="ຕິດຕາມເສັ້ນທາງ" />
              <Feature icon={<FaChartLine />} label="ວິເຄາະຜົນງານ" />
              <Feature icon={<FaShieldAlt />} label="ປອດໄພ" />
            </div>
          </div>

          <div className="relative flex items-center justify-between text-xs text-slate-400">
            <p>&copy; {new Date().getFullYear()} ODG · All rights reserved.</p>
            <p className="font-medium text-teal-200/80">v2026.1</p>
          </div>
        </div>

        {/* Right form panel */}
        <div className="flex items-center justify-center px-6 py-12 sm:px-10">
          <div className="w-full max-w-md">
            {/* Mobile-only brand header */}
            <div className="mb-8 flex items-center gap-3 lg:hidden">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#0b1b18] shadow-lg">
                <FaTruck className="text-lg text-teal-200" />
              </div>
              <div className="leading-tight">
                <p className="text-base font-bold text-slate-800 dark:text-white">
                  ODIEN GROUP
                </p>
                <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                  Transport Suite
                </p>
              </div>
            </div>

            <div className="mb-8">
              <h1 className="text-3xl font-bold text-slate-900 dark:text-white">
                ຍິນດີຕ້ອນຮັບກັບມາ 👋
              </h1>
              <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                ກະລຸນາເຂົ້າສູ່ລະບົບເພື່ອສືບຕໍ່ເຂົ້າໃຊ້ງານ TMS
              </p>
            </div>

            {error && (
              <div className="animate-fadeIn mb-5 flex items-start gap-3 rounded-xl border border-rose-200/70 bg-rose-50/80 p-3.5 dark:border-rose-500/20 dark:bg-rose-500/10">
                <div className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-rose-100 dark:bg-rose-500/20">
                  <span className="text-xs font-bold text-rose-600 dark:text-rose-400">
                    !
                  </span>
                </div>
                <p className="text-sm leading-relaxed text-rose-700 dark:text-rose-300">
                  {error}
                </p>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">
                  ຊື່ຜູ້ໃຊ້
                </label>
                <div className="group relative">
                  <FaUser className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-sm text-slate-400 transition-colors group-focus-within:text-teal-600 dark:text-slate-500 dark:group-focus-within:text-teal-400" />
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="glass-input h-12 w-full rounded-xl pl-11 pr-4 text-sm text-slate-800 placeholder:text-slate-400 dark:text-slate-100 dark:placeholder:text-slate-500"
                    placeholder="ປ້ອນຊື່ຜູ້ໃຊ້ຂອງທ່ານ"
                    autoComplete="username"
                    required
                  />
                </div>
              </div>

              <div>
                <div className="mb-2 flex items-center justify-between">
                  <label className="text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">
                    ລະຫັດຜ່ານ
                  </label>
                </div>
                <div className="group relative">
                  <FaLock className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-sm text-slate-400 transition-colors group-focus-within:text-teal-600 dark:text-slate-500 dark:group-focus-within:text-teal-400" />
                  <input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="glass-input h-12 w-full rounded-xl pl-11 pr-12 text-sm text-slate-800 placeholder:text-slate-400 dark:text-slate-100 dark:placeholder:text-slate-500"
                    placeholder="ປ້ອນລະຫັດຜ່ານຂອງທ່ານ"
                    autoComplete="current-password"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <FaEyeSlash size={14} /> : <FaEye size={14} />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="group relative flex h-12 w-full items-center justify-center gap-2 overflow-hidden rounded-xl bg-gradient-to-br from-teal-600 to-emerald-700 text-sm font-semibold text-white shadow-lg shadow-teal-900/20 transition-all hover:from-teal-500 hover:to-emerald-600 hover:shadow-xl hover:shadow-teal-900/30 focus:outline-none focus:ring-4 focus:ring-teal-500/30 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60 dark:from-teal-500 dark:to-emerald-600 dark:text-slate-950 dark:shadow-teal-500/20"
              >
                {/* Shimmer overlay */}
                <span className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/20 to-transparent transition-transform duration-700 group-hover:translate-x-full" />
                {loading ? (
                  <>
                    <FaSpinner className="animate-spin" />
                    <span>ກຳລັງເຂົ້າສູ່ລະບົບ...</span>
                  </>
                ) : (
                  <>
                    <span>ເຂົ້າສູ່ລະບົບ</span>
                    <FaArrowRight className="transition-transform group-hover:translate-x-0.5" />
                  </>
                )}
              </button>
            </form>

            <div className="mt-8 border-t border-slate-200/70 pt-5 text-center dark:border-slate-800">
              <p className="text-xs text-slate-400 dark:text-slate-600">
                ມີບັນຫາໃນການເຂົ້າສູ່ລະບົບ? ກະລຸນາຕິດຕໍ່ຜູ້ດູແລລະບົບ
              </p>
              <p className="mt-3 text-xs text-slate-400 dark:text-slate-600 lg:hidden">
                &copy; {new Date().getFullYear()} ODG - TMS. All rights reserved.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Feature({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-3 backdrop-blur transition-colors hover:border-teal-300/30 hover:bg-white/[0.07]">
      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal-400/15 text-teal-200">
        {icon}
      </div>
      <p className="mt-2 text-xs font-medium text-slate-200/90">{label}</p>
    </div>
  );
}
