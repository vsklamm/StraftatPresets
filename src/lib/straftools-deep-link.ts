export type StraftoolsImportKind = "playlist" | "swapper";

export const STRAFTOOLS_URL = "https://straftools.vercel.app/";
export const LOCAL_STRAFTOOLS_URL = "http://localhost:5173/";

export function straftoolsImportUrl(
  kind: StraftoolsImportKind,
  encoded: string,
  baseUrl = STRAFTOOLS_URL,
) {
  const params = new URLSearchParams({
    import: kind,
    data: encoded.trim(),
  });
  const url = new URL(baseUrl);
  url.hash = params.toString();
  return url.toString();
}
