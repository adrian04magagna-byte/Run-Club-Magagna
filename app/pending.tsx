import { StyleSheet, Text, View, Pressable } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";

import { AppMark, C, Screen } from "@/components/run-ui";

export default function PendingScreen() {
  const router = useRouter();
  const { email } = useLocalSearchParams<{ email?: string }>();
  return (
    <Screen>
      <View style={styles.content}>
        <AppMark size={58} />
        <View style={styles.badge}><Text style={styles.badgeText}>PEDIDO RECEBIDO</Text></View>
        <Text style={styles.title}>Sua vaga está{ "\n" }em análise.</Text>
        <Text style={styles.copy}>O treinador vai revisar seu cadastro antes de liberar o acesso aos treinos.</Text>
        {email ? <Text style={styles.email}>{email}</Text> : null}
        <View style={styles.card}><Text style={styles.cardTitle}>O que acontece agora?</Text><Text style={styles.cardCopy}>Assim que sua conta for aprovada, entre com o mesmo e-mail e senha para ver seu plano, registrar atividades e receber avaliações.</Text></View>
        <Pressable onPress={() => router.replace("/login")} style={({ pressed }) => [styles.button, pressed && styles.pressed]}><Text style={styles.buttonText}>Voltar para entrar</Text></Pressable>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { flex: 1, justifyContent: "center", paddingVertical: 28 },
  badge: { alignSelf: "flex-start", backgroundColor: C.lime, borderRadius: 999, paddingHorizontal: 11, paddingVertical: 7, marginTop: 28 },
  badgeText: { color: C.ink, fontSize: 10, fontWeight: "900", letterSpacing: 0.8 },
  title: { color: C.ink, fontSize: 33, lineHeight: 37, fontWeight: "900", letterSpacing: -1.2, marginTop: 14 },
  copy: { color: C.muted, fontSize: 15, lineHeight: 22, fontWeight: "600", marginTop: 12 },
  email: { color: C.ink, fontSize: 13, fontWeight: "800", marginTop: 12 },
  card: { padding: 17, borderRadius: 19, backgroundColor: C.sky, marginTop: 25 },
  cardTitle: { color: C.ink, fontSize: 14, fontWeight: "900" },
  cardCopy: { color: C.inkSoft, fontSize: 13, lineHeight: 19, fontWeight: "600", marginTop: 5 },
  button: { minHeight: 52, borderRadius: 17, backgroundColor: C.ink, alignItems: "center", justifyContent: "center", marginTop: 24 },
  buttonText: { color: C.white, fontSize: 15, fontWeight: "800" },
  pressed: { opacity: 0.76 },
});
