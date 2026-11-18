import React, {useEffect, useState} from "react";

export default function ChatTopicMute({api, storeId, topic}) {
  const path = `/api/store-chat/stores/${encodeURIComponent(storeId)}/notification-preferences/${topic}`;
  const [muted, setMuted] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    api(path).then(result => {
      if (active) setMuted(result.muted === true);
    }).catch(() => {
      if (active) setError("Δεν φορτώθηκε η ρύθμιση σίγασης.");
    });
    return () => { active = false; };
  }, [path]);

  async function toggleMute() {
    setSaving(true);
    setError("");
    try {
      const result = await api(path, {method: "PUT", body: JSON.stringify({muted: !muted})});
      setMuted(result.muted === true);
    } catch {
      setError("Δεν αποθηκεύτηκε η ρύθμιση σίγασης.");
    } finally {
      setSaving(false);
    }
  }

  return <>
    <button type="button" aria-pressed={muted ?? undefined} disabled={muted === null || saving} onClick={toggleMute}>
      {muted ? "Κατάργηση σίγασης ενότητας" : "Σίγαση ειδοποιήσεων ενότητας"}
    </button>
    {error && <small role="alert">{error}</small>}
  </>;
}
