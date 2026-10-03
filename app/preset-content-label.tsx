import { StraftatText } from "./straftat-text";

export function PresetContentLabel({ text }: { text: string }) {
  const match = /^(\d+) (.+)$/.exec(text);
  if (!match) return <span><StraftatText text={text} /></span>;

  const [, count, label] = match;
  return (
    <span>
      <span className="content-label-count" data-emphasis={Math.min(Number(count), 4)}>{count}</span>{" "}
      <StraftatText text={label} />
    </span>
  );
}
