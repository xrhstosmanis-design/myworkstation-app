import React, {useEffect, useRef, useState} from "react";
import {Mic, Square, X} from "lucide-react";
import {createVoiceInput, speechRecognitionConstructor} from "./voice-input.js";
import "./voice-input.css";

export default function VoiceInputControls({value = "", onChange, onActiveChange, disabled = false, contextKey = "", maxLength = 600}) {
  const [state, setState] = useState({status: "idle", preview: "", error: ""});
  const controller = useRef(null), callbacks = useRef({onChange, onActiveChange});
  callbacks.current = {onChange, onActiveChange};
  const Recognition = speechRecognitionConstructor(typeof window === "undefined" ? null : window);
  const active = state.status !== "idle";
  useEffect(() => {
    const current = createVoiceInput({
      createRecognition: () => { const Constructor = speechRecognitionConstructor(window); return Constructor ? new Constructor() : null; },
      maxLength,
      onState: next => { setState(next); callbacks.current.onActiveChange?.(next.status !== "idle"); },
      onText: text => callbacks.current.onChange?.(text)
    });
    controller.current = current;
    const hide = () => { if (document.hidden) current.cancel(); };
    document.addEventListener("visibilitychange", hide);
    return () => { document.removeEventListener("visibilitychange", hide); current.dispose(); if (controller.current === current) controller.current = null; };
  }, [contextKey, maxLength]);
  useEffect(() => { if (disabled) controller.current?.cancel(); }, [disabled]);
  return <div className="mws-voice-input">
    <div className="mws-voice-input-actions">
      <button type="button" aria-label={active ? "Διακοπή φωνητικής εισαγωγής" : "Φωνητική εισαγωγή"} aria-pressed={active}
        disabled={disabled || !Recognition || state.status === "processing"}
        onClick={() => active ? controller.current?.stop() : controller.current?.start(value)}>
        {active ? <Square aria-hidden="true"/> : <Mic aria-hidden="true"/>}
        {state.status === "starting" ? "Σύνδεση μικροφώνου…" : state.status === "listening" ? "Ακούω — Διακοπή" : state.status === "processing" ? "Αναγνώριση…" : "Μίλησε"}
      </button>
      {active && <button type="button" aria-label="Ακύρωση φωνητικής εισαγωγής" onClick={() => controller.current?.cancel()}><X aria-hidden="true"/>Ακύρωση</button>}
    </div>
    <p className="mws-voice-input-note">{Recognition ? "Η φωνή προστίθεται στο κείμενο. Έλεγξέ το πριν πατήσεις «Ρώτα». Ο browser μπορεί να χρησιμοποιεί εξωτερική υπηρεσία αναγνώρισης." : "Η φωνητική εισαγωγή δεν είναι διαθέσιμη σε αυτόν τον browser. Μπορείς να γράψεις την ερώτηση."}</p>
    <div className="mws-voice-input-status" role="status" aria-live="polite">{state.preview || (active ? "Το μικρόφωνο είναι ενεργό. Μίλησε ελληνικά." : "")}</div>
    {state.error && <p className="mws-voice-input-error" role="alert">{state.error}</p>}
  </div>;
}
