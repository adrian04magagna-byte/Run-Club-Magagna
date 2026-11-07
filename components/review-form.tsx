import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { C } from "@/components/run-ui";
import { localToday } from "@/hooks/use-insights";
import { trpc } from "@/lib/trpc";

/** Stars, an optional AI draft and the comment the athlete receives about one run. */
export function ReviewForm({ activityId, onNotice }: { activityId: number; onNotice: (text: string) => void }) {
  const utils = trpc.useUtils();
  const refresh = () => Promise.all([utils.club.coachActivityFeed.invalidate(), utils.club.clubAthletes.invalidate(), utils.club.athleteDetail.invalidate()]);
  const review = trpc.club.reviewActivity.useMutation({ onSuccess: refresh });
  const draft = trpc.ai.reviewDraft.useMutation();
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");

  const askAi = async () => {
    onNotice("");
    try {
      const result = await draft.mutateAsync({ activityId, today: localToday() });
      setComment(result.comment);
      setRating(result.rating);
    } catch (error) {
      onNotice(error instanceof Error ? error.message : "A IA não respondeu agora.");
    }
  };

  const save = async () => {
    if (!comment.trim()) {
      onNotice("Escreva um comentário antes de salvar a avaliação.");
      return;
    }
    try {
      await review.mutateAsync({ activityId, rating, comment: comment.trim() });
      setComment("");
      onNotice("Avaliação enviada ao aluno.");
    } catch (error) {
      onNotice(error instanceof Error ? error.message : "Não foi possível salvar a avaliação.");
    }
  };

  return (
    <View style={styles.form}>
      <View style={styles.rating}>
        {[1, 2, 3, 4, 5].map((value) => (
          <Pressable key={value} accessibilityLabel={`Avaliar com ${value} de 5`} onPress={() => setRating(value)} style={styles.star}>
            <Ionicons name={value <= rating ? "star" : "star-outline"} size={24} color={C.limeDeep} />
          </Pressable>
        ))}
      </View>
      <Pressable disabled={draft.isPending} onPress={askAi} style={({ pressed }) => [styles.ai, draft.isPending && styles.disabled, pressed && styles.pressed]}>
        {draft.isPending ? <ActivityIndicator size="small" color={C.ink} /> : <Ionicons name="sparkles" size={14} color={C.ink} />}
        <Text style={styles.aiText}>Rascunho com IA</Text>
      </Pressable>
      <TextInput value={comment} onChangeText={setComment} placeholder="Deixe seu comentário para o aluno" placeholderTextColor={C.muted} multiline style={styles.input} accessibilityLabel="Comentário para o aluno" />
      <Pressable disabled={review.isPending} onPress={save} style={({ pressed }) => [styles.send, review.isPending && styles.disabled, pressed && styles.pressed]}>
        <Text style={styles.sendText}>Enviar avaliação</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  pressed: { opacity: 0.72 },
  disabled: { opacity: 0.6 },
  form: { gap: 10 },
  rating: { flexDirection: "row", gap: 6 },
  star: { padding: 3 },
  ai: { flexDirection: "row", alignItems: "center", alignSelf: "flex-start", gap: 6, paddingHorizontal: 12, height: 32, borderRadius: 999, backgroundColor: C.lime },
  aiText: { color: C.ink, fontSize: 12, fontWeight: "900" },
  input: { minHeight: 72, borderWidth: 1, borderColor: C.line, borderRadius: 13, paddingHorizontal: 13, paddingVertical: 10, color: C.ink, backgroundColor: C.white, fontSize: 14, fontWeight: "600", textAlignVertical: "top" },
  send: { minHeight: 49, borderRadius: 15, backgroundColor: C.lime, alignItems: "center", justifyContent: "center", paddingHorizontal: 14 },
  sendText: { color: C.ink, fontSize: 13, fontWeight: "900" },
});
