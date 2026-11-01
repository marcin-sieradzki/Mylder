import json, sys, re, difflib, os
a, b = sys.argv[1], sys.argv[2]  # main dir, branch dir (.verify/<run>)
def norm(s):
    s = re.sub(r'\d+', 'N', s)
    return s
for j in sorted(os.listdir(b)):
    fb = os.path.join(b, j, 'texts.json'); fa = os.path.join(a, j, 'texts.json')
    if not os.path.exists(fb): continue
    A = json.load(open(fa)); B = json.load(open(fb))
    keys = sorted(set(A) | set(B))
    for k in keys:
        if k not in A or k not in B:
            print(f'== {j} {k}: only in', 'main' if k in A else 'branch'); continue
        if (A[k] if '--raw' in sys.argv else norm(A[k])) != (B[k] if '--raw' in sys.argv else norm(B[k])):
            print(f'== {j} {k} differs')
            for l in difflib.unified_diff(A[k].splitlines(), B[k].splitlines(), 'main', 'branch', n=0, lineterm=''): print('  ', l)
        else: print(f'   {j} {k} same')
