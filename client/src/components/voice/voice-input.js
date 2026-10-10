const errors = {
  "not-allowed": "Δεν επιτράπηκε η πρόσβαση στο μικρόφωνο. Μπορείς να γράψεις την ερώτηση.",
  "service-not-allowed": "Ο browser δεν επέτρεψε την αναγνώριση φωνής. Μπορείς να γράψεις την ερώτηση.",
  "audio-capture": "Δεν βρέθηκε διαθέσιμο μικρόφωνο. Έλεγξε τη σύνδεσή του.",
  "no-speech": "Δεν ακούστηκε ομιλία. Πάτησε ξανά το μικρόφωνο και μίλησε καθαρά.",
  "network": "Η αναγνώριση φωνής δεν ολοκληρώθηκε λόγω σύνδεσης. Μπορείς να γράψεις την ερώτηση.",
  "language-not-supported": "Ο browser δεν υποστηρίζει αναγνώριση ελληνικών. Μπορείς να γράψεις την ερώτηση."
};

export function speechRecognitionConstructor(environment) {
  if (!environment || environment.isSecureContext !== true) return null;
  const constructor = environment.SpeechRecognition || environment.webkitSpeechRecognition;
  return typeof constructor === "function" ? constructor : null;
}

// One user-initiated utterance. No API call, auto-submit, restart or audio storage.
export function createVoiceInput({ createRecognition, onState = () => {}, onText = () => {}, maxLength = 600,
  setTimer = setTimeout, clearTimer = clearTimeout, durationMs = 30000 }) {
  let session = null, disposed = false;
  const limit = Number.isInteger(maxLength) && maxLength > 0 ? maxLength : 600;
  const emit = (status = "idle", preview = "", error = "") => {
    if (!disposed) onState({ status, preview, error });
  };
  const detach = current => {
    if (current.timer !== undefined) clearTimer(current.timer);
    current.recognition.onstart = current.recognition.onresult = current.recognition.onerror = current.recognition.onend = null;
  };
  const discard = (error = "") => {
    const current = session;
    session = null;
    if (current) {
      detach(current);
      try { current.recognition.abort(); } catch { /* Already ended or not started. */ }
    }
    emit("idle", "", error);
  };
  const transcript = (current, includeInterim = false) => [...current.results.entries()]
    .sort(([a], [b]) => a - b)
    .filter(([, result]) => result.final || includeInterim)
    .map(([, result]) => result.text).filter(Boolean).join(" ").trim();
  return {
    start(baseText = "") {
      if (disposed || session) return false;
      let recognition;
      try { recognition = createRecognition(); } catch { emit("idle", "", "Δεν ήταν δυνατή η έναρξη αναγνώρισης φωνής."); return false; }
      if (!recognition) { emit("idle", "", "Η φωνητική εισαγωγή δεν υποστηρίζεται σε αυτόν τον browser."); return false; }
      const current = { recognition, base: String(baseText).trim(), results: new Map(), timer: undefined, stopping: false };
      session = current;
      const valid = () => !disposed && session === current;
      recognition.lang = "el-GR";
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.maxAlternatives = 1;
      recognition.onstart = () => { if (valid() && !current.stopping) emit("listening"); };
      recognition.onresult = event => {
        if (!valid()) return;
        const results = event.results;
        if (!results || !Number.isInteger(results.length)) return;
        // Rebuild from the cumulative result list: duplicate events cannot append twice.
        current.results.clear();
        for (let i = 0; i < results.length; i++) {
          const result = results[i], text = String(result?.[0]?.transcript || "").trim();
          if (text) current.results.set(i, { text, final: result.isFinal === true });
        }
        emit(current.stopping ? "processing" : "listening", transcript(current, true).slice(0, limit));
      };
      recognition.onerror = event => {
        if (valid()) discard(errors[event?.error] || "Η αναγνώριση φωνής δεν ολοκληρώθηκε. Μπορείς να γράψεις την ερώτηση.");
      };
      recognition.onend = () => {
        if (!valid()) return;
        const text = transcript(current);
        session = null;
        detach(current);
        if (!text) { emit("idle", "", errors["no-speech"]); return; }
        const combined = [current.base, text].filter(Boolean).join(" ");
        if (combined.length > limit) {
          emit("idle", "", `Η ερώτηση ξεπερνά τους ${limit} χαρακτήρες. Γράψε ή πες μια συντομότερη ερώτηση.`);
          return;
        }
        emit();
        onText(combined);
      };
      emit("starting");
      current.timer = setTimer(() => {
        if (valid()) discard("Η φωνητική εισαγωγή σταμάτησε λόγω χρονικού ορίου. Πάτησε ξανά για νέα προσπάθεια.");
      }, durationMs);
      try { recognition.start(); return true; }
      catch { if (valid()) discard("Δεν ήταν δυνατή η έναρξη αναγνώρισης φωνής. Έλεγξε το μικρόφωνο."); return false; }
    },
    stop() {
      const current = session;
      if (!current || disposed) return;
      if (current.stopping) return;
      current.stopping = true;
      emit("processing", transcript(current, true).slice(0, limit));
      try { current.recognition.stop(); }
      catch { discard("Η φωνητική εισαγωγή σταμάτησε. Μπορείς να γράψεις την ερώτηση."); }
    },
    cancel() { if (!disposed) discard(); },
    dispose() { if (!disposed) { discard(); disposed = true; } }
  };
}
