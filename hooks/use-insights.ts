import { useState } from "react";

import { trpc } from "@/lib/trpc";
import type { InsightPeriod } from "@/shared/insights";

function localToday() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

/** Dashboard data (club + Strava) for the signed-in member, for the chosen period. */
export function useInsights(enabled: boolean, initial: InsightPeriod = "all") {
  const [period, setPeriod] = useState<InsightPeriod>(initial);
  const query = trpc.insights.overview.useQuery(
    { period, today: localToday(), tzOffsetMinutes: new Date().getTimezoneOffset() },
    { enabled, staleTime: 60_000, placeholderData: (previous) => previous },
  );
  return { period, setPeriod, ...query };
}
