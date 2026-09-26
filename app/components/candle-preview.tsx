"use client";
import { useId, type CSSProperties } from "react";
import type { CandleShape } from "@/lib/catalog";
import "./candle-preview.css";

/** Uploaded form masks take the selected wax colour; existing built-in forms stay compatible. */
function colorChannels(hex: string) {
  const safe = /^#[0-9a-f]{6}$/i.test(hex) ? hex : "#e8ddca";
  return [1, 3, 5].map(index => parseInt(safe.slice(index, index + 2), 16) / 255);
}

export function CandlePreview({ shape, silhouette, color = "#e8ddca", accentColor = color, twoTone = false, label }: { shape?: CandleShape | null; silhouette?: string | null; color?: string; accentColor?: string; twoTone?: boolean; label?: string }) {
  const filterId = `candle-tint-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  if (silhouette && twoTone) {
    const base = colorChannels(color), accent = colorChannels(accentColor);
    const matrix = base.flatMap((channel, index) => {
      const difference = accent[index] - channel;
      return [difference * 0.2126, difference * 0.7152, difference * 0.0722, 0, channel];
    }).concat([0, 0, 0, 1, 0]).join(" ");
    return <div className="wax-stage wax-uploaded wax-two-tone" role={label ? "img" : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
      <div className="wax-ground" />
      <svg className="wax-color-map" aria-hidden="true" viewBox="0 0 100 100" preserveAspectRatio="none">
        <defs><filter id={filterId} x="0" y="0" width="100%" height="100%" colorInterpolationFilters="sRGB"><feColorMatrix type="matrix" values={matrix} /></filter></defs>
        <image href={silhouette} width="100" height="100" preserveAspectRatio="xMidYMax meet" filter={`url(#${filterId})`} />
      </svg>
    </div>;
  }
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
