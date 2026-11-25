// A controller's clock must never be compared with a remote server's frame timestamp.
// Only a genuinely new frame sequence refreshes locally measured freshness.
export function createRemoteFrameFreshness({now=()=>performance.now(),maxAgeMs=5000}={}){
 let lastSequence=null,lastReceived=-Infinity;
 return {
  observe(frame,{serverAgeMs}={}){
   if(!frame||!Number.isSafeInteger(frame.sequence)||frame.sequence<1)return false;
   if(Number.isFinite(serverAgeMs)&&serverAgeMs>maxAgeMs)return false;
   if(lastSequence!==null&&frame.sequence<=lastSequence)return false;
   lastSequence=frame.sequence;lastReceived=now();return true;
  },
  isFresh(){const age=now()-lastReceived;return Number.isFinite(age)&&age>=0&&age<maxAgeMs;},
  reset(){lastSequence=null;lastReceived=-Infinity;}
 };
}
