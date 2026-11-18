"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { IconReset } from "@/components/ui/icons";
import { toast } from "@/lib/toast";
import { useSession } from "@/lib/useSession";

interface ResetSessionButtonProps {
  className?: string;
  label?: string;
}

export function ResetSessionButton({
  className = "btn-ghost",
  label = "Reset Sesi",
}: ResetSessionButtonProps) {
  const router = useRouter();
  const { resetSession } = useSession();
  const [open, setOpen] = useState(false);

  const handleReset = () => {
    resetSession();
    setOpen(false);
    toast("Sesi penjurian dibersihkan. Silakan mulai batch baru.", "success");
    router.push("/");
  };

  return (
    <>
      <button
        type="button"
        className={`${className} text-rose-300 hover:bg-rose-500/10 hover:text-rose-200`}
        onClick={() => setOpen(true)}
      >
        <IconReset className="h-3.5 w-3.5" />
        <span>{label}</span>
      </button>
      <ConfirmDialog
        open={open}
        danger
        title="Reset sesi penjurian?"
        description="Seluruh daftar URL, skor, catatan juri, hasil audit, dan data duplikat akan dihapus permanen dari browser ini. Tindakan ini tidak dapat dibatalkan."
        confirmLabel="Ya, hapus semua"
        cancelLabel="Batalkan"
        onConfirm={handleReset}
        onCancel={() => setOpen(false)}
      />
    </>
  );
}
