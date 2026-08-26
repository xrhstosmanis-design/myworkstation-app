import React from "react";
import {createRoot} from "react-dom/client";
import ScreenRecorderControl from "./components/commerce/ScreenRecorderControl.jsx";
import "./screen-recorder-window.css";

function ScreenRecorderWindow(){
  return <main className="screen-recorder-window">
    <div className="screen-recorder-window-brand">MW</div>
    <small>MYWORKSTATION · PLATFORM ADMIN</small>
    <h1>Εγγραφή οθόνης</h1>
    <p>Αυτό το παράθυρο μένει ανοιχτό όσο αλλάζεις σελίδες, Store Mode ή BackOffice.</p>
    <div className="screen-recorder-window-tip"><b>1.</b> Πάτησε «Έναρξη εγγραφής».<br/><b>2.</b> Επίλεξε «Ολόκληρη οθόνη».<br/><b>3.</b> Μην κλείσεις αυτό το μικρό παράθυρο.</div>
    <ScreenRecorderControl contextLabel="MYWORKSTATION · PLATFORM ADMIN" startLabel="Έναρξη εγγραφής"/>
  </main>;
}

createRoot(document.getElementById("root")).render(<ScreenRecorderWindow/>);
