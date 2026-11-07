const SUFFIXES = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No', 'Dc'];

export function fmt(n: number, digits = 2): string {
  if (!isFinite(n)) return '∞';
  if (n < 0) return '-' + fmt(-n, digits);
  if (n < 1000) return n < 10 && n % 1 !== 0 ? n.toFixed(1) : Math.floor(n).toString();
  const tier = Math.floor(Math.log10(n) / 3);
  if (tier < SUFFIXES.length) {
    const scaled = n / Math.pow(1000, tier);
    return scaled.toFixed(scaled >= 100 ? 0 : scaled >= 10 ? 1 : digits) + SUFFIXES[tier];
  }
  return n.toExponential(digits).replace('+', '');
}

export function fmtTime(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${sec.toString().padStart(2, '0')}s`;
  return `${sec}s`;
}

export function pct(x: number): string {
  return `${Math.round(x * 100)}%`;
}
