import crypto from 'node:crypto';
export const VIDEO_MAX_BYTES=12*1024*1024;
const invalid=()=>Object.assign(new Error('Μη έγκυρο βίντεο. Επιτρέπεται MP4 H.264/AAC έως 30 δευτερόλεπτα / 12 MB.'),{status:400});

/** Bounded non-fragmented ISO-BMFF parser. Validates track types, self-contained data,
 * sample durations and every chunk/sample range; never trusts declared MIME/extension alone. */
export function validateVideoMp4(b){
  if(!Buffer.isBuffer(b)||b.length<32||b.length>VIDEO_MAX_BYTES)throw invalid();
  let budget=4096;
  const u32=(p,end=b.length)=>{if(p<0||p+4>end)throw invalid();return b.readUInt32BE(p)};
  const u64=(p,end)=>{if(p+8>end)throw invalid();const n=b.readBigUInt64BE(p);if(n>BigInt(Number.MAX_SAFE_INTEGER))throw invalid();return Number(n)};
  const boxes=(start,end)=>{
    const out=[];for(let p=start;p<end;){if(--budget<0||end-p<8)throw invalid();let n=u32(p,end),head=8;if(n===1){n=u64(p+8,end);head=16;}if(n===0)n=end-p;if(n<head||n>end-p)throw invalid();out.push({type:b.toString('latin1',p+4,p+8),start:p,data:p+head,end:p+n});p+=n;}return out;
  };
  const one=(list,type)=>{const found=list.filter(x=>x.type===type);if(found.length!==1)throw invalid();return found[0]};
  const top=boxes(0,b.length),ftyp=one(top,'ftyp'),moov=one(top,'moov'),mdats=top.filter(x=>x.type==='mdat'&&x.end>x.data);
  if(ftyp.start!==0||ftyp.end-ftyp.data<8||!mdats.length||top.some(x=>!['ftyp','moov','mdat','free','skip','wide'].includes(x.type)))throw invalid();
  const brands=[];for(let p=ftyp.data;p+4<=ftyp.end;p+=4)if(p!==ftyp.data+4)brands.push(b.toString('latin1',p,p+4));
  if(!brands.some(x=>['isom','iso2','mp41','mp42','avc1','M4V '].includes(x)))throw invalid();
  const movie=boxes(moov.data,moov.end),tracks=movie.filter(x=>x.type==='trak');
  if(tracks.length<1||tracks.length>2)throw invalid();
  const duration=box=>{const v=b[box.data];if(v!==0&&v!==1)throw invalid();const offset=v===1?20:12;const scale=u32(box.data+offset,box.end),ticks=v===1?u64(box.data+offset+4,box.end):u32(box.data+offset+4,box.end);if(!scale||!ticks||ticks/scale>30)throw invalid();return {scale,ticks,ms:ticks/scale*1000};};
  const movieDuration=duration(one(movie,'mvhd'));let videos=0,audios=0;
  for(const track of tracks){
    const parts=boxes(track.data,track.end),mdia=one(parts,'mdia'),media=boxes(mdia.data,mdia.end),time=duration(one(media,'mdhd')),handler=one(media,'hdlr');
    if(handler.data+12>handler.end)throw invalid();const kind=b.toString('latin1',handler.data+8,handler.data+12);
    if(kind==='vide'){if(++videos>1)throw invalid();}else if(kind==='soun'){if(++audios>1)throw invalid();}else throw invalid();
    const minf=one(media,'minf'),minimum=boxes(minf.data,minf.end),dinf=one(minimum,'dinf'),dref=one(boxes(dinf.data,dinf.end),'dref');
    if(u32(dref.data+4,dref.end)!==1)throw invalid();const refs=boxes(dref.data+8,dref.end);if(refs.length!==1||refs[0].type!=='url '||refs[0].end-refs[0].data!==4||u32(refs[0].data,refs[0].end)!==1)throw invalid();
    const stbl=one(minimum,'stbl'),table=boxes(stbl.data,stbl.end),stsd=one(table,'stsd');if(u32(stsd.data+4,stsd.end)!==1)throw invalid();
    const entries=boxes(stsd.data+8,stsd.end);if(entries.length!==1||entries[0].type!==(kind==='vide'?'avc1':'mp4a'))throw invalid();
    const sample=entries[0];if(sample.data+8>sample.end||b.readUInt16BE(sample.data+6)!==1)throw invalid();
    if(kind==='vide'){
      if(sample.end-sample.data<78)throw invalid();const w=b.readUInt16BE(sample.data+24),h=b.readUInt16BE(sample.data+26);if(!w||!h||w>1920||h>1920||w*h>1920*1080)throw invalid();
      const avcc=one(boxes(sample.data+78,sample.end),'avcC');if(avcc.end-avcc.data<7||b[avcc.data]!==1)throw invalid();
    }else if(sample.end-sample.data<28||b.readUInt16BE(sample.data+8)!==0||!boxes(sample.data+28,sample.end).some(x=>x.type==='esds'))throw invalid();
    const stsz=one(table,'stsz'),fixed=u32(stsz.data+4,stsz.end),count=u32(stsz.data+8,stsz.end);if(!count||count>180000||stsz.end-stsz.data!==12+(fixed?0:count*4))throw invalid();
    const size=i=>fixed||u32(stsz.data+12+i*4,stsz.end);
    const stts=one(table,'stts'),timings=u32(stts.data+4,stts.end);if(timings>count||stts.end-stts.data!==8+timings*8)throw invalid();let samples=0,ticks=0;
    for(let i=0;i<timings;i++){const n=u32(stts.data+8+i*8,stts.end),delta=u32(stts.data+12+i*8,stts.end);if(!n||!delta)throw invalid();samples+=n;ticks+=n*delta;}
    if(samples!==count||!Number.isSafeInteger(ticks)||ticks/time.scale>30||Math.abs(ticks-time.ticks)>time.scale)throw invalid();
    const offsets=table.filter(x=>x.type==='stco'||x.type==='co64');if(offsets.length!==1)throw invalid();const off=offsets[0],chunks=u32(off.data+4,off.end),width=off.type==='co64'?8:4;if(!chunks||chunks>count||off.end-off.data!==8+chunks*width)throw invalid();
    const stsc=one(table,'stsc'),mappings=u32(stsc.data+4,stsc.end);if(!mappings||mappings>chunks||stsc.end-stsc.data!==8+mappings*12)throw invalid();
    const map=[];for(let i=0;i<mappings;i++){const p=stsc.data+8+i*12,first=u32(p,stsc.end),per=u32(p+4,stsc.end);if((i===0&&first!==1)||(i&&first<=map[i-1].first)||first>chunks||!per||per>count||u32(p+8,stsc.end)!==1)throw invalid();map.push({first,per});}
    let index=0,mapping=0;
    for(let c=1;c<=chunks;c++){
      while(mapping+1<map.length&&map[mapping+1].first<=c)mapping++;
      let length=0;for(let s=0;s<map[mapping].per;s++){if(index>=count)throw invalid();const n=size(index++);if(!n)throw invalid();length+=n;}
      const p=off.data+8+(c-1)*width,offset=width===8?u64(p,off.end):u32(p,off.end);
      if(!mdats.some(m=>offset>=m.data&&offset<=m.end-length))throw invalid();
    }
    if(index!==count)throw invalid();
  }
  if(videos!==1)throw invalid();return {durationMs:Math.ceil(movieDuration.ms)};
}
export function parseVideoAttachment(value){
  if(!value||typeof value!=='object'||Array.isArray(value)||value.mimeType!=='video/mp4'||typeof value.dataUrl!=='string'||value.dataUrl.length>Math.ceil(VIDEO_MAX_BYTES/3)*4+22)throw invalid();
  const prefix='data:video/mp4;base64,';if(!value.dataUrl.startsWith(prefix))throw invalid();const data=value.dataUrl.slice(prefix.length);
  if(!data.length||data.length%4||/[^A-Za-z0-9+/=]/.test(data))throw invalid();const bytes=Buffer.from(data,'base64');if(bytes.toString('base64')!==data)throw invalid();
  const metadata=validateVideoMp4(bytes);return {name:'video.mp4',mimeType:'video/mp4',size:bytes.length,checksum:crypto.createHash('sha256').update(bytes).digest('hex'),data,...metadata};
}
