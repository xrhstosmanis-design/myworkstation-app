import React,{useEffect,useState} from "react";
import PilotReportLauncher from "./PilotReportLauncher.jsx";

export default function PilotReportLauncherLive(){
  const [ready,setReady]=useState(Boolean(localStorage.getItem("token")));
  useEffect(()=>{
    const timer=window.setInterval(()=>setReady(Boolean(localStorage.getItem("token"))),750);
    return()=>window.clearInterval(timer);
  },[]);
  return ready?<PilotReportLauncher/>:null;
}
