import { REESTIMATE_PARAM } from "@/features/lazy-track/actions/lazy-track.utils";

import { CaptureWizard } from "./capture-wizard";

interface CapturePageProps {
  params: Promise<{ mealId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const CapturePage = async ({ params, searchParams }: CapturePageProps) => {
  const { mealId } = await params;
  const reestimate = (await searchParams)[REESTIMATE_PARAM];
  return <CaptureWizard mealId={mealId} reestimate={typeof reestimate === "string" ? reestimate : null} />;
};

export default CapturePage;
