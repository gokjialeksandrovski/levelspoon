import { notFound } from "next/navigation";

import { BarcodeScannerHarness } from "./barcode-scanner-harness";

const DevBarcodeScannerPage = () => {
  if (process.env.NODE_ENV === "production") {
    notFound();
  }
  return <BarcodeScannerHarness />;
};

export default DevBarcodeScannerPage;
