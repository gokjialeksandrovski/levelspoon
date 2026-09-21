import { getIntakePrefill } from "@/features/intake/actions/intake";

import { IntakeForm } from "./intake-form";

// Server-rendered prefill: every stored answer is on the first paint, so a
// returning user never watches the form fill itself in.
const EstimatePage = async () => {
  const prefill = await getIntakePrefill();
  return <IntakeForm prefill={prefill} />;
};

export default EstimatePage;
