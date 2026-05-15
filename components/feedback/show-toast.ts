import { toast } from "sonner";

const toastClassNames = {
  toast: "border border-zinc-200 bg-white text-zinc-950 shadow-sm",
  title: "text-zinc-950",
  description: "text-zinc-600",
  error: "border-zinc-300 bg-zinc-50",
  warning: "border-zinc-300 bg-zinc-50",
};

export function showError(message: string) {
  toast.error(message, { classNames: toastClassNames });
}

export function showWarning(message: string) {
  toast.warning(message, { classNames: toastClassNames });
}
