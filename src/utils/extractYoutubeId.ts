export function extractYoutubeId(url: string): string | null {
  if (!url.trim()) return null;
  const patterns = [
    /[?&]v=([a-zA-Z0-9_-]{11})/,        // watch?v=
    /youtu\.be\/([a-zA-Z0-9_-]{11})/,    // youtu.be/
    /\/shorts\/([a-zA-Z0-9_-]{11})/,     // shorts/
    /\/embed\/([a-zA-Z0-9_-]{11})/,      // embed/
  ];
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
}
