import React from "react";
import {Video} from "lucide-react";

export default function ScreenRecorderWindowLauncher(){
  const openRecorder=()=>{
    const width=520,height=720;
    const left=Math.max(0,Math.round((window.screen.availWidth-width)/2));
    const top=Math.max(0,Math.round((window.screen.availHeight-height)/2));
    const popup=window.open("/screen-recorder","myworkstation-screen-recorder",`popup=yes,width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=yes`);
    popup?.focus();
  };

  return <button type="button" onClick={openRecorder} title="Ανοίγει ανεξάρτητο παράθυρο εγγραφής"><Video/> Εγγραφή οθόνης</button>;
}
