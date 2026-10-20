import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { Redirect, useLocalSearchParams, useRouter } from "expo-router";

import { C, Screen } from "@/components/run-ui";
import { MemberGate } from "@/components/member-gate";
import { useAuth } from "@/hooks/use-auth";
import { trpc } from "@/lib/trpc";

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function CallbackProcessor() {
  const params = useLocalSearchParams<{ code?: string | string[]; state?: string | string[]; error?: string | string[] }>();
  const router = useRouter();
  const utils = trpc.useUtils();
  const complete = trpc.strava.complete.useMutation();
  const cancel = trpc.strava.cancel.useMutation();
  const started = useRef(false);
  const [message, setMessage] = useState("Finalizando a conexão segura com o Strava…");
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const code = first(params.code);
    const state = first(params.state);
    const providerError = first(params.error);

    void (async () => {
      if (providerError) {
        if (state) await cancel.mutateAsync({ state }).catch(() => undefined);
        setFailed(true);
        setMessage(providerError === "access_denied"
          ? "A autorização foi cancelada. Nenhuma conta Strava foi conectada."
          : "O Strava não concluiu a autorização. Tente novamente.");
        return;
      }
      if (!code || !state) {
        setFailed(true);
        setMessage("O retorno do Strava está incompleto. Volte ao perfil e tente conectar novamente.");
        return;
      }
      try {
        await complete.mutateAsync({ code, state });
        await utils.strava.status.invalidate();
        router.replace("/strava");
      } catch (error) {
        setFailed(true);
        setMessage(error instanceof Error ? error.message : "Não foi possível finalizar a conexão Strava.");
      }
    })();
  }, [cancel, complete, params.code, params.error, params.state, router, utils.strava.status]);

  return (
    <Screen>
      <View style={styles.container}>
        {!failed ? <ActivityIndicator size="large" color={C.ink} /> : null}
        <Text accessibilityRole={failed ? "alert" : undefined} style={styles.title}>{failed ? "Conexão não concluída" : "Conectando sua conta"}</Text>
        <Text style={styles.message}>{message}</Text>
        {failed ? <Text onPress={() => router.replace("/strava")} style={styles.link}>Voltar ao Strava</Text> : null}
      </View>
    </Screen>
  );
}

function ApprovedCallback() {
  const { user } = useAuth();
  if (user?.role === "admin") return <Redirect href="/(tabs)/profile" />;
  return <CallbackProcessor />;
}

export default function StravaCallbackScreen() {
  return <MemberGate><ApprovedCallback /></MemberGate>;
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: "center", alignItems: "center", padding: 25, gap: 12 },
  title: { color: C.ink, fontSize: 20, fontWeight: "900", textAlign: "center" },
  message: { color: C.muted, fontSize: 13, lineHeight: 19, fontWeight: "600", textAlign: "center" },
  link: { color: C.ink, fontSize: 13, fontWeight: "900", padding: 12 },
});
