import {greeceDateTimeInput,greeceExportValue} from "../../../shared/greece-time.mjs";
import PDFDocument from "pdfkit";
import {Document,Packer,Paragraph,Table,TableRow,TableCell,WidthType,PageOrientation,TextRun} from "docx";
import XLSX from "xlsx";
import {fileURLToPath} from "node:url";
import {assistantReportTables,spreadsheetSafeText} from "./assistant-report-table.js";
const formats={xlsx:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",csv:"text/csv;charset=utf-8",pdf:"application/pdf",docx:"application/vnd.openxmlformats-officedocument.wordprocessingml.document"};
const cell=(value,column)=>value===null||value===undefined?"Μη καταγεγραμμένο":typeof value==="number"?value.toLocaleString("el-GR",column.includes("€")?{minimumFractionDigits:2,maximumFractionDigits:2}:{maximumFractionDigits:20}):String(greeceExportValue(value));
function workbook(tables){
 const book=XLSX.utils.book_new();
 for(const t of tables){const top=[["MyWorkStation"],[t.title],...t.notes.map(n=>[spreadsheetSafeText(n)]),[],t.columns],data=[...top,...t.rows.map(r=>r.map(v=>typeof v==="number"?v:v===null||v===undefined?"Μη καταγεγραμμένο":spreadsheetSafeText(greeceExportValue(v))))],sheet=XLSX.utils.aoa_to_sheet(data);
  sheet["!cols"]=t.columns.map(c=>({wch:c.includes("Είδος")||c.includes("Κατάστημα")?30:22}));sheet["!merges"]=top.slice(0,-2).map((_,r)=>({s:{r,c:0},e:{r,c:t.columns.length-1}}));
  for(let row=top.length;row<data.length;row++)for(let col=0;col<t.columns.length;col++){const c=sheet[XLSX.utils.encode_cell({r:row,c:col})];if(c?.t==="n")c.z=t.columns[col].includes("€")?"#,##0.00":"0.###############";}
  XLSX.utils.book_append_sheet(book,sheet,t.sheet);
 }
 return XLSX.write(book,{type:"buffer",bookType:"xlsx"});
}
function csv(tables){
 const columns=["Αναφορά","Σημείωση",...new Set(tables.flatMap(t=>t.columns))],rows=[columns];
 for(const t of tables){rows.push([t.title,t.notes.join("\n"),...columns.slice(2).map(()=>"")]);for(const row of t.rows)rows.push([t.title,"",...columns.slice(2).map(c=>{const i=t.columns.indexOf(c);return i<0?"":typeof row[i]==="number"?{number:cell(row[i],c)}:cell(row[i],c)})]);}
 const quote=v=>'"'+(v&&typeof v==="object"&&Object.hasOwn(v,"number")?v.number:spreadsheetSafeText(v)).replaceAll('"','""')+'"';return Buffer.from("\uFEFF"+rows.map(r=>r.map(quote).join(";")).join("\r\n"),"utf8");
}
async function pdf(tables){
 const doc=new PDFDocument({size:"A4",layout:"landscape",margin:32,bufferPages:true,info:{Title:"Αναφορά MyWorkStation",Author:"MyWorkStation"}}),chunks=[];
 const complete=new Promise((resolve,reject)=>{doc.on("data",c=>chunks.push(c));doc.on("end",()=>resolve(Buffer.concat(chunks)));doc.on("error",reject)});
 doc.font(fileURLToPath(new URL("../../assets/fonts/DejaVuSans.ttf",import.meta.url)));
 const bottom=()=>doc.page.height-42,width=()=>doc.page.width-64;
 for(const [section,t] of tables.entries()){
  if(section)doc.addPage();doc.fontSize(18).fillColor("#12304d").text("MyWorkStation");doc.fontSize(13).text(t.title);doc.moveDown(.4);
  for(const note of t.notes)doc.fontSize(8).fillColor("#526477").text(note,{width:width()});doc.moveDown(.6);
  const w=width()/t.columns.length;
  const rowHeight=values=>Math.max(...values.map(v=>doc.fontSize(8).heightOfString(String(v),{width:w-10,lineGap:1})),10)+12;
  const draw=(values,header=false)=>{const h=rowHeight(values),y=doc.y;if(header)doc.rect(32,y,width(),h).fill("#12304d");for(const [i,v] of values.entries())doc.fillColor(header?"#ffffff":"#172b3a").fontSize(8).text(String(v),37+i*w,y+6,{width:w-10,height:h-10,lineGap:1});doc.moveTo(32,y+h).lineTo(32+width(),y+h).strokeColor("#d8e1e9").stroke();doc.y=y+h;};
  const header=()=>{if(doc.y+rowHeight(t.columns)>bottom()){doc.addPage();doc.fontSize(11).fillColor("#12304d").text(t.title);doc.moveDown(.5)}draw(t.columns,true)};
  header();if(!t.rows.length)doc.fontSize(9).fillColor("#526477").text("Δεν υπάρχουν γραμμές προς εξαγωγή· δες την κατάσταση και τους περιορισμούς της πηγής.",{width:width()});
  for(const row of t.rows){const values=row.map((v,i)=>cell(v,t.columns[i]));if(doc.y+rowHeight(values)>bottom()){doc.addPage();doc.fontSize(11).fillColor("#12304d").text(t.title);doc.moveDown(.5);header()}draw(values);}
 }
 const range=doc.bufferedPageRange();for(let i=range.start;i<range.start+range.count;i++){doc.switchToPage(i);doc.page.margins.bottom=8;doc.fontSize(8).fillColor("#657789").text(`MyWorkStation · ${i+1}/${range.count}`,32,doc.page.height-24,{width:width(),align:"right",lineBreak:false});}
 doc.end();return complete;
}
async function word(tables){
 const body=[];
 for(const t of tables){body.push(new Paragraph({children:[new TextRun({text:t.title,bold:true,size:28})],spacing:{before:240,after:160}}));for(const n of t.notes)body.push(new Paragraph({text:n,spacing:{after:80}}));
  const row=(values,header=false)=>new TableRow({tableHeader:header,cantSplit:true,children:values.map((v,i)=>new TableCell({children:[new Paragraph({children:[new TextRun({text:header?String(v):cell(v,t.columns[i]),bold:header,size:18})]})]}))});
  body.push(new Table({width:{size:100,type:WidthType.PERCENTAGE},rows:[row(t.columns,true),...t.rows.map(r=>row(r))]}));if(!t.rows.length)body.push(new Paragraph("Δεν υπάρχουν γραμμές προς εξαγωγή· δες τους περιορισμούς της πηγής."));
 }
 const doc=new Document({creator:"MyWorkStation",title:"Αναφορά MyWorkStation",styles:{default:{document:{run:{font:"Calibri",size:20}}}},sections:[{properties:{page:{size:{orientation:PageOrientation.LANDSCAPE},margin:{top:720,bottom:720,left:720,right:720}}},children:body}]});return Packer.toBuffer(doc);
}
export async function buildAssistantReportFile(format,evidence,{now=new Date()}={}){
 if(!Object.hasOwn(formats,format))throw Object.assign(new Error("Επίλεξε Excel, PDF, CSV ή Word."),{status:422});
 const tables=assistantReportTables(evidence,{generatedAt:now}),buffer=await(format==="xlsx"?workbook(tables):format==="csv"?csv(tables):format==="pdf"?pdf(tables):word(tables));
 if(buffer.length>10*1024*1024)throw Object.assign(new Error("Το αρχείο ξεπερνά το όριο ασφαλούς εξαγωγής. Ζήτησε μικρότερη αναφορά."),{status:422});
 return {filename:`myworkstation-report-${greeceDateTimeInput(now,true).replace(/[^0-9]/g,"")}.${format}`,mimeType:formats[format],size:buffer.length,base64:buffer.toString("base64"),generatedAt:now.toISOString(),readOnly:true};
}
