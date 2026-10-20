import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useRouter } from "expo-router";

import { AppMark, C, Pill, Row, Screen, SectionTitle } from "@/components/run-ui";
import { ProfileAvatar } from "@/components/profile-avatar";
import { useAuth } from "@/hooks/use-auth";
import { trpc } from "@/lib/trpc";

const MAX_AVATAR_BASE64_CHARS = 400_000;

export default function ProfileScreen() {
  const router = useRouter();
  const utils = trpc.useUtils();
  const { user, logout, updateUser } = useAuth();
  const profile = trpc.account.profile.useQuery();
  const saveProfile = trpc.account.saveProfile.useMutation();
  const isCoach = user?.role === "admin";
  const activities = trpc.club.myActivities.useQuery(undefined, { enabled: !isCoach });
  const athletes = trpc.club.athletes.useQuery(undefined, { enabled: isCoach });
  const pending = trpc.club.pendingAthletes.useQuery(undefined, { enabled: isCoach });
  const stravaStatus = trpc.strava.status.useQuery(undefined, { enabled: !isCoach, staleTime: 0 });
  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName] = useState("");
  const [avatarDraftUri, setAvatarDraftUri] = useState<string | null>(null);
  const [avatarBase64, setAvatarBase64] = useState<string | null>(null);
  const [notice, setNotice] = useState("");

  const weekStart = new Date();
  weekStart.setHours(0, 0, 0, 0);
  weekStart.setDate(weekStart.getDate() - 6);
  const thisWeek = (activities.data ?? []).filter((activity) => new Date(activity.completedAt) >= weekStart);
  const weekKm = thisWeek.reduce((total, activity) => total + activity.distanceMeters, 0) / 1000;
  const displayName = profile.data?.name || user?.name || user?.email || "Sua conta";
  const avatarUrl = profile.data?.avatarUrl ?? user?.avatarUrl ?? null;

  const beginEdit = () => {
    setDraftName(displayName);
    setAvatarDraftUri(null);
    setAvatarBase64(null);
    setNotice("");
    setEditing(true);
  };

  const cancelEdit = () => {
    setEditing(false);
    setAvatarDraftUri(null);
    setAvatarBase64(null);
    setNotice("");
  };

  const pickPhoto = async () => {
    setNotice("");
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 1,
        exif: false,
      });
      if (result.canceled) return;
      const asset = result.assets[0];
      if (!asset) return;

      const width = Math.round(asset.width);
      const height = Math.round(asset.height);
      if (width < 1 || height < 1) throw new Error("Não foi possível ler as dimensões desta foto.");
      const side = Math.min(width, height);
      const size = Math.min(side, 512);
      const image = await ImageManipulator.manipulate(asset.uri)
        .crop({
          originX: Math.floor((width - side) / 2),
          originY: Math.floor((height - side) / 2),
          width: side,
          height: side,
        })
        .resize({ width: size, height: size })
        .renderAsync();

      let optimized = await image.saveAsync({ format: SaveFormat.JPEG, compress: 0.82, base64: true });
      if (optimized.base64 && optimized.base64.length > MAX_AVATAR_BASE64_CHARS) {
        optimized = await image.saveAsync({ format: SaveFormat.JPEG, compress: 0.62, base64: true });
      }
      if (!optimized.base64 || optimized.base64.length > MAX_AVATAR_BASE64_CHARS) {
        throw new Error("Esta foto ainda ficou grande. Escolha outra imagem para continuar.");
      }
      setAvatarDraftUri(optimized.uri);
      setAvatarBase64(optimized.base64);
      setNotice("Foto pronta. Toque em salvar para atualizar seu perfil.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Não foi possível selecionar essa foto.");
    }
  };

  const save = async () => {
    const cleanName = draftName.trim();
    if (cleanName.length < 2) {
      setNotice("Digite um nome com pelo menos 2 caracteres.");
      return;
    }
    setNotice("");
    try {
      const result = await saveProfile.mutateAsync({
        displayName: cleanName,
        ...(avatarBase64 ? { avatarBase64 } : {}),
      });
      await Promise.all([
        updateUser({ name: result.name, avatarUrl: result.avatarUrl }),
        utils.account.profile.invalidate(),
        utils.club.athletes.invalidate(),
        utils.club.coachActivityFeed.invalidate(),
      ]);
      setEditing(false);
      setAvatarDraftUri(null);
      setAvatarBase64(null);
      setNotice("Perfil atualizado.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Não foi possível salvar as alterações.");
    }
  };

  const signOut = async () => {
    await logout();
    router.replace("/login");
  };

  return <Screen scroll>
    <View style={styles.header}><View><Text style={styles.eyebrow}>SEU ESPAÇO</Text><Text style={styles.title}>Perfil</Text></View><AppMark size={42} /></View>

    <View style={styles.profileCard}>
      <ProfileAvatar uri={avatarUrl} name={displayName} size={68} />
      <View style={styles.profileCopy}><Text style={styles.name}>{displayName}</Text><Text style={styles.profileDetail}>{profile.data?.email || user?.email || "Conta autenticada"}</Text><Pill label={isCoach ? "TREINADOR" : "ALUNA APROVADA"} tone="lime" /></View>
    </View>
    <Pressable accessibilityRole="button" onPress={beginEdit} style={({ pressed }) => [styles.editLink, pressed && styles.pressed]}>
      <Ionicons name="create-outline" size={18} color={C.ink} />
      <Text style={styles.editLinkText}>Editar perfil</Text>
    </Pressable>

    {editing ? <View style={styles.editCard}>
      <Text style={styles.editTitle}>Seu perfil, do seu jeito</Text>
      <View style={styles.photoPreview}><ProfileAvatar uri={avatarDraftUri ?? avatarUrl} name={draftName} size={92} /></View>
      <Pressable accessibilityRole="button" onPress={pickPhoto} style={({ pressed }) => [styles.photoButton, pressed && styles.pressed]}>
        <Ionicons name="image-outline" size={18} color={C.ink} />
        <Text style={styles.photoButtonText}>{avatarDraftUri ? "Escolher outra foto" : avatarUrl ? "Trocar foto" : "Adicionar foto"}</Text>
      </Pressable>
      <Text style={styles.formHint}>A foto é recortada e otimizada antes de ser enviada.</Text>
      <Text style={styles.formLabel}>Nome de exibição</Text>
      <TextInput value={draftName} onChangeText={setDraftName} maxLength={120} autoCapitalize="words" autoComplete="name" placeholder="Seu nome" placeholderTextColor={C.muted} style={styles.input} accessibilityLabel="Nome de exibição" />
      <Text style={styles.formLabel}>E-mail (somente leitura)</Text>
      <View style={styles.readOnly}><Text style={styles.readOnlyText}>{profile.data?.email || user?.email || "Não informado"}</Text></View>
      <Text style={styles.formHint}>Sua conta e seu papel não podem ser alterados nesta tela. A foto fica visível apenas no seu perfil e nas telas autorizadas do clube.</Text>
      {notice ? <Text accessibilityRole="alert" style={styles.notice}>{notice}</Text> : null}
      <View style={styles.editActions}>
        <Pressable disabled={saveProfile.isPending} onPress={cancelEdit} style={({ pressed }) => [styles.cancelButton, pressed && styles.pressed]}><Text style={styles.cancelText}>Cancelar</Text></Pressable>
        <Pressable disabled={saveProfile.isPending} onPress={save} style={({ pressed }) => [styles.saveButton, saveProfile.isPending && styles.disabled, pressed && styles.pressed]}>
          {saveProfile.isPending ? <ActivityIndicator color={C.ink} /> : <Text style={styles.saveText}>Salvar alterações</Text>}
        </Pressable>
      </View>
    </View> : notice ? <Text accessibilityLiveRegion="polite" style={styles.successNotice}>{notice}</Text> : null}
    {profile.error ? <Text style={styles.profileError}>Não foi possível atualizar os dados do perfil. Tente novamente.</Text> : null}

    <View style={styles.gap} />
    <SectionTitle title={isCoach ? "Sua turma" : "Seu momento"} />
    <View style={styles.momentCard}>{isCoach ? <><View style={styles.momentItem}><Ionicons name="people-outline" size={21} color={C.ink} /><View><Text style={styles.momentValue}>{athletes.data?.length ?? 0}</Text><Text style={styles.momentLabel}>alunos aprovados</Text></View></View><View style={styles.momentLine} /><View style={styles.momentItem}><Ionicons name="hourglass-outline" size={21} color={C.ink} /><View><Text style={styles.momentValue}>{pending.data?.length ?? 0}</Text><Text style={styles.momentLabel}>pedidos pendentes</Text></View></View></> : <><View style={styles.momentItem}><Ionicons name="footsteps-outline" size={21} color={C.ink} /><View><Text style={styles.momentValue}>{weekKm.toFixed(1)} km</Text><Text style={styles.momentLabel}>registrados em 7 dias</Text></View></View><View style={styles.momentLine} /><View style={styles.momentItem}><Ionicons name="flame-outline" size={21} color={C.ink} /><View><Text style={styles.momentValue}>{thisWeek.length}</Text><Text style={styles.momentLabel}>atividades registradas</Text></View></View></>}</View>

    <View style={styles.gap} />
    <SectionTitle title="Seu acompanhamento" />
    <View style={styles.list}>
      <Row icon={isCoach ? "people-outline" : "calendar-outline"} title={isCoach ? "Gestão de alunos e treinos" : "Agenda e avaliações"} detail={isCoach ? "Acesse a aba Alunos para aprovar, atribuir e avaliar." : "Acesse Meu clube para ver treinos enviados e comentários."} />
      {isCoach
        ? <Row icon="shield-checkmark-outline" title="Privacidade do Strava" detail="Cada aluno consulta somente a própria conta. Atividades importadas não aparecem para o Treinador." />
        : <Row icon="pulse-outline" title="Meu histórico Strava" detail={stravaStatus.data?.connected ? "Conta conectada. Consulte suas atividades privadas." : stravaStatus.data?.configured ? "Conecte sua conta para consultar seu histórico pessoal." : "Aguardando configuração do app Strava."} onPress={() => router.push("/strava")} />}
    </View>
    <View style={styles.gap} />
    <Pressable onPress={signOut} style={({ pressed }) => [styles.signOut, pressed && styles.pressed]}><Ionicons name="log-out-outline" size={19} color={C.ink} /><Text style={styles.signOutText}>Sair da conta</Text></Pressable>
  </Screen>;
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingTop: 4, marginBottom: 23 },
  eyebrow: { color: C.muted, fontSize: 10, fontWeight: "900", letterSpacing: 1.5, marginBottom: 5 },
  title: { color: C.ink, fontSize: 31, fontWeight: "900", letterSpacing: -1.1 },
  profileCard: { flexDirection: "row", alignItems: "center", gap: 14, padding: 18, borderRadius: 25, backgroundColor: C.white, borderWidth: 1, borderColor: C.line },
  profileCopy: { flex: 1, gap: 5 },
  name: { color: C.ink, fontSize: 19, fontWeight: "900" },
  profileDetail: { color: C.muted, fontSize: 12, fontWeight: "700" },
  editLink: { alignSelf: "flex-start", minHeight: 42, flexDirection: "row", alignItems: "center", gap: 7, paddingHorizontal: 8, marginTop: 5 },
  editLinkText: { color: C.ink, fontSize: 13, fontWeight: "900" },
  editCard: { padding: 18, borderRadius: 23, backgroundColor: C.white, borderWidth: 1, borderColor: C.line, marginTop: 8 },
  editTitle: { color: C.ink, fontSize: 18, fontWeight: "900", marginBottom: 14 },
  photoPreview: { alignItems: "center", marginBottom: 10 },
  photoButton: { alignSelf: "center", flexDirection: "row", alignItems: "center", gap: 7, minHeight: 42, paddingHorizontal: 14, borderRadius: 14, backgroundColor: C.sky },
  photoButtonText: { color: C.ink, fontSize: 13, fontWeight: "800" },
  formHint: { color: C.muted, fontSize: 11, lineHeight: 16, fontWeight: "600", marginTop: 8 },
  formLabel: { color: C.ink, fontSize: 12, fontWeight: "900", marginTop: 16, marginBottom: 7 },
  input: { minHeight: 50, borderRadius: 14, borderWidth: 1, borderColor: C.line, backgroundColor: C.paper, paddingHorizontal: 14, color: C.ink, fontSize: 14, fontWeight: "600" },
  readOnly: { minHeight: 46, justifyContent: "center", paddingHorizontal: 14, borderRadius: 14, backgroundColor: C.paper, borderWidth: 1, borderColor: C.line },
  readOnlyText: { color: C.muted, fontSize: 13, fontWeight: "700" },
  notice: { color: "#A74736", fontSize: 12, lineHeight: 17, fontWeight: "700", marginTop: 11 },
  successNotice: { color: C.inkSoft, fontSize: 12, fontWeight: "800", marginTop: 7, paddingHorizontal: 4 },
  profileError: { color: "#A74736", fontSize: 12, fontWeight: "700", marginTop: 8 },
  editActions: { flexDirection: "row", gap: 10, marginTop: 18 },
  cancelButton: { flex: 1, minHeight: 50, alignItems: "center", justifyContent: "center", borderRadius: 15, backgroundColor: C.paper, borderWidth: 1, borderColor: C.line },
  cancelText: { color: C.ink, fontSize: 13, fontWeight: "800" },
  saveButton: { flex: 1.3, minHeight: 50, alignItems: "center", justifyContent: "center", borderRadius: 15, backgroundColor: C.lime },
  saveText: { color: C.ink, fontSize: 13, fontWeight: "900" },
  disabled: { opacity: 0.55 },
  gap: { height: 30 },
  momentCard: { flexDirection: "row", alignItems: "center", padding: 17, borderRadius: 21, backgroundColor: C.sand },
  momentItem: { flex: 1, flexDirection: "row", alignItems: "center", gap: 10 },
  momentLine: { width: 1, height: 38, backgroundColor: "#D9CBB3", marginHorizontal: 10 },
  momentValue: { color: C.ink, fontSize: 16, fontWeight: "900" },
  momentLabel: { color: C.inkSoft, fontSize: 10, fontWeight: "700", marginTop: 2 },
  list: { paddingHorizontal: 16, borderRadius: 22, backgroundColor: C.white, borderWidth: 1, borderColor: C.line },
  signOut: { minHeight: 50, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 9, backgroundColor: C.white, borderWidth: 1, borderColor: C.line, borderRadius: 16 },
  signOutText: { color: C.ink, fontSize: 13, fontWeight: "800" },
  pressed: { opacity: 0.72 },
});
