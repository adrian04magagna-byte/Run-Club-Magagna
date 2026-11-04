import { useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";

import { AppMark, C, Screen } from "@/components/run-ui";
import { completeSignIn } from "@/lib/_core/api";
import { trpc } from "@/lib/trpc";

export default function SignupScreen() {
  const router = useRouter();
  const { coach } = useLocalSearchParams<{ coach?: string }>();
  const isCoach = coach === "1";
  const [coachCode, setCoachCode] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [notice, setNotice] = useState("");
  const register = trpc.account.register.useMutation();

  const submit = async () => {
    setNotice("");
    try {
      const result = await register.mutateAsync({ name, email, password, ...(isCoach ? { coachCode } : {}) });
      if (result.status === "authenticated") {
        if (!(await completeSignIn(result.sessionToken))) throw new Error("Conta criada. Entre com seu e-mail e senha.");
        router.replace("/(tabs)");
        return;
      }
      router.replace({ pathname: "/pending", params: { email } });
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Não foi possível concluir o cadastro agora.");
    }
  };

  return (
    <Screen scroll>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.keyboard}>
        <Pressable onPress={() => router.back()} style={styles.back}><Text style={styles.backText}>‹  Voltar</Text></Pressable>
        <View style={styles.brand}><AppMark size={46} /><Text style={styles.brandTitle}>Run Club Magagna</Text></View>
        <Text style={styles.eyebrow}>{isCoach ? "PRIMEIRO ACESSO DO TREINADOR" : "ENTRE PARA O CLUBE"}</Text>
        <Text style={styles.title}>{isCoach ? "Prepare o clube\npara seus alunos." : "Vamos correr\ncom acompanhamento."}</Text>
        <Text style={styles.subtitle}>{isCoach
          ? "Use o e-mail configurado como treinador e o código de acesso que você recebeu na configuração do servidor."
          : "Sua conta será liberada depois que o treinador aprovar o cadastro."}</Text>

        <View style={styles.form}>
          <Text style={styles.label}>Seu nome</Text>
          <TextInput autoCapitalize="words" autoComplete="name" value={name} onChangeText={setName} placeholder="Como podemos chamar você?" placeholderTextColor={C.muted} style={styles.input} accessibilityLabel="Seu nome" />
          <Text style={[styles.label, styles.spaced]}>E-mail</Text>
          <TextInput autoCapitalize="none" autoComplete="email" keyboardType="email-address" value={email} onChangeText={setEmail} placeholder="voce@email.com" placeholderTextColor={C.muted} style={styles.input} accessibilityLabel="E-mail" />
          <Text style={[styles.label, styles.spaced]}>Senha (mínimo de 10 caracteres)</Text>
          <TextInput autoCapitalize="none" autoComplete="new-password" secureTextEntry value={password} onChangeText={setPassword} placeholder="Crie uma senha" placeholderTextColor={C.muted} style={styles.input} accessibilityLabel="Senha" />
          {isCoach ? (
            <>
              <Text style={[styles.label, styles.spaced]}>Código de acesso do treinador</Text>
              <TextInput autoCapitalize="none" autoCorrect={false} secureTextEntry value={coachCode} onChangeText={setCoachCode} placeholder="Código de acesso" placeholderTextColor={C.muted} style={styles.input} accessibilityLabel="Código de acesso do treinador" />
            </>
          ) : null}
          {notice ? <Text accessibilityRole="alert" style={styles.notice}>{notice}</Text> : null}
          <Pressable disabled={register.isPending || name.trim().length < 2 || !email || password.length < 10 || (isCoach && !coachCode)} onPress={submit} style={({ pressed }) => [styles.primary, (register.isPending || name.trim().length < 2 || !email || password.length < 10 || (isCoach && !coachCode)) && styles.disabled, pressed && styles.pressed]}>
            {register.isPending ? <ActivityIndicator color={C.ink} /> : <Text style={styles.primaryText}>{isCoach ? "Criar conta do treinador" : "Pedir acesso"}</Text>}
          </Pressable>
        </View>
        <Text style={styles.privacy}>Sua senha é protegida no armazenamento da conta. Você só verá treinos do clube depois da aprovação.</Text>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  keyboard: { flexGrow: 1, justifyContent: "center", paddingVertical: 20 },
  back: { paddingVertical: 12, alignSelf: "flex-start" },
  backText: { color: C.ink, fontSize: 15, fontWeight: "800" },
  brand: { flexDirection: "row", alignItems: "center", gap: 11, marginBottom: 33 },
  brandTitle: { color: C.ink, fontSize: 19, fontWeight: "900", letterSpacing: -0.7 },
  eyebrow: { color: C.muted, fontSize: 10, fontWeight: "900", letterSpacing: 1.5, marginBottom: 8 },
  title: { color: C.ink, fontSize: 31, lineHeight: 35, fontWeight: "900", letterSpacing: -1 },
  subtitle: { color: C.muted, fontSize: 14, lineHeight: 20, fontWeight: "600", marginTop: 10 },
  form: { marginTop: 25 },
  label: { color: C.ink, fontSize: 12, fontWeight: "800", marginBottom: 7 },
  spaced: { marginTop: 15 },
  input: { minHeight: 51, borderRadius: 15, borderWidth: 1, borderColor: C.line, backgroundColor: C.white, paddingHorizontal: 15, color: C.ink, fontSize: 15 },
  primary: { minHeight: 54, borderRadius: 17, backgroundColor: C.lime, alignItems: "center", justifyContent: "center", marginTop: 21 },
  primaryText: { color: C.ink, fontSize: 15, fontWeight: "900" },
  disabled: { opacity: 0.55 },
  pressed: { opacity: 0.76 },
  notice: { color: "#A74736", fontSize: 13, lineHeight: 18, fontWeight: "700", marginTop: 12 },
  privacy: { color: C.muted, fontSize: 11, lineHeight: 17, fontWeight: "600", marginTop: 15 },
});
