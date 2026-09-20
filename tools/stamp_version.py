#!/usr/bin/env python3
"""Stamp a content hash onto every local file index.html pulls in.

  python3 tools/stamp_version.py           # rewrite index.html
  python3 tools/stamp_version.py --check   # fail if a stamp is out of date

GitHub Pages serves everything with cache-control: max-age=600, so without a
stamp a returning player can run a fresh index.html against ten-minute-old
scripts. With "game.js?v=<hash>" a changed file is simply a different URL, and
files that did not change stay in the browser cache.
"""
import hashlib
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PAGE = os.path.join(ROOT, "index.html")
SITE = "https://flappylesha.ru/"

# attribute values that point at a file of ours, with or without a stamp
REF = re.compile(r'(?P<attr>(?:src|href|content)=")(?P<url>[^"]+?)(?:\?v=[0-9a-f]+)?(?P<end>")')


def digest(path):
    h = hashlib.sha1()
    with open(path, "rb") as fh:
        for chunk in iter(lambda: fh.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()[:8]


def local_path(url):
    """The file a reference points at, or None if it is not ours."""
    rel = url[len(SITE):] if url.startswith(SITE) else url
    if rel.startswith(("http://", "https://", "//", "data:", "#", "mailto:")):
        return None
    if not rel.split("?")[0].endswith((".js", ".css", ".png", ".jpg", ".ico")):
        return None
    path = os.path.join(ROOT, rel.split("?")[0])
    return path if os.path.exists(path) else None


def main():
    check = "--check" in sys.argv
    html = open(PAGE, encoding="utf-8").read()
    stamped = []

    def replace(m):
        path = local_path(m.group("url"))
        if not path:
            return m.group(0)
        stamp = digest(path)
        stamped.append((os.path.relpath(path, ROOT), stamp))
        return "%s%s?v=%s%s" % (m.group("attr"), m.group("url"), stamp, m.group("end"))

    out = REF.sub(replace, html)

    if check:
        if out != html:
            print("index.html is out of date - run: python3 tools/stamp_version.py")
            return 1
        print("stamps are current (%d files)" % len(stamped))
        return 0

    if out == html:
        print("nothing to do (%d files already stamped)" % len(stamped))
        return 0

    open(PAGE, "w", encoding="utf-8").write(out)
    for rel, stamp in stamped:
        print("  %-28s v=%s" % (rel, stamp))
    print("stamped %d files into index.html" % len(stamped))
    return 0


if __name__ == "__main__":
    sys.exit(main())
