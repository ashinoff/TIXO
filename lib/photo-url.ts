/** Uploaded photographs are served as resized WebP copies; design assets stay untouched. */
export const photoWidths = [320, 640, 960, 1600];
export const photoUrl = (src: string, width: number) => src?.startsWith("/api/uploads/") && !src.includes("?") ? `${src}?w=${width}` : src;
