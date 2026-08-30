// app/src/app/history/layout.tsx
import type { ReactNode } from "react";

import { AppHeader } from "@/components/app-header";

const HistoryLayout = ({ children }: { children: ReactNode }) => (
  <div className="min-h-screen">
    <AppHeader />
    <main className="p-4">{children}</main>
  </div>
);

export default HistoryLayout;
