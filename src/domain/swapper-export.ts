import { z } from "zod";
import { decodeCompressedJson } from "./base64-decode";

const swapperExportSchema = z.object({
  Preset: z.object({
    Name: z.string().trim().min(1).max(500),
    Maps: z.array(
      z.object({
        MapString: z.string(),
        WeaponRemaps: z.array(z.object({
          Precursor: z.string(),
          Result: z.string()
        }))
      }).passthrough()
    ).max(1000)
  }).passthrough(),
  type: z.literal("swap").optional()
}).passthrough();

export type DecodedSwapper = {
  name: string;
  remapCount: number;
};

export async function decodeSwapperExport(encodedValue: string): Promise<DecodedSwapper> {
  const value = await decodeCompressedJson(encodedValue, "swapper export");
  const parsed = swapperExportSchema.safeParse(value);
  if (!parsed.success) throw new Error("Swapper export has an invalid schema.");

  let remapCount = 0;
  for (const map of parsed.data.Preset.Maps) {
    remapCount += map.WeaponRemaps.length;
  }

  return { name: parsed.data.Preset.Name, remapCount };
}
