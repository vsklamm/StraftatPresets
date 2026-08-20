import { Fragment } from "react";
import { parseStraftatMarkup, hasSpanStyles } from "@/src/domain/straftat-markup";

export function StraftatText({ text }: { text: string }) {
  if (!text) return null;

  const spans = parseStraftatMarkup(text);
  if (spans.length === 0) return null;
  if (spans.length === 1 && !hasSpanStyles(spans[0])) {
    return <>{spans[0].text}</>;
  }

  return (
    <>
      {spans.map((span, index) => {
        const style: React.CSSProperties = {};
        if (span.color) style.color = span.color;
        if (span.backgroundColor) {
          style.backgroundColor = span.backgroundColor;
          style.borderRadius = "3px";
          style.padding = "0 3px";
        }
        if (span.bold) style.fontWeight = "700";
        if (span.italic) style.fontStyle = "italic";
        if (span.underline && span.strikethrough) style.textDecoration = "underline line-through";
        else if (span.underline) style.textDecoration = "underline";
        else if (span.strikethrough) style.textDecoration = "line-through";
        if (span.smallcaps) style.fontVariant = "small-caps";
        if (span.allcaps) style.textTransform = "uppercase";
        else if (span.lowercase) style.textTransform = "lowercase";
        if (span.superscript) {
          style.verticalAlign = "super";
          style.fontSize = "0.75em";
          style.lineHeight = 1;
        } else if (span.subscript) {
          style.verticalAlign = "sub";
          style.fontSize = "0.75em";
          style.lineHeight = 1;
        }

        if (Object.keys(style).length === 0) {
          return <Fragment key={index}>{span.text}</Fragment>;
        }

        return (
          <span key={index} style={style}>
            {span.text}
          </span>
        );
      })}
    </>
  );
}
