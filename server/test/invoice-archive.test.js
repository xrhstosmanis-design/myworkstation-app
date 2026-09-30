import assert from "node:assert/strict";
import test from "node:test";
import {readFile} from "node:fs/promises";
import * as XLSX from "xlsx";
import {archiveQuery,archiveExportRows,archiveReportHtml} from "../src/invoice-archive.js";

test("archive binds tenant, filters and paging without interpolating user SQL",()=>{
  const q=archiveQuery("company-one","store-one",{q:"135848'; DROP TABLE",supplier:"ΣΙΓΜΑ",date:"2026-09-28",offset:300});
  assert.match(q.sql,/i\."companyId"=\$1 AND i\."storeId"=\$2/);
  assert.match(q.sql,/m\."companyId"=i\."companyId" AND m\."storeId"=i\."storeId"/);
  assert.equal(q.sql.includes("DROP TABLE"),false);
  assert.deepEqual(q.values.slice(0,4),["company-one","store-one","ΣΙΓΜΑ","2026-09-28"]);
  assert.deepEqual(q.values.slice(-2),[100,300]);
  assert.match(q.sql,/m\."issueDate"/);
  assert.match(q.sql,/ORDER BY.*i\."id" DESC/);
});

test("actual archive handler exports all 5269 results, paginates and denies foreign store/operator",async()=>{
  const source=await readFile(new URL("../src/routes/commerce-mydata-inbox.js",import.meta.url),"utf8"),routes=new Map();
  const rows=Array.from({length:5269},(_,i)=>({id:`inbox-${i}`,receivedAt:"2026-09-30T18:00:00Z",issueDate:"2026-09-28",mark:String(400000000000000+i),documentNumber:String(i),issuerVat:"099999999",totalGross:"75.14",status:"RECEIVED",hasAttachment:false}));
  const prisma={store:{async findFirst({where}){return where.companyId==="company-one"&&where.id==="store-one"?{id:where.id,name:"Store One"}:null}},async $executeRawUnsafe(){},async $queryRaw(){return [{name:"Supplier One"}]},async $queryRawUnsafe(sql,...values){assert.deepEqual(values.slice(0,2),["company-one","store-one"]);if(sql.includes("COUNT(*)"))return [{count:rows.length}];return rows.slice(values.at(-1),values.at(-1)+values.at(-2))}};
  globalThis.__archiveTest={prisma,XLSX,archiveQuery,archiveExportRows,archiveReportHtml,Router:()=>({get(path,...handlers){routes.set(path,handlers.at(-1))},post(){}})};
  const injected=`import crypto from "node:crypto";const {prisma,XLSX,archiveQuery,archiveExportRows,archiveReportHtml,Router}=globalThis.__archiveTest;const requireCompanyModule=()=>()=>{};`;
  try{await import(`data:text/javascript;base64,${Buffer.from(injected+source.replace(/^import .*;\r?\n/gm,"")).toString("base64")}`)}finally{delete globalThis.__archiveTest}
  const handler=routes.get("/documents/inbox/archive");
  const run=async(query={},user={companyId:"company-one",role:"OWNER"})=>{let data,status=200,error;await handler({query:{storeId:"store-one",...query},user},{status(n){status=n;return this},json(x){data=x}},e=>{error=e});assert.ifError(error);return {data,status}};
  const page=await run({offset:"300"});assert.equal(page.data.items.length,100);assert.equal(page.data.items[0].id,"inbox-300");assert.equal(page.data.total,5269);
  const excel=await run({format:"xlsx",offset:"300"});assert.equal(excel.data.count,5269);
  const workbook=XLSX.read(Buffer.from(excel.data.dataUrl.split(",")[1],"base64"),{type:"buffer"});
  const exported=XLSX.utils.sheet_to_json(workbook.Sheets["Παραστατικά"]);assert.equal(exported.length,5269);assert.equal(exported[5268].MARK,rows[5268].mark);assert.equal(exported[0]["Σύνολο"],75.14);
  const pdf=await run({format:"pdf"});assert.equal(pdf.data.count,5269);assert.match(pdf.data.html,/δεν είναι πρωτότυπα PDF/);
  assert.equal((await run({storeId:"foreign-store"})).status,404);
  assert.equal((await run({}, {companyId:"company-one",role:"OWNER",tokenType:"STORE_OPERATOR"})).status,403);
});
test("full count has same filters and no LIMIT; search handles Greek accents and literal wildcard characters",()=>{
  const q=archiveQuery("c","s",{q:"Γάλα ς %_"},true);
  assert.deepEqual(q.values,["c","s","γαλα","σ","%_"]);
  assert.match(q.sql,/COUNT\(\*\)/);assert.equal(q.sql.includes("LIMIT"),false);
  assert.throws(()=>archiveQuery("c","s",{date:"not-a-date"}),/ημερομηνία/);
});
test("report preserves MARK as text, numeric amounts and original document distinction",()=>{
  const rows=[{receivedAt:"2026-09-30T18:00:00Z",issueDate:"2026-09-28",mark:"400015448413446",issuerVat:"099999999",documentNumber:"135848",supplierName:'<script>alert(1)</script>',totalNet:"60.60",totalVat:"14.54",totalGross:"75.14",status:"RECEIVED",hasAttachment:false}];
  const exported=archiveExportRows(rows)[0];
  assert.equal(exported.MARK,"400015448413446");assert.equal(exported["Σύνολο"],75.14);
  assert.equal(exported["Ημερομηνία"],"2026-09-28");assert.match(exported["Κατάσταση"],/προς έλεγχο/);
  assert.equal(exported["Πρωτότυπο αρχείο"],"Δεν έχει επισυναφθεί");
  const html=archiveReportHtml(rows,'<img onerror="bad">');
  assert.equal(html.includes("<script>"),false);assert.equal(html.includes('<img onerror'),false);
  assert.match(html,/&lt;script&gt;/);assert.match(html,/δεν είναι πρωτότυπα PDF/);assert.match(html,/window.print\(\)/);
});
