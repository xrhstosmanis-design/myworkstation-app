#!/usr/bin/env python3
from pathlib import Path
import re

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    BaseDocTemplate,
    Frame,
    KeepTogether,
    PageTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
)

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "docs" / "roadmap" / "PENDING_WORK.md"
OUTPUT = ROOT / "output" / "pdf" / "MyWorkStation_Central_Pending_Roadmap_2026-09-23.pdf"

FONT = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
FONT_BOLD = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
pdfmetrics.registerFont(TTFont("MWS", FONT))
pdfmetrics.registerFont(TTFont("MWS-Bold", FONT_BOLD))

NAVY = colors.HexColor("#0B1F3A")
BLUE = colors.HexColor("#147DC2")
TEAL = colors.HexColor("#07855C")
PALE_BLUE = colors.HexColor("#EEF6FC")
PALE_GREEN = colors.HexColor("#EAF8F2")
PALE_YELLOW = colors.HexColor("#FFF6D8")
LIGHT = colors.HexColor("#F5F7FA")
MID = colors.HexColor("#D5E0EA")
TEXT = colors.HexColor("#172238")
MUTED = colors.HexColor("#5E6E86")


def esc(text: str) -> str:
    text = text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
    text = re.sub(r"`([^`]+)`", r'<font name="MWS-Bold">\1</font>', text)
    text = re.sub(r"\*\*([^*]+)\*\*", r'<font name="MWS-Bold">\1</font>', text)
    return text


styles = getSampleStyleSheet()
title = ParagraphStyle(
    "TitleGreek", parent=styles["Title"], fontName="MWS-Bold", fontSize=20,
    leading=25, textColor=NAVY, alignment=TA_LEFT, spaceAfter=7 * mm,
)
h1 = ParagraphStyle(
    "H1Greek", parent=styles["Heading1"], fontName="MWS-Bold", fontSize=14,
    leading=18, textColor=NAVY, spaceBefore=6 * mm, spaceAfter=2.5 * mm,
    keepWithNext=True,
)
h2 = ParagraphStyle(
    "H2Greek", parent=styles["Heading2"], fontName="MWS-Bold", fontSize=11.5,
    leading=15, textColor=BLUE, spaceBefore=4 * mm, spaceAfter=2 * mm,
    keepWithNext=True,
)
body = ParagraphStyle(
    "BodyGreek", parent=styles["BodyText"], fontName="MWS", fontSize=8.7,
    leading=12.3, textColor=TEXT, spaceAfter=1.8 * mm,
)
bullet = ParagraphStyle(
    "BulletGreek", parent=body, leftIndent=5 * mm, firstLineIndent=-3.2 * mm,
    bulletIndent=1.5 * mm, spaceAfter=1.1 * mm,
)
quote = ParagraphStyle(
    "QuoteGreek", parent=body, leftIndent=5 * mm, rightIndent=3 * mm,
    borderColor=TEAL, borderWidth=1.2, borderPadding=4 * mm,
    backColor=PALE_GREEN, textColor=NAVY, spaceBefore=5 * mm, spaceAfter=4 * mm,
)
small = ParagraphStyle(
    "SmallGreek", parent=body, fontSize=7.4, leading=10, textColor=MUTED,
)
table_header = ParagraphStyle(
    "TableHeaderGreek", parent=small, fontName="MWS-Bold", textColor=colors.white,
    alignment=TA_CENTER,
)
table_cell = ParagraphStyle(
    "TableCellGreek", parent=small, textColor=TEXT,
)


