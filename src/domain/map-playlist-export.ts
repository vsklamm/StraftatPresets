import { z } from "zod";
import { isSupportedMap } from "@/src/domain/game-catalog";
import { decodeCompressedJson } from "./base64-decode";

const playlistExportSchema = z.object({
  name: z.string().trim().min(1).max(500),
  maps: z.array(z.string().trim().min(1).max(120)).min(1).max(500),
  type: z.literal("playlist").optional(),
}).passthrough();

export type DecodedMapPlaylist = {
  name: string;
  mapNames: string[];
};

export async function decodeMapPlaylistExport(encodedValue: string): Promise<DecodedMapPlaylist> {
  const value = await decodeCompressedJson(encodedValue, "map playlist export");
  const parsed = playlistExportSchema.safeParse(value);
  if (!parsed.success) throw new Error("Map playlist export is missing its name or maps.");

  for (const mapName of parsed.data.maps) {
    if (!isSupportedMap(mapName)) {
      throw new Error(`Unsupported map: ${mapName}`);
    }
  }

  return { name: parsed.data.name, mapNames: parsed.data.maps };
}
