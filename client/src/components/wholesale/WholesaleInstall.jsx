import React, {useEffect, useState} from 'react';
import {createWholesaleInstallController} from './wholesale-install.mjs';
import './wholesale-install.css';

const messages = {
  unsupported: 'Η εγκατάσταση εξαρτάται από τη συσκευή και τον browser. Δες τις οδηγίες παρακάτω.',
  ready: 'Μπορείς να προσθέσεις τη Χονδρική B2B ως ξεχωριστή εφαρμογή σε αυτή τη συσκευή.',
  prompting: 'Ολοκλήρωσε την επιλογή στο παράθυρο του browser.',
  accepted: 'Το αίτημα εγκατάστασης έγινε αποδεκτό. Περίμενε την ολοκλήρωση από τον browser.',
  cancelled: 'Η εγκατάσταση ακυρώθηκε. Μπορείς να χρησιμοποιείς τη χονδρική από τον browser.',
  error: 'Η εγκατάσταση δεν ολοκληρώθηκε. Χρησιμοποίησε το μενού του browser ή δοκίμασε ξανά όταν εμφανιστεί η επιλογή.',
  installed: 'Η εφαρμογή είναι εγκατεστημένη ή ανοικτή σε αυτόνομο παράθυρο.'
};

export default function WholesaleInstall({environment = globalThis.window}) {
  const [controller, setController] = useState(null);
  const [state, setState] = useState({status: 'unsupported'});
  useEffect(() => {
    const next = createWholesaleInstallController(environment);
    const unsubscribe = next.subscribe(setState);
    setController(next);
    setState(next.getState());
    return () => { unsubscribe(); next.dispose(); };
  }, [environment]);
  return <aside className="wholesale-install" aria-label="Εγκατάσταση Χονδρικής B2B">
    <div className="wholesale-install-heading"><strong>Χονδρική B2B στη συσκευή σου</strong>
      {state.status === 'ready' || state.status === 'prompting' ? <button type="button" disabled={state.status !== 'ready'} onClick={() => controller?.install()}>Εγκατάσταση εφαρμογής</button> : null}
    </div>
    <p role="status">{messages[state.status]}</p>
    {state.status !== 'installed' && <details><summary>Οδηγίες εγκατάστασης</summary>
      <p>Chrome / Edge: άνοιξε το μενού του browser και επίλεξε «Εγκατάσταση εφαρμογής» ή «Εγκατάσταση αυτής της τοποθεσίας ως εφαρμογής», εφόσον προσφέρεται.</p>
      <p>iPhone / iPad: άνοιξε τη σελίδα στο Safari, πάτησε «Κοινή χρήση» και «Προσθήκη στην οθόνη αφετηρίας».</p>
      <p>Αν δεν εμφανίζεται επιλογή εγκατάστασης, συνέχισε από τον browser. Η εγκατάσταση δεν ενεργοποιεί συνδρομή ή δικαιώματα.</p>
    </details>}
    <p className="wholesale-install-offline">Για εργασία χωρίς ίντερνετ χρειάζεται ξεχωριστή προετοιμασία αυτής της συσκευής από τη λειτουργία «Χωρίς ίντερνετ», όσο υπάρχει σύνδεση. Η εγκατάσταση μόνη της δεν αποθηκεύει πελάτες ή προϊόντα. Τα τοπικά πρόχειρα παραμένουν εκκρεμή μέχρι τον έλεγχο και την αποστολή τους με σύνδεση. Η φορολογική έκδοση χωρίς ίντερνετ δεν υποστηρίζεται από αυτή τη λειτουργία.</p>
  </aside>;
}
