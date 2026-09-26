const arrowRotation = { right: 0, down: 90, left: 180, up: -90, "up-right": -45, "down-right": 45 } as const;

/** Draw UI symbols as strokes so mobile fonts cannot substitute emoji artwork. */
export function ArrowIcon({ direction = "up-right" }: { direction?: keyof typeof arrowRotation }) {
  return <svg className="ui-icon" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    <path d="M5 12h14m-7-7 7 7-7 7" transform={`rotate(${arrowRotation[direction]} 12 12)`} />
  </svg>;
}

export function CheckIcon() {
  return <svg className="ui-icon" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    <path d="m5 12 4 4L19 6" />
  </svg>;
}