def page_decor(canvas, doc):
    canvas.saveState()
    width, height = A4
    canvas.setFillColor(NAVY)
    canvas.rect(0, height - 12 * mm, width, 12 * mm, fill=1, stroke=0)
    canvas.setFont("MWS-Bold", 8)
    canvas.setFillColor(colors.white)
    canvas.drawString(16 * mm, height - 7.5 * mm, "MYWORKSTATION - ΚΕΝΤΡΙΚΟ ROADMAP")
    canvas.setStrokeColor(MID)
    canvas.line(15 * mm, 13 * mm, width - 15 * mm, 13 * mm)
    canvas.setFont("MWS", 7.5)
    canvas.setFillColor(MUTED)
    canvas.drawString(16 * mm, 8 * mm, "Ενεργή λίστα - κάθε πραγματικό PASS αφαιρείται υποχρεωτικά")
    canvas.drawRightString(width - 16 * mm, 8 * mm, f"Σελίδα {doc.page}")
    canvas.restoreState()


def parse_table(lines, start):
    rows = []
    i = start
    while i < len(lines) and lines[i].strip().startswith("|"):
        values = [part.strip() for part in lines[i].strip().strip("|").split("|")]
        if not all(re.fullmatch(r"[-: ]+", value or "-") for value in values):
            rows.append(values)
        i += 1
    return rows, i


def make_story(markdown: str):
    lines = markdown.splitlines()
    story = []
    i = 0
    first_title = True
    while i < len(lines):
        raw = lines[i].rstrip()
        stripped = raw.strip()
        if not stripped:
            i += 1
            continue
        if stripped.startswith("|"):
            rows, i = parse_table(lines, i)
            if rows:
                rendered = []
                for ridx, row in enumerate(rows):
                    rendered.append([
                        Paragraph(esc(cell), table_header if ridx == 0 else table_cell)
                        for cell in row
                    ])
                widths = [14 * mm, 42 * mm, 43 * mm, 78 * mm][: len(rendered[0])]
                table = Table(rendered, colWidths=widths, repeatRows=1, hAlign="LEFT")
                table.setStyle(TableStyle([
                    ("BACKGROUND", (0, 0), (-1, 0), NAVY),
                    ("GRID", (0, 0), (-1, -1), 0.35, MID),
                    ("VALIGN", (0, 0), (-1, -1), "TOP"),
                    ("LEFTPADDING", (0, 0), (-1, -1), 4),
                    ("RIGHTPADDING", (0, 0), (-1, -1), 4),
                    ("TOPPADDING", (0, 0), (-1, -1), 4),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
                    ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, LIGHT]),
                ]))
                story.extend([table, Spacer(1, 3 * mm)])
            continue
        if stripped.startswith("# "):
            text = stripped[2:]
            story.append(Paragraph(esc(text), title if first_title else h1))
            first_title = False
        elif stripped.startswith("## "):
            story.append(Paragraph(esc(stripped[3:]), h1))
        elif stripped.startswith("### "):
            story.append(Paragraph(esc(stripped[4:]), h2))
        elif stripped.startswith("> "):
            story.append(Paragraph(esc(stripped[2:]), quote))
        elif re.match(r"^- ", stripped):
            story.append(Paragraph("• " + esc(stripped[2:]), bullet))
        elif re.match(r"^\d+\. ", stripped):
            number, text = stripped.split(". ", 1)
            story.append(Paragraph(f"{number}. {esc(text)}", bullet))
        else:
            story.append(Paragraph(esc(stripped), body))
        i += 1
    return story


def build():
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    doc = BaseDocTemplate(
        str(OUTPUT), pagesize=A4, leftMargin=16 * mm, rightMargin=16 * mm,
        topMargin=20 * mm, bottomMargin=18 * mm,
        title="MyWorkStation - Κεντρική λίστα εκκρεμοτήτων",
        author="MyWorkStation",
        subject="Gate 1-8, εγκατάσταση και υπόλοιπες εργασίες",
    )
    frame = Frame(doc.leftMargin, doc.bottomMargin, doc.width, doc.height, id="main")
    doc.addPageTemplates(PageTemplate(id="roadmap", frames=[frame], onPage=page_decor))
    doc.build(make_story(SOURCE.read_text(encoding="utf-8")))
    print(OUTPUT)


if __name__ == "__main__":
    build()
