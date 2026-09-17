import { notFound } from "next/navigation";

import { getProductForCorrection } from "@/features/products/actions/products";
import { getPhotoUrl } from "@/lib/s3";

import { CorrectionForm } from "./correction-form";

const CorrectProductPage = async ({ params }: { params: Promise<{ productId: string }> }) => {
  const { productId } = await params;
  const product = await getProductForCorrection(productId);
  if (!product) {
    notFound();
  }
  // Signed here rather than in the action: the action stays S3-free so it can be
  // tested against Postgres alone, and the URL expires in five minutes anyway.
  const labelPhotoUrl = product.nutritionPhotoKey ? await getPhotoUrl(product.nutritionPhotoKey) : null;
  // Keyed on whether a correction exists so a revert's router.refresh() remounts
  // the form: its fields are seeded once from the figures handed down, and
  // without a remount the restored label values would sit behind stale state.
  return (
    <CorrectionForm
      key={String(product.hasOverride)}
      product={product}
      labelPhotoUrl={labelPhotoUrl}
    />
  );
};

export default CorrectProductPage;
