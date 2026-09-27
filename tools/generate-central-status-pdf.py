#!/usr/bin/env python3
"""One-page central status snapshot; update the dated evidence before regenerating."""
from pathlib import Path
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import SimpleDocTemplate, Paragraph, Table, TableStyle, Spacer

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'output/pdf/MyWorkStation_Central_Status_2026-09-27.pdf'
pdfmetrics.registerFont(TTFont('MWS','/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'))
pdfmetrics.registerFont(TTFont('MWS-Bold','/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'))
navy=colors.HexColor('#102844');blue=colors.HexColor('#1569A8');gray=colors.HexColor('#536477')
title=ParagraphStyle('title',fontName='MWS-Bold',fontSize=16,leading=21,textColor=navy,spaceAfter=7)
sub=ParagraphStyle('sub',fontName='MWS',fontSize=9,leading=13,textColor=gray,spaceAfter=12)
head=ParagraphStyle('head',fontName='MWS-Bold',fontSize=10,leading=14,textColor=blue,spaceBefore=9,spaceAfter=4)
body=ParagraphStyle('body',fontName='MWS',fontSize=8.2,leading=12,textColor=navy,spaceAfter=4)
cell=ParagraphStyle('cell',fontName='MWS',fontSize=8.1,leading=11,textColor=navy)
cellbold=ParagraphStyle('cellbold',parent=cell,fontName='MWS-Bold')
def p(text,style=body):return Paragraph(text,style)

story=[p('MYWORKSTATION - ΚΕΝΤΡΙΚΗ ΚΑΤΑΣΤΑΣΗ',title),p('27/09/2026 · LAB-first πρόοδος και ενεργές αναθέσεις',sub),p('Gate 1-8',head)]
rows=[[p('Gate',cellbold),p('Αντικείμενο',cellbold),p('Κατάσταση',cellbold)]]
for gate,subject,status in [('1','Προϊόντα / εισαγωγή','PASS'),('2','Αποθήκη / κινήσεις','PASS'),('3','Τιμολόγια / OCR','OPEN - ειδική σελίδα'),('4','POS / πληρωμές','PASS'),('6','Online παραγγελίες / delivery','PASS'),('7','Αναφορές / στατιστικά','PASS'),('8','Ρόλοι / ασφάλεια','PASS')]:
    rows.append([p(gate,cell),p(subject,cell),p(status,cell)])
t=Table(rows,colWidths=[25*mm,90*mm,61*mm],hAlign='LEFT')
t.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,0),colors.HexColor('#E8F1F8')),('ROWBACKGROUNDS',(0,1),(-1,-1),[colors.white,colors.HexColor('#F7F9FB')]),('BOTTOMPADDING',(0,0),(-1,-1),4),('TOPPADDING',(0,0),(-1,-1),4),('LINEBELOW',(0,0),(-1,0),.6,blue)]))
story += [t,p('TABLE_SERVICE - περιορισμένα LAB PASS',head),p('Κάτοψη: ΤΡΑΠΕΖΙ LAB 1, θέση 41% / 24% μετά από ανανέωση, Audit 22:13. Φυσικό Android/Chrome 23:41: προσωπικό PIN LAB POS 2, μία αποστολή Γύρου 3 με 1× LAB καφέ και ΓΑΛΑ ΧΩΡΙΣ ΛΑΚΤΟΖΗ, 2,00 → 3,00 €. Πόστο ΚΑΦΕ σωστό, ΕΤΟΙΜΗ και ενεργή ουρά 1→0.'),p('Ακεραιότητα: χωρίς Sale/Payment, MAIN 0,00 €/0, LAB-POS-02 0,00 €/2 και stock καφέ −2 αμετάβλητα. Το κεντρικό Audit εμφάνισε PIN login, όχι χωριστό event γύρου. PWA εγκατάσταση/offline, cross-store, transfer/merge/split, πλήρες KDS και συνολικό TABLE_SERVICE OPEN.'),p('Ενεργές αναθέσεις',head),p('• TABLE_SERVICE: δεσμευμένη σελίδα · Gate 3: ειδική σελίδα τιμολογίων · efood/Pelican: σελίδα διασύνδεσης.'),p('Ετικέτα EAN-13 - PASS',head),p('USER PASS φυσικής εκτύπωσης / σάρωσης και LAB PASS προεπισκόπησης, Audit και αποκλεισμού άκυρου EAN. Στο δεύτερο LAB κατάστημα αποθηκεύτηκαν και ξαναδιαβάστηκαν 50 × 30 mm με δικό του εκτυπωτή· το αρχικό LAB έμεινε 60 × 40 mm. Exact Render 3895e89a.'),p('HTTP E2E CI #3690: χειριστής PIN διαβάζει δικό του κατάστημα 200, δεύτερο ίδιας εταιρείας 403 και άλλη εταιρεία 403, χωρίς διαρροή. Το ΚΑΤ δεν άλλαξε. Παραγωγικό αίτημα API με LAB token προς άλλο κατάστημα δεν εκτελέστηκε.'),p('Κανόνας',head),p('Κάθε νέο σκέλος: κώδικας → πράσινο CI → merge → exact deploy → πραγματικό LAB → checkpoint, manual, roadmap και PDF. Το CI μόνο του δεν αποτελεί LAB PASS.')]
doc=SimpleDocTemplate(str(OUT),pagesize=A4,leftMargin=17*mm,rightMargin=17*mm,topMargin=14*mm,bottomMargin=13*mm,title='MyWorkStation - Κεντρική κατάσταση 27/09/2026')
doc.build(story)
print(OUT)
