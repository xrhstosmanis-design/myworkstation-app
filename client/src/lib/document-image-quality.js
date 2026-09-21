const IMAGE_TYPES=/^image\/(jpeg|png|webp)$/i;

export class DocumentImageQualityError extends Error{
  constructor(message,code="IMAGE_QUALITY"){super(message);this.name="DocumentImageQualityError";this.code=code}
}

const canvasBlob=(canvas,type="image/jpeg",quality=.94)=>new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error("Δεν δημιουργήθηκε η καθαρισμένη εικόνα.")),type,quality));

async function decode(file){
  if(typeof createImageBitmap==="function")return createImageBitmap(file,{imageOrientation:"from-image"});
  const url=URL.createObjectURL(file);
  try{return await new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>resolve(image);image.onerror=()=>reject(new Error("Δεν διαβάστηκε η φωτογραφία."));image.src=url})}
  finally{URL.revokeObjectURL(url)}
}

function sampleGray(source,maxSide=720){
  const width=source.width||source.naturalWidth,height=source.height||source.naturalHeight,scale=Math.min(1,maxSide/Math.max(width,height));
  const canvas=document.createElement("canvas");canvas.width=Math.max(1,Math.round(width*scale));canvas.height=Math.max(1,Math.round(height*scale));
  const ctx=canvas.getContext("2d",{willReadFrequently:true});ctx.drawImage(source,0,0,canvas.width,canvas.height);
  const rgba=ctx.getImageData(0,0,canvas.width,canvas.height).data,gray=new Uint8Array(canvas.width*canvas.height);
  for(let i=0,j=0;i<rgba.length;i+=4,j++)gray[j]=Math.round(rgba[i]*.299+rgba[i+1]*.587+rgba[i+2]*.114);
  return {gray,width:canvas.width,height:canvas.height};
}

export function measureDocumentSharpness({gray,width,height}){
  let sum=0,sum2=0,count=0;
  for(let y=1;y<height-1;y+=2)for(let x=1;x<width-1;x+=2){const i=y*width+x,v=gray[i-1]+gray[i+1]+gray[i-width]+gray[i+width]-4*gray[i];sum+=v;sum2+=v*v;count++}
  return count?sum2/count-(sum/count)**2:0;
}

function detectPaperBounds({gray,width,height}){
  const values=[];for(let i=0;i<gray.length;i+=17)values.push(gray[i]);values.sort((a,b)=>a-b);
  const bright=values[Math.floor(values.length*.68)]||190,threshold=Math.max(145,Math.min(225,bright-8));
  let left=width,top=height,right=0,bottom=0,hits=0;
  for(let y=0;y<height;y+=2)for(let x=0;x<width;x+=2){if(gray[y*width+x]<threshold)continue;left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);hits++}
  const area=Math.max(0,right-left)*Math.max(0,bottom-top),coverage=area/(width*height),density=hits/Math.max(1,(area/4));
  if(coverage<.38||coverage>.985||density<.42)return null;
  const pad=Math.round(Math.min(width,height)*.012);
  return {left:Math.max(0,left-pad),top:Math.max(0,top-pad),right:Math.min(width-1,right+pad),bottom:Math.min(height-1,bottom+pad)};
}

function projectionScore(gray,width,height,angle){
  const radians=angle*Math.PI/180,cos=Math.cos(radians),sin=Math.sin(radians),cx=width/2,cy=height/2,rows=new Float64Array(height),counts=new Uint32Array(height);
  for(let y=2;y<height-2;y+=3)for(let x=2;x<width-2;x+=3){const i=y*width+x,edge=Math.abs(gray[i-width]-gray[i+width]);if(edge<22)continue;const ry=Math.round((x-cx)*sin+(y-cy)*cos+cy);if(ry>=0&&ry<height){rows[ry]+=edge;counts[ry]++}}
  let sum=0,sum2=0,n=0;for(let y=0;y<height;y++){if(!counts[y])continue;const value=rows[y]/counts[y];sum+=value;sum2+=value*value;n++}return n?sum2/n-(sum/n)**2:0;
}

