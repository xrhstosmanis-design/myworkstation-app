import test from "node:test";
import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {greeceRangeDate,greeceMonthStart,greeceExportValue,greeceExportRows} from "../../shared/greece-time.mjs";
test("Greek report bounds include the full local day and handle DST lengths",()=>{
 assert.equal(greeceRangeDate("2026-10-12").toISOString(),"2026-10-11T21:00:00.000Z");
 assert.equal(greeceRangeDate("2026-10-12",true).toISOString(),"2026-10-12T20:59:59.999Z");
 assert.equal(greeceRangeDate("2026-03-29",true)-greeceRangeDate("2026-03-29")+1,23*3600000);
 assert.equal(greeceRangeDate("2026-10-25",true)-greeceRangeDate("2026-10-25")+1,25*3600000);
 assert.equal(greeceMonthStart(new Date("2026-09-30T21:15:00Z")).toISOString(),"2026-09-30T21:00:00.000Z");
});
test("Greek wall times and offset-qualified instants are distinct and invalid clocks fail",()=>{
 assert.equal(greeceRangeDate("2026-10-12T20:22").toISOString(),"2026-10-12T17:22:00.000Z");
 assert.equal(greeceRangeDate("2026-10-12T20:22:00+03:00").toISOString(),"2026-10-12T17:22:00.000Z");
 assert.throws(()=>greeceRangeDate("2026-03-29T03:30"),/δεν υπάρχει/);
 assert.throws(()=>greeceRangeDate("2026-10-25T03:30"),/δύο φορές/);
 assert.throws(()=>greeceRangeDate("12/10/2026 8 pm"),/Μη έγκυρη/);
});
test("CSV Excel export uses Greek 24 hour values without mutating original rows or date-only invoice fields",()=>{
 const rows=[{createdAt:"2026-10-12T17:22:00Z",documentDate:"2026-10-12",amount:400,note:"03:00 old record"}];
 const before=JSON.stringify(rows),out=greeceExportRows(rows);
 assert.equal(out[0].createdAt,"2026-10-12 20:22:00 Europe/Athens");
 assert.equal(out[0].documentDate,"2026-10-12");assert.equal(out[0].amount,400);
 assert.equal(out[0].note,rows[0].note);assert.equal(JSON.stringify(rows),before);
 assert.equal(greeceExportValue("2026-12-12T17:22:00Z"),"2026-12-12 19:22:00 Europe/Athens");
});
test("input range export and midnight calendar are independent of machine timezone",()=>{
 const script='import {greeceRangeDate,greeceMonthStart,greeceExportValue} from "./shared/greece-time.mjs"; console.log(JSON.stringify([greeceRangeDate("2026-10-12T20:22").toISOString(),greeceMonthStart(new Date("2026-09-30T21:15:00Z")).toISOString(),greeceExportValue("2026-10-12T17:22:00Z")]));';
 const results=["UTC","America/Los_Angeles","Asia/Tokyo","Europe/Athens"].map(TZ=>execFileSync(process.execPath,["--input-type=module","-e",script],{cwd:new URL("../../",import.meta.url),env:{...process.env,TZ},encoding:"utf8"}).trim());
 assert.equal(new Set(results).size,1);
});

test("all application clock display calls declare 24-hour Greek formatting",async()=>{
 const {readdir,readFile}=await import("node:fs/promises");
 const roots=["client/src","server/src","shared"],violations=[];
 async function scan(dir){
  for(const entry of await readdir(dir,{withFileTypes:true})){
   const path=dir+"/"+entry.name;if(entry.isDirectory()){await scan(path);continue}
   if(!/\.(js|jsx|mjs|ts|tsx)$/.test(path))continue;
   const source=await readFile(path,"utf8");
   for(const match of source.matchAll(/(?:\.toLocale(?:String|TimeString)|new Intl\.DateTimeFormat)\s*\(/g)){
    let end=match.index+match[0].length,depth=1,quote="",escaped=false;
    for(;end<source.length;end++){const char=source[end];if(quote){if(escaped)escaped=false;else if(char==="\\")escaped=true;else if(char===quote)quote=""}else if(/["'`]/.test(char))quote=char;else if(char==="(")depth++;else if(char===")"&&!--depth)break}
    const call=source.slice(match.index,end+1),clock=/TimeString/.test(call)||(/DateTimeFormat/.test(call)&&/hour\s*:|timeStyle\s*:/.test(call))||(/toLocaleString/.test(call)&&/Europe\/Athens/.test(call));
    if(!clock)continue;
    if(!/Europe\/Athens|GREECE_TIME_ZONE|ATHENS_TZ|timeZone:\s*zone|config\.timezone/.test(call)||!/hour12\s*:\s*false|hourCycle\s*:\s*["']h23/.test(call))violations.push(path+":"+source.slice(0,match.index).split("\n").length+" "+call);
   }
  }
 }
 const root=new URL("../../",import.meta.url).pathname;
 for(const dir of roots)await scan(root+dir);
 assert.deepEqual(violations,[]);
});
