// Isolated geometry/pointer fixture. Synthetic data only, no production API.
import React,{useState} from "react";
import {createRoot} from "react-dom/client";
import {Camera,KeyRound} from "lucide-react";
import "../../client/src/components/platform/platform-admin.css";
import AutomaticReportSettingsManager from "../../client/src/components/platform/AutomaticReportSettingsManager.jsx";

function Fixture(){
 const [background,setBackground]=useState(0),[previews,setPreviews]=useState(0);
 const request=async(path,options={})=>{
  if(options.method==="POST"){
   setPreviews(n=>n+1);
   return {ready:false,sourceCount:1,settingsVersion:1,holds:[{code:"THIRD_SHIFT_MISSING",terminalPos:"MAIN"}],groups:null};
  }
  const cashRule={mode:"FULL",deliveryTerminalPattern:"DELIVERY",carryOverEnabled:true,posEftposEnabled:true};
  return {settings:{version:1,configuration:{dayStartHour:7,secondShiftStartHour:15,thirdShiftStartHour:23,terminals:[{terminalPos:"MAIN",requiredSlots:[1,2,3]}],cashRule}},cashRule,observedTerminals:["MAIN"],suggestedDay:"2020-01-15",dispatchEnabled:false};
 };
 // Stable request identity, as in PlatformAdminApp's module-scoped request.
 const [stableRequest]=useState(()=>request);
 return <><output id="background-clicks">{background}</output><output id="preview-calls">{previews}</output>
  <AutomaticReportSettingsManager company={{id:"synthetic-company",name:"MYWORKSTATION LAB"}} store={{id:"synthetic-store",name:"ΕΡΓΑΣΤΗΡΙΟ ΔΟΚΙΜΩΝ"}} request={stableRequest} onClose={()=>{}}/>
  <div style={{position:"fixed",left:32,bottom:32,zIndex:1002,display:"grid",gap:8}}>{["N40 CONTROL 20261010","ΕΡΓΑΣΤΗΡΙΟ ΑΠΟΜΟΝΩΣΗΣ ΕΤΙΚΕΤΑΣ","ΕΡΓΑΣΤΗΡΙΟ ΔΟΚΙΜΩΝ"].map(name=><button key={name} onClick={()=>setBackground(n=>n+1)}><Camera/>Video Events · {name}</button>)}</div>
  <div className="platform-store-integrations-launcher"><button onClick={()=>setBackground(n=>n+1)}><KeyRound/>myDATA / ΑΦΜ · ΕΡΓΑΣΤΗΡΙΟ ΔΟΚΙΜΩΝ</button></div>
 </>;
}
createRoot(document.getElementById("root")).render(<Fixture/>);
