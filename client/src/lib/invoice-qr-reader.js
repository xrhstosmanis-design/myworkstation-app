import {BrowserQRCodeReader} from "@zxing/browser";
import {BarcodeFormat,DecodeHintType} from "@zxing/library";

// Decode the framed QR at its original resolution before searching the room.
// Keep a full-frame attempt every fourth miss for off-centre documents.
export function createInvoiceQrReader({createCanvas=()=>document.createElement("canvas")}={}){
  class FramedQrReader extends BrowserQRCodeReader{
    decodeFromCanvas(frame){
      this.attempt=(this.attempt||0)+1;
      const side=Math.floor(Math.min(frame.width,frame.height)*.75);
      if(side<100)return super.decodeFromCanvas(frame);
      this.crop=this.crop||createCanvas();
      if(this.crop.width!==side||this.crop.height!==side){this.crop.width=side;this.crop.height=side;}
      const context=this.crop.getContext("2d",{willReadFrequently:true});
      if(!context)return super.decodeFromCanvas(frame);
      context.drawImage(frame,Math.floor((frame.width-side)/2),Math.floor((frame.height-side)/2),side,side,0,0,side,side);
      try{return super.decodeFromCanvas(this.crop)}catch(error){
        if(this.attempt%4===0)return super.decodeFromCanvas(frame);
        throw error;
      }
    }
  }
  return new FramedQrReader(new Map([[DecodeHintType.POSSIBLE_FORMATS,[BarcodeFormat.QR_CODE]],[DecodeHintType.TRY_HARDER,true]]),{delayBetweenScanAttempts:60,delayBetweenScanSuccess:250});
}

export async function focusInvoiceQrCamera(video){
  const track=video?.srcObject?.getVideoTracks?.()[0];
  try{
    if(track?.getCapabilities?.()?.focusMode?.includes("continuous"))await track.applyConstraints({advanced:[{focusMode:"continuous"}]});
  }catch{/* Optional autofocus must never prevent scanning. */}
}
