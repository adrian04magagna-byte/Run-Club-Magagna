import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";

import { AppMark, C, Screen } from "@/components/run-ui";
import { oauthErrorMessage, parseOAuthFragment } from "@/constants/oauth";
import { completeSignIn } from "@/lib/_core/api";

/** Web landing page after Google sign-in. The API puts the result in the URL fragment. */
export default function OAuthCallback() {
  const router = useRouter();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    const handle = async () => {
      const href = typeof window !== "undefined" ? window.location.href : "";
      const result = parseOAuthFragment(href);
      // Drop the token from the address bar and history right away.
      if (typeof window !== "undefined" && window.location.hash) {
        window.history.replaceState(null, "", window.location.pathname);
      }
      if (!result) {
        setErrorMessage(oauthErrorMessage("expired"));
        return;
      }
      if (result.kind === "error") {
        setErrorMessage(oauthErrorMessage(result.error));
        return;
      }
      if (result.kind === "status") {
        if (result.status === "pending") router.replace({ pathname: "/pending", params: { email: result.email } });
        else router.replace({ pathname: "/login", params: { reason: "rejected" } });
        return;
      }
      if (await completeSignIn(result.token)) router.replace("/(tabs)");
      else router.replace({ pathname: "/login", params: { reason: "session" } });
    };
    handle().catch(() => setErrorMessage(oauthErrorMessage("google_failed")));
  }, [router]);

  return (
    <Screen>
      <View style={styles.content}>
        <AppMark size={52} />
        {errorMessage ? (
          <>
            <Text style={styles.title}>Não foi possível entrar</Text>
            <Text accessibilityRole="alert" style={styles.copy}>{errorMessage}</Text>
            <Pressable onPress={() => router.replace("/login")} style={({ pressed }) => [styles.button, pressed && styles.pressed]}>
              <Text style={styles.buttonText}>Voltar para entrar</Text>
            </Pressable>
          </>
        ) : (
          <>
            <ActivityIndicator color={C.ink} style={styles.spinner} />
            <Text style={styles.copy}>Concluindo o login seguro...</Text>
          </>
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { flex: 1, justifyContent: "center", paddingVertical: 28 },
  title: { color: C.ink, fontSize: 28, lineHeight: 32, fontWeight: "900", letterSpacing: -1, marginTop: 24 },
  copy: { color: C.muted, fontSize: 15, lineHeight: 22, fontWeight: "600", marginTop: 12 },
  spinner: { alignSelf: "flex-start", marginTop: 28 },
  button: { minHeight: 52, borderRadius: 17, backgroundColor: C.ink, alignItems: "center", justifyContent: "center", marginTop: 24 },
  buttonText: { color: C.white, fontSize: 15, fontWeight: "800" },
  pressed: { opacity: 0.76 },
});
