import { notFound } from "next/navigation";

import { DayView } from "./day-view";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

interface DayPageProps {
  params: Promise<{ date: string }>;
  searchParams: Promise<{ deleted?: string | string[] }>;
}

const DayPage = async ({ params, searchParams }: DayPageProps) => {
  const [{ date }, { deleted }] = await Promise.all([params, searchParams]);
  if (!DATE_PATTERN.test(date)) {
    notFound();
  }
  // Set by DeleteMeal on its way here, so this day can offer Undo.
  return <DayView date={date} deletedMealId={typeof deleted === "string" ? deleted : null} />;
};

export default DayPage;
