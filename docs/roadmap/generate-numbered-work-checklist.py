#!/usr/bin/env python3
"""Generate the dated numbered checklist PDF from its Markdown source."""
from pathlib import Path
import re
from xml.sax.saxutils import escape
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak, KeepTogether

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / 'docs/roadmap/NUMBERED_WORK_CHECKLIST_2026-10-06.md'
OUT = ROOT / 'docs/roadmap/MyWorkStation_Numbered_Checklist_2026-10-06.pdf'
TRACKER_URL = 'https://github.com/xrhstosmanis-design/myworkstation-app/blob/main/docs/roadmap/OPEN_WORK_TRACKER.md'

pdfmetrics.registerFont(TTFont('Greek', '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'))
pdfmetrics.registerFont(TTFont('GreekBold', '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'))

NAVY = colors.HexColor('#15324B')
TEAL = colors.HexColor('#147D83')
INK = colors.HexColor('#24323D')
MUTED = colors.HexColor('#526575')
PALE = colors.HexColor('#F3F7F9')
LINE = colors.HexColor('#DAE4EA')

body = ParagraphStyle('ChecklistBody', fontName='GreekBold', fontSize=9.4, leading=12, textColor=INK)
status = ParagraphStyle('ChecklistStatus', fontName='GreekBold', fontSize=7.8, leading=10, textColor=TEAL)
note = ParagraphStyle('ChecklistNote', fontName='Greek', fontSize=8, leading=10.1, textColor=MUTED, spaceBefore=2)
small = ParagraphStyle('ChecklistSmall', fontName='Greek', fontSize=8.6, leading=11.2, textColor=MUTED)


def load_items():
    text = SOURCE.read_text(encoding='utf-8')
    blocks = re.split(r'(?=^## \d{2} — )', text, flags=re.M)
    items = []
    for block in blocks:
        head = re.match(r'^## (\d{2}) — (.+)$', block, flags=re.M)
        if not head:
            continue
        ref = re.search(r'^- \*\*Tracker ID:\*\* `([^`]+)`$', block, flags=re.M)
        current = re.search(r'^- \*\*Κατάσταση στο στιγμιότυπο 06/10/2026:\*\* (.+)$', block, flags=re.M)
        remaining = re.search(r'^- \*\*Υπόλοιπο / όριο:\*\* (.+)$', block, flags=re.M)
        if not ref or not current:
            raise ValueError(f'Missing tracker ID or status for checklist item {head.group(1)}')
        items.append((int(head.group(1)), ref.group(1), head.group(2), current.group(1), remaining.group(1) if remaining else ''))
    if [item[0] for item in items] != list(range(1, 52)):
        raise ValueError('Expected exactly 51 consecutively numbered checklist items')
    return items


def on_page(canvas, doc):
    canvas.saveState()
    width, height = A4
    left, right = 14 * mm, 14 * mm
    canvas.setFillColor(NAVY)
    canvas.setFont('GreekBold', 8)
    canvas.drawString(left, height - 10 * mm, 'MyWorkStation  |  Αριθμημένος έλεγχος εργασιών')
    canvas.setFillColor(MUTED)
    canvas.setFont('Greek', 7.5)
    canvas.drawRightString(width - right, height - 10 * mm, 'Στιγμιότυπο 06/10/2026')
    canvas.setStrokeColor(LINE)
    canvas.setLineWidth(.6)
    canvas.line(left, height - 12 * mm, width - right, height - 12 * mm)
    canvas.line(left, 12 * mm, width - right, 12 * mm)
    canvas.setFillColor(MUTED)
    canvas.setFont('Greek', 6.6)
    canvas.drawString(left, 8 * mm, 'Κατάσταση/ανάθεση/τεκμήρια: OPEN_WORK_TRACKER.md · main 329792bad1ef')
    canvas.drawRightString(width - right, 8 * mm, str(doc.page))
    canvas.restoreState()


def build():
    items = load_items()
    left = right = 14 * mm
    doc = SimpleDocTemplate(str(OUT), pagesize=A4, leftMargin=left, rightMargin=right,
                            topMargin=18 * mm, bottomMargin=16 * mm,
                            title='MyWorkStation — Αριθμημένη λίστα εκκρεμοτήτων', author='MyWorkStation')
    story = [
        Paragraph('Αριθμημένη λίστα εργασιών', ParagraphStyle('ChecklistTitle', fontName='GreekBold', fontSize=16, leading=20, textColor=NAVY, spaceAfter=3)),
        Paragraph('51 θέματα · στιγμιότυπο 06/10/2026 · συμπληρωματική ενημέρωση N10 07/10/2026 · βάση main 329792bad1efc5705fff663d093fc89377b97500', small),
        Spacer(1, 3),
        Paragraph('Οι αριθμοί αυτής της εκτύπωσης είναι ανεξάρτητοι από τα IDs του tracker· το αντίστοιχο ID και η καταγεγραμμένη κατάσταση φαίνονται σε κάθε γραμμή. Ο tracker παραμένει η πηγή για υπευθύνους, πλήρη κριτήρια PASS και αποδείξεις.', small),
        Spacer(1, 3),
        Paragraph(f'<link href="{TRACKER_URL}" color="#147D83"><u>Άνοιγμα του canonical tracker</u></link>', ParagraphStyle('TrackerLink', parent=small, fontName='GreekBold', textColor=TEAL)),
        Spacer(1, 6),
    ]
    for number, ref, title, current, remaining in items:
        title_p = Paragraph(escape(title), body)
        lines = [Paragraph(f'Tracker {escape(ref)}  ·  {escape(current)}', status)]
        if remaining:
            lines.append(Paragraph(escape(remaining), note))
        inner = Table([[title_p], [lines]], colWidths=[doc.width - 38], hAlign='LEFT')
        inner.setStyle(TableStyle([('LEFTPADDING',(0,0),(-1,-1),0),('RIGHTPADDING',(0,0),(-1,-1),0),
                                   ('TOPPADDING',(0,0),(-1,-1),0),('BOTTOMPADDING',(0,0),(-1,-1),0),('VALIGN',(0,0),(-1,-1),'TOP')]))
        card = Table([[Paragraph(f'{number:02d}', ParagraphStyle('ChecklistNumber', fontName='GreekBold', fontSize=9.4, leading=12, textColor=TEAL)), inner]],
                     colWidths=[10 * mm, doc.width - 10 * mm], hAlign='LEFT')
        card.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,-1),PALE),('BOX',(0,0),(-1,-1),.45,LINE),
                                  ('LEFTPADDING',(0,0),(-1,-1),5),('RIGHTPADDING',(0,0),(-1,-1),5),
                                  ('TOPPADDING',(0,0),(-1,-1),4),('BOTTOMPADDING',(0,0),(-1,-1),4),('VALIGN',(0,0),(-1,-1),'TOP')]))
        story.append(KeepTogether([card, Spacer(1, 3)]))
    OUT.parent.mkdir(parents=True, exist_ok=True)
    doc.build(story, onFirstPage=on_page, onLaterPages=on_page)
    print(f'Generated {OUT} ({len(items)} items)')


if __name__ == '__main__':
    build()
