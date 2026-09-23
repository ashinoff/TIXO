import type { CSSProperties } from "react";
import type { CandleShape } from "@/lib/catalog";
import "./candle-preview.css";

/** Uploaded form masks take the selected wax colour; existing built-in forms stay compatible. */
export function CandlePreview({ shape, silhouette, color = "#e8ddca", label }: { shape?: CandleShape | null; silhouette?: string | null; color?: string; label?: string }) {
  if (silhouette) return <div className="wax-stage wax-uploaded" style={{ "--wax": color, "--silhouette": `url(${JSON.stringify(silhouette)})` } as CSSProperties} role={label ? "img" : undefined} aria-label={label} aria-hidden={label ? undefined : true}><div className="wax-ground" /><div className="wax-silhouette" /></div>;
  if (!shape) return <div className="wax-stage wax-missing" role="img" aria-label={label ? `${label}. Силуэт ещё не загружен` : "Силуэт ещё не загружен"}><span>Силуэт<br />скоро появится</span></div>;
  return <div className={`wax-stage wax-${shape}`} style={{ "--wax": color } as CSSProperties} role={label ? "img" : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
    <div className="wax-ground" />
    <div className="wax-object">
      <span className="wax-wick" />
      {shape === "bubble" ? <div className="wax-bubbles">{Array.from({ length: 9 }, (_, i) => <b key={i} />)}</div>
        : shape === "shell" ? <div className="wax-fan">{Array.from({ length: 9 }, (_, i) => <b key={i} style={{ "--rib": i - 4 } as CSSProperties} />)}</div>
        : shape === "knot" ? <div className="wax-loops"><b /><b /></div>
        : <div className="wax-body"><b /></div>}
    </div>
  </div>;
}
