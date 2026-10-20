import { useState } from "react";
import { Image, StyleSheet, Text, View } from "react-native";

import { C } from "@/components/run-ui";

export function ProfileAvatar({
  uri,
  name,
  size = 64,
}: {
  uri?: string | null;
  name?: string | null;
  size?: number;
}) {
  const [failedUri, setFailedUri] = useState<string | null>(null);
  const initial = name?.trim().slice(0, 1).toUpperCase() || "R";
  const imageUri = uri && failedUri !== uri ? uri : undefined;

  return (
    <View
      accessible
      accessibilityLabel={imageUri ? `Foto de perfil de ${name || "usuário"}` : `Avatar de ${name || "usuário"}`}
      style={[styles.avatar, { width: size, height: size, borderRadius: size * 0.36 }]}
    >
      {imageUri ? (
        <Image
          source={{ uri: imageUri }}
          resizeMode="cover"
          onError={() => setFailedUri(imageUri)}
          style={styles.image}
        />
      ) : (
        <Text style={[styles.initial, { fontSize: Math.round(size * 0.38) }]}>{initial}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  avatar: {
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: C.coral,
  },
  image: { width: "100%", height: "100%" },
  initial: { color: C.white, fontWeight: "900" },
});
