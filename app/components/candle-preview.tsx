import type { CSSProperties } from "react";
import type { CandleShape } from "@/lib/catalog";
import "./candle-preview.css";

/** A colour preview built from the store's original wax shapes, never a recoloured product photo. */
export function CandlePreview({ shape = "twist", color = "#b82035", label }: { shape?: CandleShape; color?: string; label?: string }) {
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
