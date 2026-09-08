import React, { useEffect, useMemo, useRef, useState } from "react";
import { Pencil, Printer, Search, Trash2 } from "lucide-react";
import { matchesGreekSearch } from "../../utils/greek-search.js";

const n = (value) => Number(value || 0);
const euro = (value) => `${n(value).toFixed(2)} €`;

export function inventoryTotals(lines = []) {
  return lines.reduce(
    (sum, line) => {
      const counted = line.countedQuantity === null ? 0 : n(line.countedQuantity);
      sum.lines += 1;
      sum.expected += n(line.expectedQuantity);
      sum.counted += counted;
      sum.difference += counted - n(line.expectedQuantity);
      sum.retail += counted * n(line.salePrice);
      sum.cost += counted * n(line.unitCost);
      return sum;
    },
    { lines: 0, expected: 0, counted: 0, difference: 0, retail: 0, cost: 0 },
  );
}

export default function InventoryFastCount({ api, current, reload, setError }) {
  const barcodeRef = useRef(null);
  const quantityRef = useRef(null);
  const [lookup, setLookup] = useState("");
  const [selected, setSelected] = useState(null);
  const [quantity, setQuantity] = useState("");
  const [showAll, setShowAll] = useState(current.status !== "DRAFT");
  const [matches, setMatches] = useState([]);
  const [saving, setSaving] = useState(false);

  const countedLines = useMemo(
    () => (current.lines || []).filter((line) => line.countedQuantity !== null),
    [current.lines],
  );
  const rows = useMemo(() => {
    const base = showAll ? current.lines || [] : countedLines;
    return base.filter((line) =>
      matchesGreekSearch(lookup, [line.name, line.sku, line.barcode]),
    );
  }, [current.lines, countedLines, lookup, showAll]);
  const totals = useMemo(() => inventoryTotals(rows), [rows]);

  useEffect(() => {
    if (current.status === "DRAFT") barcodeRef.current?.focus();
  }, [current.id, current.status]);

  useEffect(() => {
    const productCreated = async (event) => {
      const productId = event.detail?.id;
      if (!productId || current.status !== "DRAFT") return;
      try {
        await api(`/api/inventory-v2/stocktakes/${current.id}/lines`, {
          method: "POST",
          body: JSON.stringify({ productId }),
        });
        await reload(current.id);
        setLookup("");
        setTimeout(() => barcodeRef.current?.focus());
      } catch (error) {
        setError(error.message);
      }
    };
    window.addEventListener("mws:product-created", productCreated);
    return () => window.removeEventListener("mws:product-created", productCreated);
  }, [api, current.id, current.status, reload, setError]);

  const choose = (line) => {
    setSelected(line);
    setMatches([]);
    setLookup(line.barcode || line.sku || line.name);
    setQuantity("1");
    setTimeout(() => {
      quantityRef.current?.focus();
      quantityRef.current?.select();
    });
  };

  const find = (event) => {
    event?.preventDefault();
    const term = lookup.trim();
    if (!term) return barcodeRef.current?.focus();
    const candidates = (current.lines || []).filter((line) =>
      matchesGreekSearch(term, [line.name, line.sku, line.barcode]),
    );
    const exact = candidates.find(
      (line) => line.barcode === term || String(line.sku || "") === term,
    );
    if (exact || candidates.length === 1) return choose(exact || candidates[0]);
    setSelected(null);
    setMatches(candidates.slice(0, 12));
    if (!candidates.length) setError(`Δεν βρέθηκε το barcode «${term}». Μπορείς να καταχωρήσεις νέο είδος.`);
  };

  const save = async (event) => {
    event?.preventDefault();
    if (!selected || quantity === "" || !Number.isFinite(Number(quantity))) return;
    setSaving(true);
    setError("");
    try {
      const previous = selected.countedQuantity === null ? 0 : n(selected.countedQuantity);
      await api(`/api/inventory-v2/stocktakes/${current.id}/count`, {
        method: "POST",
        body: JSON.stringify({
          lineId: selected.id,
          quantity: previous + Number(quantity),
          expectedVersion: selected.countVersion,
          clientEventId: crypto.randomUUID(),
          source: "SCANNER",
        }),
      });
      await reload(current.id);
      setLookup("");
      setSelected(null);
      setQuantity("");
      setMatches([]);
      setTimeout(() => barcodeRef.current?.focus());
    } catch (error) {
      setError(error.message);
    } finally {
      setSaving(false);
    }
  };

  const clearCount = async (line) => {
    if (!confirm(`Διαγραφή της καταμέτρησης για «${line.name}»;`)) return;
    try {
      await api(`/api/inventory-v2/stocktakes/${current.id}/count/${line.id}`, {
        method: "DELETE",
        body: JSON.stringify({ expectedVersion: line.countVersion, clientEventId: crypto.randomUUID() }),
      });
      await reload(current.id);
    } catch (error) {
      setError(error.message);
    }
  };

  const createProduct = () => {
    window.dispatchEvent(new CustomEvent("mws:new-product", { detail: { barcode: lookup.trim() } }));
  };

  return (
    <>
      {current.status === "DRAFT" && (
        <section className="inv2-fast-entry">
          <form onSubmit={find}>
            <label>
              <b>1. Σκάναρε barcode ή αναζήτησε είδος</b>
              <span className="inv2-scan-row">
                <Search />
                <input
                  ref={barcodeRef}
                  value={lookup}
                  onChange={(event) => { setLookup(event.target.value); setSelected(null); setMatches([]); }}
                  placeholder="Barcode, SKU ή περιγραφή"
                  autoComplete="off"
                />
                <button type="submit">Αναζήτηση</button>
              </span>
            </label>
            <label>
              <b>2. Νέα ποσότητα που βρήκες</b>
              <span className="inv2-quantity-row">
                <input
                  ref={quantityRef}
                  type="number"
                  min="0"
                  step="0.001"
                  value={quantity}
                  disabled={!selected}
                  onChange={(event) => setQuantity(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "ArrowDown") save(event);
                  }}
                />
                <button type="button" className="primary" disabled={!selected || saving} onClick={save}>
                  {saving ? "Αποθήκευση…" : "Καταχώρηση & επόμενο"}
                </button>
              </span>
            </label>
          </form>
          {selected && (
            <div className="inv2-selected-product">
              <b>{selected.name}</b>
              <span>Απόθεμα {selected.expectedQuantity}</span>
              <span>Αγορά {euro(selected.unitCost)}</span>
              <span>Λιανική {euro(selected.salePrice)}</span>
              {selected.countedQuantity !== null && <strong>Προηγούμενα {selected.countedQuantity} + νέα {n(quantity)} = σύνολο {n(selected.countedQuantity) + n(quantity)}</strong>}
            </div>
          )}
          {matches.length > 1 && (
            <div className="inv2-lookup-results">
              {matches.map((line) => <button key={line.id} onClick={() => choose(line)}><b>{line.name}</b><small>{line.barcode || line.sku || "—"}</small></button>)}
            </div>
          )}
          {!selected && lookup.trim() && matches.length === 0 && (
            <button type="button" className="inv2-new-product" onClick={createProduct}>+ Καταχώρηση νέου είδους με αυτό το barcode</button>
          )}
        </section>
      )}

      <div className="inv2-list-tools">
        <b>{showAll ? "Όλα τα είδη απογραφής" : "Καταμετρημένα είδη"}</b>
        <span>{countedLines.length} από {current.lines.length} καταμετρήθηκαν</span>
        <button type="button" onClick={() => setShowAll((value) => !value)}>{showAll ? "Μόνο καταμετρημένα" : "Εμφάνιση όλων"}</button>
      </div>
      <div className="inv2-table-wrap">
        <table>
          <thead><tr><th>Barcode</th><th>Περιγραφή</th><th>Απόθεμα</th><th>Καταμέτρηση</th><th>Διαφορά</th><th>Αξία λιανικής</th><th>Αξία κόστους</th><th>Ενέργειες</th></tr></thead>
          <tbody>
            {rows.map((line) => {
              const counted = line.countedQuantity === null ? 0 : n(line.countedQuantity);
              return <tr key={line.id} className={line.recountRequired ? "recount" : ""}>
                <td>{line.barcode || "—"}</td>
                <td><b>{line.name}</b><small>{line.sku || "—"} · {line.categoryName || "Χωρίς κατηγορία"}</small></td>
                <td>{line.expectedQuantity}</td><td>{line.countedQuantity ?? "—"}</td><td>{counted - n(line.expectedQuantity)}</td>
                <td>{euro(counted * n(line.salePrice))}</td><td>{euro(counted * n(line.unitCost))}</td>
                <td className="inv2-row-actions">
                  {current.status === "DRAFT" && <><button title="Διόρθωση" onClick={() => choose(line)}><Pencil /></button><button title="Διαγραφή καταμέτρησης" disabled={line.countedQuantity === null} onClick={() => clearCount(line)}><Trash2 /></button></>}
                  <button title="Εκτύπωση barcode" onClick={() => window.print()}><Printer /></button>
                </td>
              </tr>;
            })}
          </tbody>
          <tfoot><tr><th>ΣΥΝΟΛΑ</th><th>{totals.lines} είδη</th><th>{totals.expected}</th><th>{totals.counted}</th><th>{totals.difference}</th><th>{euro(totals.retail)}</th><th>{euro(totals.cost)}</th><th /></tr></tfoot>
        </table>
      </div>
    </>
  );
}
