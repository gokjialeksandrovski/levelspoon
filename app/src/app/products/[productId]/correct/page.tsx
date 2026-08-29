// app/src/app/products/[productId]/correct/page.tsx
import { notFound } from "next/navigation";

import { getProductForCorrection } from "@/actions/products";

import { CorrectionForm } from "./correction-form";

const CorrectProductPage = async ({ params }: { params: Promise<{ productId: string }> }) => {
  const { productId } = await params;
  const product = await getProductForCorrection(productId);
  if (!product) {
    notFound();
  }
  return <CorrectionForm product={product} />;
};

export default CorrectProductPage;
