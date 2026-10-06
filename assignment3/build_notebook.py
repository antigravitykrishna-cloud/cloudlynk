"""Builds Assignment3_MIMIC_EDA.ipynb: code cells from assignment3_mimic_eda.py, explanations
from build_report.py (same text as the Word report). Run assignment3_mimic_eda.py first."""
import re, sys, json, types, nbformat
from nbformat.v4 import new_notebook, new_code_cell, new_markdown_cell

OUTDIR = sys.argv[1] if len(sys.argv) > 1 else "assignment3_outputs"

# ---- 1. capture the report text with a recording stand-in for python-docx -----------
class Rec:
    def __init__(s): s.items = []; s.styles = {"Normal": types.SimpleNamespace(font=types.SimpleNamespace())}
    def add_heading(s, t, l=1): s.items.append(("h", l, t))
    def add_paragraph(s, t=""):
        s.items.append(("p", t)); item = s.items[-1]
        class Run: 
            bold = False
        class Par:
            def add_run(_, tx):
                s.items[-1] = ("p", tx); r = Run(); return r
        return Par()
    def add_picture(s, *a, **k): pass
    def add_table(s, rows, cols):
        t = types.SimpleNamespace(style=None, rows=[types.SimpleNamespace(cells=[types.SimpleNamespace(text="") for _ in range(cols)])])
        def add_row():
            r = types.SimpleNamespace(cells=[types.SimpleNamespace(text="") for _ in range(cols)]); t.rows.append(r); return r
        t.add_row = add_row; s.items.append(("t", t)); return t
    def save(s, *a): pass
rec = Rec()
src = open("build_report.py").read().replace("from docx import Document", "Document = lambda: REC")
src = src.replace("from docx.shared import Inches, Pt", "Inches = Pt = lambda x: x")
sys.argv = ["build_report.py", OUTDIR]
_argv = sys.argv
exec(compile(src, "build_report.py", "exec"), {"REC": rec, "__name__": "x"})
sys.argv = [_argv[0]] + _argv[2:]

def md_item(it):
    if it[0] == "h": return "#" * (it[1] + 1) + " " + it[2] if it[1] else "# " + it[2]
    if it[0] == "p": return it[1]
    t = it[1]; rows = [[c.text.replace("|", "/").replace("\n", " ") for c in r.cells] for r in t.rows]
    out = ["| " + " | ".join(rows[0]) + " |", "|" + "---|" * len(rows[0])]
    out += ["| " + " | ".join(r) + " |" for r in rows[1:]]
    return "\n".join(out)

# group by section heading
pending = None
groups, order, cur = {}, [], "intro"
groups["intro"] = []; order.append("intro")
for it in rec.items:
    if it[0] == "h" and it[1] == 2:
        cur = it[2].split(".")[0] + "." + it[2].split(".")[1].split(" ")[0] if False else it[2][:2]
        groups[cur] = [pending] if pending else []; pending = None; order.append(cur)
    elif it[0] == "h" and it[1] == 1 and it[2].startswith("Part B"):
        pending = it; continue
    elif it[0] == "h" and it[1] == 1 and it[2].startswith("Part"):
        pass
    elif it[0] == "h" and it[1] in (0,):
        pass
    elif it[0] == "h" and it[1] == 1 and it[2] == "Reproducibility":
        cur = "end"; groups[cur] = []; order.append(cur)
    groups.setdefault(cur, [])
    groups[cur].append(it)
def md(key, drop_first_heading=False):
    its = groups.get(key, [])
    return "\n\n".join(md_item(i) for i in its)

# ---- 2. split the analysis script into code cells ------------------------------------
lines = open("assignment3_mimic_eda.py").read().split("\n")
cells, buf, in_hdr = [], [], False
title = None
def flush():
    global buf
    txt = "\n".join(buf).strip("\n")
    if txt.strip(): cells.append((title, txt))
    buf = []
i = 0
while i < len(lines):
    ln = lines[i]
    if re.match(r"^# -{20,}\s*$", ln):
        if not in_hdr:
            flush(); in_hdr = True
            title = lines[i + 1][2:].strip()
        else:
            in_hdr = False
    buf.append(ln); i += 1
flush()
# the module docstring + imports come before the first header
head = cells[0]
print([c[0] for c in cells])

nb = new_notebook()
nb.metadata["kernelspec"] = {"display_name": "Python 3", "language": "python", "name": "python3"}
nb.cells.append(new_markdown_cell(md("intro") + "\n\n**How to run:** put this notebook next to the unzipped `mimic-iv-clinical-database-demo-2.2` folder (or set `MIMIC_DIR` in the first code cell) and choose *Run All*. The numbers quoted in the explanations are from the run saved in this notebook."))
sect_key = lambda t: t[:2] if t and re.match(r"[AB]\d", t) else None
for t, code in cells:
    if t is None:
        code = re.sub(r'^"""(.|\n)*?"""', '"""Assignment 3: EDA + standards normalization on MIMIC-IV demo v2.2.\nCohort: all ICU stays. Labs: labevents inside the stay window. Vitals: chartevents."""', code, count=1)
    nb.cells.append(new_code_cell(code))
    if t and t.startswith("B1/B2"):
        for k in ("B1", "B2"):
            nb.cells.append(new_markdown_cell(md(k)))
    elif sect_key(t):
        nb.cells.append(new_markdown_cell(md(sect_key(t))))
        if t.startswith("B3"): nb.cells.append(new_markdown_cell(md("B4")))
nb.cells.append(new_markdown_cell("## Reproducibility\n\nRun All from top to bottom. Figures and tables are also saved to the `assignment3_outputs` folder."))
nbformat.write(nb, "Assignment3_MIMIC_EDA.ipynb")
print("cells:", len(nb.cells))
