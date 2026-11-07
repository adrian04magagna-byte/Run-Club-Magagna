import { useLocalSearchParams, useRouter } from "expo-router";

import { AthleteSheet } from "@/components/coach-athletes";
import { Screen } from "@/components/run-ui";

/** The athlete sheet has its own address, so the browser's back gesture returns to the list. */
export default function AthleteRoute() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const back = () => (router.canGoBack() ? router.back() : router.replace("/(tabs)/club"));
  return <Screen scroll><AthleteSheet athleteId={Number(id)} onBack={back} /></Screen>;
}
