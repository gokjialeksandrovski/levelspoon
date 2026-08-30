// app/src/app/day/[date]/page.tsx
import { notFound } from "next/navigation";

import { DayView } from "./day-view";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const DayPage = async ({ params }: { params: Promise<{ date: string }> }) => {
  const { date } = await params;
  if (!DATE_PATTERN.test(date)) {
    notFound();
  }
  return <DayView date={date} />;
};

export default DayPage;
