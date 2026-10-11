import React, {useEffect, useId, useState} from "react";

export default function CashShiftAnalysis({reportIdentity, children}) {
  const [expanded, setExpanded] = useState(false);
  const contentId = useId();
  useEffect(() => { setExpanded(false); }, [reportIdentity]);
  return <section className="cash-shift-analysis">
    <button type="button" className="secondary cash-analysis-toggle"
      aria-expanded={expanded} aria-controls={contentId}
      onClick={() => setExpanded(value => !value)}>
      Αναλύσεις <span aria-hidden="true">{expanded ? "▴" : "▾"}</span>
    </button>
    <div id={contentId} className="cash-analysis-content" hidden={!expanded}>
      {children}
    </div>
  </section>;
}
