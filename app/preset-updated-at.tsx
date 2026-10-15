const dateFormat = new Intl.DateTimeFormat("en-GB", {
  day: "numeric", month: "short", year: "numeric", timeZone: "UTC",
});

export function PresetUpdatedAt({ updatedAt }: { updatedAt?: Date | string }) {
  if (!updatedAt) return null;
  const date = new Date(updatedAt);
  if (!Number.isFinite(date.getTime())) return null;
  return <span className="preset-updated-at">
    <span className="byline-separator" aria-hidden="true" />
    <time dateTime={date.toISOString()}>Updated {dateFormat.format(date)}</time>
  </span>;
}
