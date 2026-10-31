import sys, numpy as np
from PIL import Image
# strand.py <png> <x> <y> : finds the dot's exact centre near (x,y) and its distance to the purple (E) and blue (A) strand lines.
src, x0, y0 = sys.argv[1], float(sys.argv[2]), float(sys.argv[3])
a = np.asarray(Image.open(src).convert('RGB')).astype(int)
def mask(rgb, tol=40):
    return (np.abs(a - np.array(rgb)).sum(axis=2) < tol)
H, W = a.shape[:2]
yy, xx = np.mgrid[0:H, 0:W]
for name, rgb in [('purple', (125, 90, 166)), ('blue', (0, 161, 222))]:
    m = mask(rgb)
    d = np.hypot(xx - x0, yy - y0)
    near = m & (d < 12)
    pass
# dot: the colour at the given point, blob within 10 px
dotc = a[int(round(y0)), int(round(x0))]
m = mask(dotc, 30) & (np.hypot(xx - x0, yy - y0) < 9)
cy, cx = yy[m].mean(), xx[m].mean()
print(f'dot rgb {tuple(dotc)} centre ({cx:.1f},{cy:.1f}) area {m.sum()}')
for name, rgb in [('purple', (150, 123, 181)), ('blue', (52, 178, 225))]:
    d = np.hypot(xx - cx, yy - cy)
    sel = mask(rgb) & (d > 12) & (d < 45)
    pts = np.stack([xx[sel], yy[sel]], 1).astype(float)
    if len(pts) < 10: print(name, 'too few', len(pts)); continue
    c = pts.mean(0); u, s, vt = np.linalg.svd(pts - c); dirv = vt[0]; n = np.array([-dirv[1], dirv[0]])
    print(f'{name}: {len(pts)} px, dot centre {np.dot(np.array([cx, cy]) - c, n):+.2f} px from its line (normal {n.round(2)})')
