import React from "react";
import {createRoot} from "react-dom/client";
import DocumentCameraFocus from "../components/store/DocumentCameraFocus.jsx";

export function mountCameraControls(video,stream){
  const host=document.createElement("div");
  if(video.parentElement.childElementCount===1)video.parentElement.after(host);else video.after(host);
  const root=createRoot(host);root.render(React.createElement(DocumentCameraFocus,{track:stream.getVideoTracks?.()[0],videoRef:{current:video}}));
  let disposed=false;return()=>{if(disposed)return;disposed=true;root.unmount();host.remove()};
}
