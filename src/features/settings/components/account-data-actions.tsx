"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useRouter } from "@/i18n/navigation";

export function AccountDataActions() {
  const t = useTranslations("Settings");
  const router = useRouter();
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  async function exportData() {
    setBusy(true);
    try {
      const res = await fetch("/api/me/export");
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error?.message ?? "Export failed");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "meechat-export.json";
      a.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Export failed");
    } finally {
      setBusy(false);
    }
  }

  async function deleteAccount() {
    if (confirm !== "DELETE") return;
    setBusy(true);
    try {
      const res = await fetch("/api/me/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: "DELETE" }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error?.message ?? "Delete failed");
      router.push("/");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Delete failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4 text-sm">
      <div className="space-y-2">
        <p className="font-medium">{t("exportData")}</p>
        <p className="text-muted-foreground">{t("exportHelp")}</p>
        <Button variant="outline" className="rounded-full" onClick={exportData} disabled={busy}>
          {t("exportData")}
        </Button>
      </div>
      <div className="space-y-2 border-t border-border pt-4">
        <p className="font-medium text-destructive">{t("deleteAccount")}</p>
        <p className="text-muted-foreground">{t("deleteAccountHelp")}</p>
        <Input
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          placeholder={t("deleteConfirm")}
          aria-label={t("deleteConfirm")}
        />
        <Button
          variant="destructive"
          className="rounded-full"
          disabled={busy || confirm !== "DELETE"}
          onClick={deleteAccount}
        >
          {t("deleteAccount")}
        </Button>
      </div>
    </div>
  );
}
