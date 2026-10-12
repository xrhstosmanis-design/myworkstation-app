import test from "node:test";
import assert from "node:assert/strict";
import XLSX from "xlsx";
import JSZip from "jszip";
import {issueAssistantExportTicket,readAssistantExportTicket} from "../src/services/assistant-export-ticket.js";
import {createAssistantExportHandler} from "../src/services/assistant-export-handler.js";
import {buildAssistantReportFile} from "../src/services/assistant-report-files.js";
import {assistantReportTables} from "../src/services/assistant-report-table.js";
const req=()=>({user:{id:"actor",sessionId:"session",sessionVersion:3}}),selection={companyId:"c",storeId:"s"},secret="isolated-fixture-secret",reads=[{name:"stock_by_product",args:{product:"ΝΕΡΟ"}}];
const source=()=>({kind:"product_stock",scope:"PLATFORM_SELECTED_STORE",...selection,storeName:"Κατάστημα",source:"Ανάλυση αποθήκης",result:"matched",rows:[{name:"=HYPERLINK(\"bad\")",sku:"2269",currentStock:-70,unit:"PIECE",costPrice:999,password:"PRIVATE"}]});
test("export ticket is purpose, actor, session, version, expiry and strict source bound; cash day is frozen",()=>{
 const options={secret,now:1000,selection},ticket=issueAssistantExportTicket(req(),reads,[source()],options);
 assert.deepEqual(readAssistantExportTicket(req(),ticket,{secret,now:2000}).reads,reads);
 for(const user of [{id:"other"},{sessionId:"other"},{sessionVersion:4}])assert.throws(()=>readAssistantExportTicket({user:{...req().user,...user}},ticket,{secret,now:2000}));
 for(const t of [ticket.slice(0,-1)+"x",ticket+".x","fixture",null])assert.throws(()=>readAssistantExportTicket(req(),t,{secret,now:2000}));
 assert.throws(()=>readAssistantExportTicket(req(),ticket,{secret,now:301000}));
 assert.throws(()=>issueAssistantExportTicket(req(),[{...reads[0],args:{product:"ΝΕΡΟ",storeId:"foreign"}}],[source()],options));
 const cash=issueAssistantExportTicket(req(),[{name:"cash_details",args:{date:null}}],[{date:"2026-10-10"}],options);
 assert.equal(readAssistantExportTicket(req(),cash,{secret,now:2000}).reads[0].args.date,"2026-10-10");
});
test("export rereads canonical source and verifies again after generation; revoked role never receives a file",async()=>{
 const ticket=issueAssistantExportTicket(req(),reads,[source()],{secret,selection}),calls=[];
 const fixture={...req(),body:{ticket,format:"csv"}},res={json:value=>calls.push(["response",value])};
 const handler=createAssistantExportHandler({secret:()=>secret,authorize:async()=>calls.push(["authorize"]),createSession:async(r,p,o)=>{assert.deepEqual(p,selection);return {scope:selection,replay:async requested=>{assert.deepEqual(requested,reads);calls.push(["read"]);return [source()]},verify:async()=>calls.push(["verify"])}},buildFile:async(format,evidence)=>{calls.push(["build"]);assert.equal(evidence[0].rows[0].currentStock,-70);return {filename:"fixture"}}});
 let error;await handler(fixture,res,e=>error=e);assert.equal(error,undefined);assert.deepEqual(calls.map(x=>x[0]),["authorize","read","build","verify","response"]);
 for(const after of [false,true]){let sent=false,built=false;const denied=Object.assign(new Error("Revoked"),{status:403});
  const h=createAssistantExportHandler({secret:()=>secret,authorize:async()=>{if(!after)throw denied},createSession:async()=>({replay:async()=>[source()],verify:async()=>{throw denied}}),buildFile:async()=>{built=true;return {} }});
  await h(fixture,{json:()=>sent=true},e=>error=e);assert.equal(sent,false);assert.equal(built,after);assert.equal(error,denied);
 }
 await handler({...fixture,body:{...fixture.body,rows:[]}},res,e=>error=e);assert.equal(error.name,"ZodError");
});
test("four actual file formats preserve canonical negative stock and Greek text without private fields or spreadsheet formulas",async()=>{
 const report=source(),now=new Date("2026-10-12T17:00:00Z"),files={};
 for(const format of ["xlsx","csv","pdf","docx"]){const file=await buildAssistantReportFile(format,[report],{now});assert.match(file.filename,new RegExp(`^myworkstation-report-20261012200000\\.${format}$`));files[format]=Buffer.from(file.base64,"base64");assert.equal(files[format].length,file.size)}
 const workbook=XLSX.read(files.xlsx,{type:"buffer"}),sheet=workbook.Sheets[workbook.SheetNames[0]],rows=XLSX.utils.sheet_to_json(sheet,{header:1});
 assert.ok(rows.some(r=>r.includes(-70)));assert.ok(rows.some(r=>r.includes("'=HYPERLINK(\"bad\")")));for(const value of Object.values(sheet))assert.equal(value?.f,undefined);
 const csv=files.csv.toString("utf8");assert.equal(csv[0],"\uFEFF");assert.match(csv,/"-70"/);assert.match(csv,/'=HYPERLINK/);assert.doesNotMatch(csv,/PRIVATE|costPrice|999/);
 assert.equal(files.pdf.subarray(0,5).toString(),"%PDF-");const {getDocument}=await import("pdfjs-dist/legacy/build/pdf.mjs"),pdf=await getDocument({data:new Uint8Array(files.pdf),disableFontFace:true}).promise;try{const text=(await (await pdf.getPage(1)).getTextContent()).items.map(x=>x.str).join(" ");assert.match(text,/Κατάστημα/);assert.match(text,/-70/);assert.doesNotMatch(text,/PRIVATE|costPrice|999/)}finally{await pdf.destroy()}
 const zip=await JSZip.loadAsync(files.docx),xml=await zip.file("word/document.xml").async("string");assert.match(xml,/Κατάστημα/);assert.match(xml,/>-70</);assert.match(xml,/tblHeader/);assert.doesNotMatch(xml,/PRIVATE|costPrice|999|w:hyperlink/);
 const limited=assistantReportTables([{...report,result:"source_limited",truncated:true,rows:[]}]);assert.equal(limited[0].rows.length,0);assert.match(limited[0].notes.join(" "),/πλήρες σύνολο/);
 await assert.rejects(buildAssistantReportFile("exe",[report]));await assert.rejects(buildAssistantReportFile("xlsx",[]));
});
