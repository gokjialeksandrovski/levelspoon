// app/src/app/(app)/meals/[mealId]/capture/page.tsx
import { CaptureWizard } from "./capture-wizard";

const CapturePage = async ({ params }: { params: Promise<{ mealId: string }> }) => {
  const { mealId } = await params;
  return <CaptureWizard mealId={mealId} />;
};

export default CapturePage;
