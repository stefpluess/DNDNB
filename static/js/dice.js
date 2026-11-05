// Dice expressions: "1d20+5", "2d6+1d8+3", "8d6", "−2". DOM-free so it can be tested in Node.

/**
 * Roll an expression. Returns { total, detail, nat } or null if the expression isn't valid.
 * `nat` is the natural die for a single d20 (for crits and fumbles), otherwise null.
 * `rand` can be replaced in tests with a predictable source.
 */
export function roll(expr, rand = Math.random) {
  const s = String(expr ?? '').replace(/\s+/g, '').toLowerCase().replace(/−/g, '-');
  if (!s) return null;
  const re = /([+-]?)(\d*d\d+|\d+)/g;
  let m, pos = 0, total = 0, nat = null;
  const parts = [];
  while ((m = re.exec(s))) {
    if (m.index !== pos) return null;
    pos = re.lastIndex;
    const sign = m[1] === '-' ? -1 : 1;
    if (m[2].includes('d')) {
      let [n, f] = m[2].split('d');
      n = +(n || 1); f = +f;
      if (n < 1 || n > 100 || f < 1) return null;
      const rolls = Array.from({ length: n }, () => 1 + Math.floor(rand() * f));
      if (n === 1 && f === 20) nat = rolls[0];
      total += sign * rolls.reduce((a, b) => a + b, 0);
      parts.push((sign < 0 ? '− ' : parts.length ? '+ ' : '') + `[${rolls.join(',')}]`);
    } else {
      total += sign * +m[2];
      parts.push((sign < 0 ? '− ' : '+ ') + m[2]);
    }
  }
  if (pos !== s.length) return null;
  return { total, detail: parts.join(' '), nat };
}

/** Critical hits roll twice the dice: "2d6+3" -> "4d6+3". */
export const doubleDice = expr => String(expr).replace(/(\d*)d(\d+)/g, (_, n, f) => `${2 * (+n || 1)}d${f}`);

export const d20 = (rand = Math.random) => 1 + Math.floor(rand() * 20);
