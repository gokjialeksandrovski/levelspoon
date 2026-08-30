import type { ReactNode } from "react";

import { IconProvider } from "@/components/icon-provider";

const AppLayout = ({ children }: { children: ReactNode }) => (
  <IconProvider>
    <div className="mx-auto flex min-h-[100dvh] max-w-md flex-col">{children}</div>
  </IconProvider>
);

export default AppLayout;
