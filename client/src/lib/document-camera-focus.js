export function documentCameraFocusOptions(track){
  let caps={},settings={};
  try{caps=track?.getCapabilities?.()||{};settings=track?.getSettings?.()||{}}catch{}
  const modes=Array.isArray(caps.focusMode)?caps.focusMode:[];
  const automatic=modes.includes("continuous")?"continuous":modes.includes("single-shot")?"single-shot":null;
  const range=caps.focusDistance;
  const manual=modes.includes("manual")&&Number.isFinite(range?.min)&&Number.isFinite(range?.max)&&range.max>range.min
    ?{min:range.min,max:range.max,step:Number.isFinite(range.step)&&range.step>0?range.step:(range.max-range.min)/100}:null;
  const distance=manual?Math.max(manual.min,Math.min(manual.max,Number.isFinite(settings.focusDistance)?settings.focusDistance:manual.min)):null;
  return {automatic,singleShot:modes.includes("single-shot"),manual,distance};
}

export async function applyDocumentCameraFocus(track,distance=null,{refocus=false}={}){
  const options=documentCameraFocusOptions(track);
  if(track?.readyState==="ended"||!track?.applyConstraints)return false;
  const manual=distance!==null;
  if(manual&&(!options.manual||!Number.isFinite(distance)||distance<options.manual.min||distance>options.manual.max))return false;
  if(!manual&&!options.automatic)return false;
  const focusMode=manual?"manual":refocus&&options.singleShot?"single-shot":options.automatic;
  try{
    await track.applyConstraints({advanced:[{focusMode,...(manual?{focusDistance:distance}:{})}]});
    const settings=track.getSettings?.();
    return track.readyState!=="ended"&&(!settings?.focusMode||settings.focusMode===focusMode);
  }catch{return false}
}
