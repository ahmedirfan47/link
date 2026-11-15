import { AppShell } from "@/components/app-shell";

export default function SharedLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
