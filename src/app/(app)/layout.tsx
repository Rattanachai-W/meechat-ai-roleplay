import { getCurrentUser } from "@/lib/auth/current-user";
import { getOrCreateWalletSummary } from "@/lib/energy/service";
import { AppShell } from "@/features/shell/components/app-shell";

/** Layout หลัง login ทุกหน้าใน (app) — nav shell + wallet chip */
export default async function AppLayout({ children }: LayoutProps<"/">) {
  const user = await getCurrentUser();

  let walletTotal: number | null = null;
  if (user) {
    try {
      const wallet = await getOrCreateWalletSummary(user.id);
      walletTotal = wallet.totalBalance;
    } catch {
      // DB มีปัญหา — ซ่อน chip ไว้ ไม่พังทั้งหน้า
      walletTotal = null;
    }
  }

  return (
    <AppShell user={user} walletTotal={user ? (walletTotal ?? 0) : null}>
      {children}
    </AppShell>
  );
}
