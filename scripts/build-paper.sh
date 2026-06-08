#!/usr/bin/env bash
# Build paper.pdf from paper.md: render mermaid figures to images, match the
# Article-1 sans-serif look. Requires: pandoc, mermaid-cli (npx), Google Chrome.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"; cd "$ROOT"
WORK="$(mktemp -d)"; FIGS="$WORK/figs"; mkdir -p "$FIGS"
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
export PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true PUPPETEER_EXECUTABLE_PATH="$CHROME"
echo '{"executablePath":"'"$CHROME"'","args":["--no-sandbox"]}' > "$WORK/pptr.json"

# 1) extract mermaid blocks -> fig*.mmd; replace each with just the image (the
#    manuscript already carries its own "Fig. N." caption paragraph).
python3 - "$ROOT/paper.md" "$WORK/paper_build.md" "$FIGS" <<'PY'
import sys,re
src,out,figs=sys.argv[1],sys.argv[2],sys.argv[3]
text=open(src,encoding='utf-8').read(); n=0
def repl(m):
    global n; n+=1
    open(f"{figs}/fig{n}.mmd","w",encoding='utf-8').write(m.group(1))
    return f"\n![]({figs}/fig{n}.png)\n"
text=re.sub(r"```mermaid\n(.*?)\n```", repl, text, flags=re.S)
open(out,"w",encoding='utf-8').write(text); print(f"extracted {n} figures")
PY

# 2) render each figure (larger font for legibility per reviewer note)
echo '{"themeVariables":{"fontSize":"20px"}}' > "$WORK/mmd.json"
for f in "$FIGS"/*.mmd; do
  npx -y @mermaid-js/mermaid-cli@10.9.1 -i "$f" -o "${f%.mmd}.png" \
    -p "$WORK/pptr.json" -c "$WORK/mmd.json" -b white -w 1600 -t neutral >/dev/null 2>&1
done

# 3) CSS — match Article 1 (Liberation Sans / Arial, left-aligned, bold headings, no rules)
cat > "$WORK/paper.css" <<'CSS'
@page { size: letter; margin: 0.9in 0.95in; }
body{font-family:Arial,"Helvetica Neue",Helvetica,"Liberation Sans",sans-serif;
  font-size:10.7pt;line-height:1.46;color:#111;text-align:left;}
h1{font-size:17.5pt;line-height:1.25;margin:0 0 6pt;font-weight:bold;}
h2{font-size:13pt;font-weight:bold;margin:16pt 0 5pt;}
h3{font-size:11pt;font-weight:bold;margin:12pt 0 3pt;}
p{margin:0 0 7pt;text-align:left;}
blockquote{color:#333;border-left:3px solid #bbb;margin:6pt 0;padding:2pt 0 2pt 12pt;font-size:9.8pt;}
code{font-family:"SF Mono","Menlo","Consolas",monospace;font-size:9pt;background:#f4f4f4;padding:0 2px;}
pre{background:#f4f4f4;padding:8pt;font-size:8.6pt;overflow-x:auto;border-radius:3px;}
pre code{background:none;padding:0;}
table{border-collapse:collapse;width:100%;font-size:9pt;margin:8pt 0;}
th,td{border:1px solid #ccc;padding:3pt 6pt;text-align:left;vertical-align:top;} th{background:#f0f0f0;}
a{color:#0a3d62;text-decoration:none;}
img{max-width:100%;max-height:8.4in;width:auto;height:auto;display:block;margin:10pt auto 2pt;break-inside:avoid;page-break-inside:avoid;}
img.authorphoto{width:1.85in;margin:2pt 0 6pt 0;}
CSS

# 4) pandoc (implicit_figures OFF -> no duplicate auto-captions) -> Chrome PDF
pandoc "$WORK/paper_build.md" -f markdown-implicit_figures -t html5 -s --embed-resources \
  --resource-path="$ROOT" --metadata title="" -c "$WORK/paper.css" -o "$WORK/paper.html"
"$CHROME" --headless=new --disable-gpu --no-pdf-header-footer \
  --print-to-pdf="$ROOT/paper.pdf" "file://$WORK/paper.html" >/dev/null 2>&1
echo "built: $ROOT/paper.pdf"; rm -rf "$WORK"