function estimateSkew(sample){
  let bestAngle=0,bestScore=-1;
  for(let angle=-5;angle<=5;angle+=.5){const score=projectionScore(sample.gray,sample.width,sample.height,angle);if(score>bestScore){bestScore=score;bestAngle=angle}}
  return Math.abs(bestAngle)<.45?0:bestAngle;
}

function rotateAndCrop(source,sample,angle,maxSide){
  const sourceWidth=source.width||source.naturalWidth,sourceHeight=source.height||source.naturalHeight,bounds=detectPaperBounds(sample),sx=sourceWidth/sample.width,sy=sourceHeight/sample.height;
  const crop=bounds?{x:Math.round(bounds.left*sx),y:Math.round(bounds.top*sy),width:Math.round((bounds.right-bounds.left+1)*sx),height:Math.round((bounds.bottom-bounds.top+1)*sy)}:{x:0,y:0,width:sourceWidth,height:sourceHeight};
  const scale=Math.min(1,maxSide/Math.max(crop.width,crop.height)),w=Math.max(1,Math.round(crop.width*scale)),h=Math.max(1,Math.round(crop.height*scale));
  const canvas=document.createElement("canvas");canvas.width=w;canvas.height=h;const ctx=canvas.getContext("2d",{willReadFrequently:true});
  ctx.fillStyle="#fff";ctx.fillRect(0,0,w,h);ctx.translate(w/2,h/2);ctx.rotate(angle*Math.PI/180);ctx.drawImage(source,crop.x,crop.y,crop.width,crop.height,-w/2,-h/2,w,h);
  return {canvas,cropped:Boolean(bounds),deskewed:Boolean(angle)};
}

function normalizeShadows(canvas){
  const ctx=canvas.getContext("2d",{willReadFrequently:true}),original=ctx.getImageData(0,0,canvas.width,canvas.height),background=document.createElement("canvas");background.width=canvas.width;background.height=canvas.height;
  const bg=background.getContext("2d",{willReadFrequently:true});bg.filter=`grayscale(1) blur(${Math.max(12,Math.round(Math.min(canvas.width,canvas.height)/45))}px)`;bg.drawImage(canvas,0,0);
  const shade=bg.getImageData(0,0,canvas.width,canvas.height).data,data=original.data;
  for(let i=0;i<data.length;i+=4){const gray=data[i]*.299+data[i+1]*.587+data[i+2]*.114,local=shade[i],value=Math.max(0,Math.min(255,238+(gray-local)*1.65));data[i]=data[i+1]=data[i+2]=value}
  ctx.putImageData(original,0,0);return canvas;
}

export async function prepareDocumentImage(file,{strict=true,maxSide=3000,enhance=true}={}){
  if(!file||!IMAGE_TYPES.test(file.type||""))return {file,quality:null,changed:false};
  const image=await decode(file),width=image.width||image.naturalWidth,height=image.height||image.naturalHeight;
  if(width<900||height<550)throw new DocumentImageQualityError("Η ανάλυση είναι χαμηλή. Φωτογράφισε ολόκληρο το παραστατικό από πιο κοντά.","LOW_RESOLUTION");
  const sample=sampleGray(image),sharpness=measureDocumentSharpness(sample);
  if(strict&&sharpness<42)throw new DocumentImageQualityError("Η φωτογραφία είναι θολή και δεν θα σταλεί. Κράτησε σταθερά την κάμερα και φωτογράφισε ξανά.","BLURRY");
  const angle=estimateSkew(sample),prepared=rotateAndCrop(image,sample,angle,maxSide);if(enhance)normalizeShadows(prepared.canvas);
  const blob=await canvasBlob(prepared.canvas,"image/jpeg",.94),name=(file.name||"parastatiko").replace(/\.[^.]+$/,"")+"-clean.jpg";
  image.close?.();
  return {file:new File([blob],name,{type:"image/jpeg",lastModified:Date.now()}),quality:{sharpness:Math.round(sharpness),cropped:prepared.cropped,deskewed:prepared.deskewed,enhanced:enhance},changed:true};
}

export async function prepareDocumentFile(file,options){return file?.type?.startsWith("image/")?prepareDocumentImage(file,options):{file,quality:null,changed:false}}
