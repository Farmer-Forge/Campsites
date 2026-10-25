#!/usr/bin/env python3
r"""Generate Campsites' ralphloop/task.md from the approved specs' decisions,
embedding V1's styles verbatim from ~/projects/PrimeNG at tag v1.0.

Markers in TEMPLATE:
  {{FILE:<path>}}    -> the whole file at v1.0
  {{INLINE:<path>}}  -> the component's inline `styles: \`...\`` block at v1.0 (dedented)
  {{LICENSE}}        -> the PrimeUI license string from v1.0's app.config.ts
"""
import re, subprocess, sys, textwrap, pathlib

V1 = pathlib.Path.home() / "projects/PrimeNG"

def show(path):
    return subprocess.run(["git", "-C", str(V1), "show", f"v1.0:{path}"],
                          check=True, capture_output=True, text=True).stdout

def inline_styles(path):
    src = show(path)
    m = re.search(r"styles: `\n(.*?)\n  `,", src, re.S)
    if not m:
        sys.exit(f"no inline styles in {path}")
    return textwrap.dedent(m.group(1)).strip("\n") + "\n"

def strip_rules(css, selectors):
    """Remove top-level rule blocks whose selector is exactly one of `selectors`."""
    out, skip = [], False
    for line in css.splitlines(keepends=True):
        head = line.rstrip()
        if not skip and head.endswith("{") and head[:-1].strip() in selectors and not line.startswith(" "):
            skip = True
            continue
        if skip:
            if line.startswith("}"):
                skip = False
            continue
        out.append(line)
    return re.sub(r"\n{3,}", "\n\n", "".join(out))

def license_key():
    m = re.search(r"license: '([^']+)'", show("src/app/app.config.ts"))
    return m.group(1)

def fill(text):
    text = re.sub(r"\{\{FILE:([^}]+)\}\}", lambda m: show(m.group(1)).rstrip("\n"), text)
    text = re.sub(r"\{\{INLINE_NOTHEME:([^}]+)\}\}", lambda m: strip_rules(inline_styles(m.group(1)), {".theme-row", ".theme-toggle", ".track", ".track.is-on", ".knob"}).rstrip("\n"), text)
    text = re.sub(r"\{\{INLINE:([^}]+)\}\}", lambda m: inline_styles(m.group(1)).rstrip("\n"), text)
    text = text.replace("{{LICENSE}}", license_key())
    return text

template = pathlib.Path(sys.argv[1]).read_text()
out = fill(template)
left = re.findall(r"\{\{[A-Z]+:?[^}]*\}\}", out)
if left:
    sys.exit(f"unfilled markers: {left}")
pathlib.Path(sys.argv[2]).write_text(out)
print(f"wrote {sys.argv[2]}: {out.count(chr(10))} lines")
