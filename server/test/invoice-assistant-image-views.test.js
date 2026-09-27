import test from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import {invoiceAssistantImageViews} from "../src/lib/invoice-assistant-image-views.js";

test("one page produces a full view and overlapping upper, middle and lower table bands",async()=>{
  const original=await sharp({create:{width:900,height:1600,channels:3,background:"white"}}).jpeg().toBuffer();
  const dataUrl=`data:image/jpeg;base64,${original.toString("base64")}`;
  const content=await invoiceAssistantImageViews([{filename:"invoice.jpg",mimeType:"image/jpeg",contentData:dataUrl}]);
  assert.deepEqual(content.map(item=>item.type),["input_text","input_image","input_text","input_image","input_text","input_image","input_text","input_image"]);
  const full=Buffer.from(content[1].image_url.split(",")[1],"base64");
  assert.equal((await sharp(full).metadata()).height,1600);
  for(const index of [3,5,7]){
    const table=Buffer.from(content[index].image_url.split(",")[1],"base64");
    assert.equal((await sharp(table).metadata()).width,1600);
  }
  assert.match(content[0].text,/κάθε φυσική γραμμή μόνο μία φορά/);
  assert.equal(dataUrl,`data:image/jpeg;base64,${original.toString("base64")}`);
});
