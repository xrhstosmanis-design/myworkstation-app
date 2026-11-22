import {applyDocumentCameraFocus} from "./document-camera-focus.js";

export const cameraConstraints=(mode="document")=>({video:{facingMode:{ideal:"environment"},width:{ideal:mode==="document"?3840:1920},height:{ideal:mode==="document"?2160:1080}},audio:false});
export const stopCameraStream=stream=>stream?.getTracks?.().forEach(track=>track.stop());

// A pending browser permission dialog cannot be cancelled by getUserMedia.
// Fence its eventual result as well as the already-open stream.
export function createCameraAcquisition({mediaDevices=globalThis.navigator?.mediaDevices,focus=applyDocumentCameraFocus}={}){
  let generation=0,stream=null,disposed=false;
  const cancel=()=>{generation++;stopCameraStream(stream);stream=null};
  return {
    cancel,
    checkpoint:()=>generation,
    current:request=>!disposed&&request===generation,
    dispose(){disposed=true;cancel()},
    async open(mode="document"){
      if(disposed)return null;
      cancel();const request=generation;
      if(!mediaDevices?.getUserMedia)throw new Error("Η κάμερα δεν υποστηρίζεται από αυτόν τον browser.");
      let next;
      try{next=await mediaDevices.getUserMedia(cameraConstraints(mode))}
      catch(error){
        if(disposed||request!==generation)return null;
        // Never retry a permission denial or a camera already in use.
        if(!["OverconstrainedError","ConstraintNotSatisfiedError"].includes(error?.name))throw error;
        next=await mediaDevices.getUserMedia({video:{facingMode:{ideal:"environment"}},audio:false});
      }
      if(disposed||request!==generation){stopCameraStream(next);return null}
      stream=next;
      await focus(next.getVideoTracks?.()[0]);
      if(disposed||request!==generation){stopCameraStream(next);return null}
      return next;
    }
  };
}

export async function captureCameraFrame(video,{name="parastatiko.jpg",quality=.96,isCurrent=()=>true}={}){
  if(!video||video.readyState<2||!video.videoWidth||!video.videoHeight)throw new Error("Περίμενε να εμφανιστεί καθαρά η εικόνα και ξαναπάτησε Φωτογράφιση.");
  const canvas=document.createElement("canvas");canvas.width=video.videoWidth;canvas.height=video.videoHeight;
  canvas.getContext("2d").drawImage(video,0,0,canvas.width,canvas.height);
  const blob=await new Promise(resolve=>canvas.toBlob(resolve,"image/jpeg",quality));
  canvas.width=canvas.height=0;
  if(!isCurrent())return null;
  if(!blob)throw new Error("Η λήψη απέτυχε. Φωτογράφισε ξανά.");
  if(blob.size>7*1024*1024)throw new Error("Η λήψη ξεπερνά τα 7 MB. Επίλεξε μικρότερη ανάλυση κάμερας.");
  return new File([blob],name,{type:"image/jpeg"});
}
