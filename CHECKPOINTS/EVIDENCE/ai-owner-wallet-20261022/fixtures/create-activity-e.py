from pathlib import Path
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import A4
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
pdfmetrics.registerFont(TTFont("LAB","/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"))
pdfmetrics.registerFont(TTFont("LAB-Bold","/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"))

dest=Path(__file__).with_name('activity-lab-20261031-e.pdf')
c=canvas.Canvas(str(dest),pagesize=A4)
c.setTitle('ACTIVITY-LAB-20261031-E - synthetic caller attribution test')
c.setFont('LAB-Bold',15)
c.drawString(35,800,'SYNTHETIC LAB TEST - NOT A REAL INVOICE')
c.setFont('LAB',13)
for y,text in [(763,'Supplier: LAB METER TEST'),(740,'Customer: MYWORKSTATION LAB'),(717,'Invoice number: ACTIVITY-LAB-20261031-E'),(694,'Date: 31/10/2026'),(671,'Page: 1/1')]:c.drawString(35,y,text)
c.setFont('LAB-Bold',11)
for x,text in [(35,'CODE'),(110,'DESCRIPTION'),(295,'QTY'),(350,'UNIT EUR'),(430,'NET EUR'),(515,'VAT')]:c.drawString(x,610,text)
c.line(35,598,560,598)
c.setFont('LAB',11)
for x,text in [(35,'SYN-E1'),(110,'Synthetic activity test'),(295,'1'),(350,'12.00'),(430,'12.00'),(515,'0%')]:c.drawString(x,575,text)
c.line(35,555,560,555)
c.setFont('LAB',15)
c.drawString(330,500,'Net total: EUR 12.00')
c.drawString(330,470,'VAT total: EUR 0.00')
c.setFont('LAB-Bold',20);c.drawString(300,420,'TOTAL: EUR 12.00')
c.setFont('LAB',11)
for y,text in [(320,'One item, quantity 1 PIECE. No discount, no excise, no packaging conversion.'),(295,'For diagnostic preview only. No payment, posting, approval or stock update.'),(270,'This document has no legal or fiscal validity.')]:c.drawString(35,y,text)
c.save();print(dest)
