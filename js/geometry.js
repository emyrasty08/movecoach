// Small 2D geometry helpers shared by the exercise rules (points are {x, y}, y down).

const deg = (r) => (r * 180) / Math.PI;
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const finite = (xs) => xs.filter((x) => Number.isFinite(x));

export const G = {
  deg,
  clamp,
  ok: (p) => !!p && Number.isFinite(p.x) && Number.isFinite(p.y),
  mid: (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }),
  dist: (a, b) => (a && b ? Math.hypot(a.x - b.x, a.y - b.y) : NaN),
  // angle at b of the triangle a-b-c, degrees (180 = straight)
  angle3(a, b, c) {
    const u = { x: a.x - b.x, y: a.y - b.y }, v = { x: c.x - b.x, y: c.y - b.y };
    const cos = (u.x * v.x + u.y * v.y) / (Math.hypot(u.x, u.y) * Math.hypot(v.x, v.y));
    return deg(Math.acos(clamp(cos, -1, 1)));
  },
  // tilt of the segment a->b from the image vertical, degrees (0 = vertical)
  tilt: (a, b) => deg(Math.atan2(Math.abs(b.x - a.x), Math.abs(b.y - a.y))),
  // tilt of the segment a->b from the image horizontal, degrees (0 = horizontal)
  slope: (a, b) => deg(Math.atan2(Math.abs(b.y - a.y), Math.abs(b.x - a.x))),
  // tilt out of the image plane from foreshortening: length now vs length at rest
  foreshortening: (len, len0) => deg(Math.acos(clamp(len / len0, 0, 1))),
  median(xs) {
    const s = finite(xs).sort((a, b) => a - b);
    if (!s.length) return NaN;
    const m = s.length >> 1;
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  },
  max: (xs) => (finite(xs).length ? Math.max(...finite(xs)) : NaN),
  min: (xs) => (finite(xs).length ? Math.min(...finite(xs)) : NaN),
};
