import React, { useState } from "react";
import { Building2 } from "lucide-react";
import { matchesGreekSearch } from "../../utils/greek-search.js";
import "./owner-store-directory.css";

export default function OwnerStoreDirectory({ companies, onSelect, switching }) {
  const [query, setQuery] = useState("");
  const results = companies.map(company => ({
    ...company,
    stores: (company.stores || []).filter(store =>
      matchesGreekSearch(query, [company.name, company.taxId, store.name, store.city])
    )
  })).filter(company => company.stores.length || !query.trim());

  return (
    <section className="panel owner-store-directory" aria-labelledby="owner-store-directory-title">
      <h2 id="owner-store-directory-title">Οι επιχειρήσεις και τα καταστήματά μου</h2>
      <label>
        Αναζήτηση καταστήματος ή επιχείρησης
        <input type="search" value={query} onChange={event => setQuery(event.target.value)} />
      </label>
      {switching && <p role="status">Γίνεται αλλαγή επιχείρησης…</p>}
      {query.trim() && !results.length && <p role="status">Δεν βρέθηκαν καταστήματα.</p>}
      <div className="store-grid" aria-busy={switching}>
        {results.map(company => (
          <article className="store-card" key={company.id}>
            <Building2 aria-hidden="true" />
            <h3>{company.name}</h3>
            <p>ΑΦΜ {company.taxId || "Δεν έχει καταχωριστεί"}</p>
            {company.stores.map(store => (
              <button className="store-open" type="button" key={store.id} disabled={switching}
                onClick={() => onSelect(company.id, store.id)}>
                {store.name} · Άνοιγμα
              </button>
            ))}
          </article>
        ))}
      </div>
    </section>
  );
}
