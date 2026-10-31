/** 'YYYY-MM' months from `first` to `last` included (both 'YYYY-MM' or dates), to fill chart gaps without generate_series. */
export function monthSeries(first, last) {
  const out = [];
  let [y, m] = String(first).slice(0, 7).split('-').map(Number);
  const end = String(last).slice(0, 7);
  for (let guard = 0; guard < 240; guard++) {
    const key = `${y}-${String(m).padStart(2, '0')}`;
    out.push(key);
    if (key >= end) break;
    m += 1; if (m > 12) { m = 1; y += 1; }
  }
  return out;
}
