import { AppShell } from "@/components/app-shell";

export default function PacksLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>;
}