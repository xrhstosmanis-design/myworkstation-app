import {useEffect,useRef} from "react";
import {createCameraAcquisition} from "../../lib/camera-acquisition.js";

export default function useCameraAcquisition(scopeKey){
  const scope=useRef(null);
  if(!scope.current||scope.current.key!==scopeKey){
    scope.current?.camera.dispose();
    scope.current={key:scopeKey,camera:createCameraAcquisition()};
  }
  useEffect(()=>{
    const current=scope.current;
    return()=>{current.camera.cancel()};
  },[scopeKey]);
  return scope.current.camera;
}
