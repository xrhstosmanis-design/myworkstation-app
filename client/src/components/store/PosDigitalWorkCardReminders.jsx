import React, {useEffect, useState} from "react";

const REFRESH_MS = 10_000;

export default function PosDigitalWorkCardReminders({api, storeId}) {
  const [reminders, setReminders] = useState([]);

  useEffect(() => {
    let stopped = false;
    let timer;
    async function load() {
      let nextRefresh = REFRESH_MS;
      try {
        const result = await api(`/api/digital-work-card/stores/${encodeURIComponent(storeId)}/reminders`);
        if (!stopped) setReminders(Array.isArray(result?.reminders) ? result.reminders : []);
      } catch (error) {
        if (error.status === 401 || error.status === 403 || error.status === 404) {
          if (!stopped) setReminders([]);
          nextRefresh = 60_000;
        }
      } finally {
        if (!stopped) timer = setTimeout(load, nextRefresh);
      }
    }
    load();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [api, storeId]);

  if (!reminders.length) return null;
  return <div role="status" aria-label="Υπενθυμίσεις Ψηφιακής Κάρτας Εργασίας">
    {reminders.map(reminder => <div className="store-pos-alert" key={reminder.id} style={{fontSize:"1.2rem"}}>
      <strong>{reminder.name}<br/>Χτύπησε την Ψηφιακή σου Κάρτα.</strong>
    </div>)}
  </div>;
}
