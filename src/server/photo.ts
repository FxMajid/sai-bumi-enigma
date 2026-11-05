import "server-only";
import { createHash } from "node:crypto";
import sharp from "sharp";
import { validatePhoto } from "@/domain/registration";
import { event } from "@/config/event";
import { fail } from "./errors";
import { RepositoryError } from "@/repositories/registration-repository";

export const sha256 = (data: Uint8Array) => createHash("sha256").update(data).digest("hex");

/** Decode, rotate, resize, re-encode and discard EXIF/GPS/other metadata. */
export async function normalizePhoto(file: File) {
  if (file.size > event.photo.maxBytes) fail("PAYLOAD_TOO_LARGE");
  if (validatePhoto(file)) fail("VALIDATION");
  const original = Buffer.from(await file.arrayBuffer());
  const jpeg = original[0] === 0xff && original[1] === 0xd8 && original[2] === 0xff;
  const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).equals(original.subarray(0, 8));
  if ((file.type === "image/jpeg" && !jpeg) || (file.type === "image/png" && !png)) fail("VALIDATION");
  try {
    const image = sharp(original, { failOn: "warning", limitInputPixels: 40_000_000 });
    const metadata = await image.metadata();
    if (!["jpeg", "png"].includes(metadata.format ?? "") || (metadata.pages ?? 1) !== 1
      || !metadata.width || !metadata.height || metadata.width > 12000 || metadata.height > 12000
      || metadata.width * metadata.height > 40_000_000) fail("VALIDATION");
    const bytes = await image.rotate().resize({ width: 2400, height: 2400, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 85 }).toBuffer();
    if (bytes.length > event.photo.maxBytes) fail("PAYLOAD_TOO_LARGE");
    return { bytes, originalSha256: sha256(original), storageSha256: sha256(bytes) };
  } catch (error) {
    if (error instanceof RepositoryError) throw error;
    fail("VALIDATION");
  }
}
