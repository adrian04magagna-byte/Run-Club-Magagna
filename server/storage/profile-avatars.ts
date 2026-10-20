import { randomUUID } from "node:crypto";
import { TRPCError } from "@trpc/server";

const MAX_AVATAR_BYTES = 300_000;
const MAX_AVATAR_BASE64_CHARS = 400_000;

function serviceUnavailable(): TRPCError {
  return new TRPCError({
    code: "SERVICE_UNAVAILABLE",
    message: "O armazenamento de fotos está indisponível agora. Tente novamente mais tarde.",
  });
}

async function getPresignedUrl(action: "put" | "get", objectKey: string): Promise<string> {
  const apiUrl = process.env.MANUS_API_URL?.replace(/\/$/, "");
  const apiKey = process.env.MANUS_API_KEY;
  if (!apiUrl || !apiKey) throw serviceUnavailable();

  try {
    const response = await fetch(
      `${apiUrl}/v1/storage/presign/${action}?path=${encodeURIComponent(objectKey)}`,
      { headers: { Authorization: `Bearer ${apiKey}` } },
    );
    const payload = await response.json().catch(() => ({})) as { url?: unknown };
    if (!response.ok || typeof payload.url !== "string" || !payload.url.startsWith("https://")) {
      console.warn(`[ProfileAvatar] Storage presign failed (${response.status})`);
      throw serviceUnavailable();
    }
    return payload.url;
  } catch (error) {
    if (error instanceof TRPCError) throw error;
    console.warn("[ProfileAvatar] Storage presign request failed");
    throw serviceUnavailable();
  }
}

function decodeJpeg(base64: string): Buffer {
  if (base64.length < 16 || base64.length > MAX_AVATAR_BASE64_CHARS || !/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "A foto não está em um formato válido. Escolha uma imagem JPEG menor." });
  }

  const bytes = Buffer.from(base64, "base64");
  const canonical = bytes.toString("base64").replace(/=+$/, "");
  if (
    bytes.length > MAX_AVATAR_BYTES ||
    bytes.length < 4 ||
    canonical !== base64.replace(/=+$/, "") ||
    bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff ||
    bytes[bytes.length - 2] !== 0xff || bytes[bytes.length - 1] !== 0xd9
  ) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "A foto precisa ser um JPEG válido de até 300 KB." });
  }
  return bytes;
}

export async function uploadProfileAvatar(userId: number, base64: string): Promise<string> {
  const bytes = decodeJpeg(base64);
  const objectKey = `profile-avatars/${userId}/${randomUUID()}.jpg`;
  const uploadUrl = await getPresignedUrl("put", objectKey);

  try {
    const imageBuffer = new ArrayBuffer(bytes.length);
    new Uint8Array(imageBuffer).set(bytes);
    const response = await fetch(uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": "image/jpeg" },
      body: new Blob([imageBuffer], { type: "image/jpeg" }),
    });
    if (!response.ok) {
      console.warn(`[ProfileAvatar] Storage upload failed (${response.status})`);
      throw serviceUnavailable();
    }
  } catch (error) {
    if (error instanceof TRPCError) throw error;
    console.warn("[ProfileAvatar] Storage upload request failed");
    throw serviceUnavailable();
  }

  return objectKey;
}

export async function getProfileAvatarUrl(userId: number, objectKey: string | null | undefined): Promise<string | null> {
  if (!objectKey || !Number.isSafeInteger(userId) || userId < 1) return null;
  const userPrefix = `profile-avatars/${userId}/`;
  if (!objectKey.startsWith(userPrefix) || !/^profile-avatars\/\d+\/[0-9a-f-]{36}\.jpg$/.test(objectKey)) return null;

  try {
    return await getPresignedUrl("get", objectKey);
  } catch {
    // A missing/expired URL should not prevent a person from loading the rest of their profile.
    return null;
  }
}
