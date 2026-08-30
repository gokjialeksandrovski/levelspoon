// app/src/app/meals/layout.tsx
import type { ReactNode } from "react";

import { AppHeader } from "@/components/app-header";

const MealsLayout = ({ children }: { children: ReactNode }) => (
  <div className="min-h-screen">
    <AppHeader />
    <main className="p-4">{children}</main>
  </div>
);

export default MealsLayout;
