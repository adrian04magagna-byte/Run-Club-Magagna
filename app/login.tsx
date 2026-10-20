import { useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";

import { AppMark, C, Screen } from "@/components/run-ui";
import * as Auth from "@/lib/_core/auth";
import { startOAuthLogin } from "@/constants/oauth";
import { trpc } from "@/lib/trpc";

export default function LoginScreen() {
  const router = useRouter();
  const { reason } = useLocalSearchParams<{ reason?: string }>();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [notice, setNotice] = useState(() => reason === "rejected"
    ? "Este cadastro não foi aprovado. Fale com seu treinador para saber como continuar."
    : reason === "not-athlete"
      ? "Esta conta não é um aluno aprovado nem está configurada como conta do treinador. Use o botão de acesso do treinador ou fale com ele."
      : "");
  const signIn = trpc.account.signIn.useMutation();

  const submit = async () => {
    setNotice("");
    try {
      const result = await signIn.mutateAsync({ email, password });
      if (result.status === "pending") {
        router.replace({ pathname: "/pending", params: { email } });
        return;
      }
      if (result.status === "rejected") {
        setNotice("Este cadastro não foi aprovado. Fale com seu treinador para saber como continuar.");
        return;
      }
      if (result.sessionToken) await Auth.setSessionToken(result.sessionToken);
      await Auth.setUserInfo({
        ...result.user,
        lastSignedIn: new Date(result.user.lastSignedIn),
      });
      router.replace("/(tabs)");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Não foi possível entrar agora.");
    }
  };

  const coachLogin = async () => {
    setNotice("");
    try {
      await startOAuthLogin();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "O acesso do treinador não está disponível neste momento.");
    }
  };

  return (
    <Screen scroll>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.keyboard}>
        <View style={styles.brand}><AppMark size={50} /><Text style={styles.brandTitle}>Run Club Magagna</Text></View>
        <Text style={styles.eyebrow}>SEU CLUBE, SEU RITMO</Text>
        <Text style={styles.title}>Entre para ver{ "\n" }seu próximo treino.</Text>
        <Text style={styles.subtitle}>Acompanhe o plano que seu treinador preparou para você.</Text>

        <View style={styles.form}>
          <Text style={styles.label}>E-mail</Text>
          <TextInput autoCapitalize="none" autoComplete="email" keyboardType="email-address" value={email} onChangeText={setEmail} placeholder="voce@email.com" placeholderTextColor={C.muted} style={styles.input} accessibilityLabel="E-mail" />
          <Text style={[styles.label, styles.passwordLabel]}>Senha</Text>
          <TextInput autoCapitalize="none" autoComplete="password" secureTextEntry value={password} onChangeText={setPassword} placeholder="Sua senha" placeholderTextColor={C.muted} style={styles.input} accessibilityLabel="Senha" />
          {notice ? <Text accessibilityRole="alert" style={styles.notice}>{notice}</Text> : null}
          <Pressable disabled={signIn.isPending || !email || !password} onPress={submit} style={({ pressed }) => [styles.primary, (signIn.isPending || !email || !password) && styles.disabled, pressed && styles.pressed]}>
            {signIn.isPending ? <ActivityIndicator color={C.ink} /> : <Text style={styles.primaryText}>Entrar</Text>}
          </Pressable>
        </View>

        <Pressable onPress={() => router.push("/signup")} style={({ pressed }) => [styles.linkButton, pressed && styles.pressed]}>
          <Text style={styles.linkText}>Ainda não tem conta? <Text style={styles.linkStrong}>Cadastre-se</Text></Text>
        </Pressable>

        <View style={styles.divider}><View style={styles.dividerLine} /><Text style={styles.dividerText}>ACESSO DO TREINADOR</Text><View style={styles.dividerLine} /></View>
        <Pressable onPress={coachLogin} style={({ pressed }) => [styles.coachButton, pressed && styles.pressed]}>
          <Text style={styles.coachButtonText}>Entrar com a conta do treinador</Text>
        </Pressable>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  keyboard: { flexGrow: 1, justifyContent: "center", paddingVertical: 30 },
  brand: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 40 },
  brandTitle: { color: C.ink, fontSize: 20, fontWeight: "900", letterSpacing: -0.7 },
  eyebrow: { color: C.muted, fontSize: 10, fontWeight: "900", letterSpacing: 1.5, marginBottom: 8 },
  title: { color: C.ink, fontSize: 32, lineHeight: 36, fontWeight: "900", letterSpacing: -1.1 },
  subtitle: { color: C.muted, fontSize: 14, lineHeight: 21, fontWeight: "600", marginTop: 10, maxWidth: 310 },
  form: { marginTop: 28 },
  label: { color: C.ink, fontSize: 12, fontWeight: "800", marginBottom: 7 },
  passwordLabel: { marginTop: 16 },
  input: { minHeight: 52, borderRadius: 15, borderWidth: 1, borderColor: C.line, backgroundColor: C.white, paddingHorizontal: 15, color: C.ink, fontSize: 15 },
  primary: { minHeight: 54, borderRadius: 17, backgroundColor: C.lime, alignItems: "center", justifyContent: "center", marginTop: 21 },
  primaryText: { color: C.ink, fontSize: 15, fontWeight: "900" },
  disabled: { opacity: 0.55 },
  pressed: { opacity: 0.76 },
  notice: { color: "#A74736", fontSize: 13, lineHeight: 18, fontWeight: "700", marginTop: 12 },
  linkButton: { alignSelf: "center", paddingVertical: 18 },
  linkText: { color: C.muted, fontSize: 13, fontWeight: "600" },
  linkStrong: { color: C.ink, fontWeight: "900" },
  divider: { flexDirection: "row", alignItems: "center", gap: 11, marginTop: 12, marginBottom: 15 },
  dividerLine: { flex: 1, height: 1, backgroundColor: C.line },
  dividerText: { color: C.muted, fontSize: 9, fontWeight: "900", letterSpacing: 1 },
  coachButton: { minHeight: 50, borderRadius: 16, borderWidth: 1, borderColor: C.line, backgroundColor: C.white, alignItems: "center", justifyContent: "center" },
  coachButtonText: { color: C.ink, fontSize: 13, fontWeight: "800" },
});
