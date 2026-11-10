import { AppShell } from "@/components/app-shell";

export default function CallsLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>;
}