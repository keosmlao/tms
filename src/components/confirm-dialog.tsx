"use client";

import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  FaCheck,
  FaExclamationTriangle,
  FaInfoCircle,
  FaSpinner,
  FaTimes,
  FaTrash,
} from "react-icons/fa";

type ConfirmTone = "default" | "danger" | "warning" | "info";

export interface ConfirmOptions {
  title?: string;
  message?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: ConfirmTone;
}

type ConfirmFn = (opts?: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

export function useConfirm(): ConfirmFn {
  const fn = useContext(ConfirmContext);
  if (!fn) {
    throw new Error("useConfirm must be used inside <ConfirmProvider>");
  }
  return fn;
}

const TONE_STYLES: Record<
  ConfirmTone,
  { icon: ReactNode; iconBg: string; confirmBtn: string }
> = {
  default: {
    icon: <FaInfoCircle />,
    iconBg: "bg-teal-500/15 text-teal-600 dark:text-teal-400",
    confirmBtn: "bg-teal-600 hover:bg-teal-700",
  },
  danger: {
    icon: <FaTrash />,
    iconBg: "bg-rose-500/15 text-rose-600 dark:text-rose-400",
    confirmBtn: "bg-rose-600 hover:bg-rose-700",
  },
  warning: {
    icon: <FaExclamationTriangle />,
    iconBg: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
    confirmBtn: "bg-amber-600 hover:bg-amber-700",
  },
  info: {
    icon: <FaInfoCircle />,
    iconBg: "bg-sky-500/15 text-sky-600 dark:text-sky-400",
    confirmBtn: "bg-sky-600 hover:bg-sky-700",
  },
};

interface PendingConfirm extends ConfirmOptions {
  resolve: (ok: boolean) => void;
}

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<PendingConfirm | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const resolverRef = useRef<((ok: boolean) => void) | null>(null);

  const confirm = useCallback<ConfirmFn>(
    (opts) =>
      new Promise<boolean>((resolve) => {
        // If a previous prompt is still up, dismiss it first.
        if (resolverRef.current) resolverRef.current(false);
        resolverRef.current = resolve;
        setPending({ ...(opts ?? {}), resolve });
      }),
    []
  );

  const close = (ok: boolean) => {
    const r = resolverRef.current;
    resolverRef.current = null;
    setPending(null);
    setSubmitting(false);
    r?.(ok);
  };

  const tone: ConfirmTone = pending?.tone ?? "default";
  const styles = TONE_STYLES[tone];

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {pending && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4 animate-in fade-in"
          onClick={() => !submitting && close(false)}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="glass rounded-xl w-full max-w-md overflow-hidden shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6">
              <div className="flex items-start gap-4">
                <div
                  className={`w-12 h-12 rounded-full flex items-center justify-center text-xl shrink-0 ${styles.iconBg}`}
                >
                  {styles.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-base font-bold text-slate-800 dark:text-white">
                    {pending.title ?? "ຢືນຢັນ?"}
                  </h3>
                  {pending.message && (
                    <div className="mt-2 text-sm text-slate-600 dark:text-slate-300 whitespace-pre-wrap">
                      {pending.message}
                    </div>
                  )}
                </div>
              </div>
            </div>
            <div className="px-6 py-3 bg-white/30 dark:bg-white/5 border-t border-slate-200/30 dark:border-white/5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => close(false)}
                disabled={submitting}
                className="px-4 py-2 rounded-lg text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/5 disabled:opacity-50 inline-flex items-center gap-1.5"
              >
                <FaTimes size={11} />
                {pending.cancelLabel ?? "ຍົກເລີກ"}
              </button>
              <button
                type="button"
                autoFocus
                onClick={() => {
                  setSubmitting(true);
                  // Yield once so the spinner renders before the parent
                  // starts the (likely async) work.
                  setTimeout(() => close(true), 0);
                }}
                disabled={submitting}
                className={`px-5 py-2 rounded-lg text-xs font-semibold text-white disabled:opacity-50 inline-flex items-center gap-1.5 ${styles.confirmBtn}`}
              >
                {submitting ? (
                  <FaSpinner className="animate-spin" size={11} />
                ) : (
                  <FaCheck size={11} />
                )}
                {pending.confirmLabel ?? "ຢືນຢັນ"}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}
