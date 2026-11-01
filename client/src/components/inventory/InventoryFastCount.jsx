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

export default function InventoryFastCount({ api, current, reload, setError, delegated = null }) {
  const canCount = !delegated || delegated.canCount === true;
  const locked = Boolean(delegated?.locked);
  const showExpected = !delegated || (delegated.canSeeExpected === true && (current.lines || []).length > 0 && current.lines.every(line => line.expectedQuantity !== undefined));
  const showValues = !delegated;
  const barcodes = line => delegated ? (line.barcodes || []) : [line.barcode];
  const displayBarcode = line => barcodes(line)[0] || "";
  const barcodeRef = useRef(null);
  const quantityRef = useRef(null);
  const [lookup, setLookup] = useState("");
  const [selected, setSelected] = useState(null);
  const [quantity, setQuantity] = useState("");
  const [replaceCount, setReplaceCount] = useState(false);
  const [showAll, setShowAll] = useState(Boolean(delegated) || current.status !== "DRAFT");
  const [matches, setMatches] = useState([]);
  const [saving, setSaving] = useState(false);
  const [selectedIds, setSelectedIds] = useState(() => new Set());

  const countedLines = useMemo(
    () => (current.lines || [])
      .filter((line) => line.countedQuantity !== null)
      .sort((a, b) => new Date(b.countedAt || 0) - new Date(a.countedAt || 0)),
    [current.lines],
  );
  const rows = useMemo(() => {
    const base = showAll
      ? [...(current.lines || [])].sort((a, b) => {
          if (a.countedQuantity !== null && b.countedQuantity === null) return -1;
          if (a.countedQuantity === null && b.countedQuantity !== null) return 1;
          return new Date(b.countedAt || 0) - new Date(a.countedAt || 0);
        })
      : countedLines;
    return base.filter((line) =>
      matchesGreekSearch(lookup, [line.name, line.sku, ...barcodes(line)]),
    );
  }, [current.lines, countedLines, lookup, showAll, Boolean(delegated)]);
  const totals = useMemo(() => inventoryTotals(rows), [rows]);
  const selectedRows = useMemo(() => (current.lines || []).filter((line) => selectedIds.has(line.id)), [current.lines, selectedIds]);
  const allVisibleSelected = rows.length > 0 && rows.every((line) => selectedIds.has(line.id));

  useEffect(() => {
    if (canCount && !locked && current.status === "DRAFT") barcodeRef.current?.focus();
  }, [current.id, current.status, canCount, locked]);

  useEffect(() => {
    if (delegated) return;
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
  }, [api, current.id, current.status, reload, setError, Boolean(delegated)]);

  const choose = (line, replace = false) => {
    if (!canCount || locked) return;
    setSelected(line);
    setMatches([]);
    setLookup(displayBarcode(line) || line.sku || line.name);
    setReplaceCount(replace);
    setQuantity(replace ? String(line.countedQuantity ?? 0) : "1");
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
      matchesGreekSearch(term, [line.name, line.sku, ...barcodes(line)]),
    );
    const exact = candidates.find(
      (line) => barcodes(line).includes(term) || String(line.sku || "") === term,
    );
    if (exact || candidates.length === 1) return choose(exact || candidates[0]);
    setSelected(null);
    setMatches(candidates.slice(0, 12));
    if (!candidates.length) setError(`Δεν βρέθηκε το barcode «${term}». Μπορείς να καταχωρήσεις νέο είδος.`);
  };

  const save = async (event) => {
    event?.preventDefault();
    if (!canCount || locked || saving || !selected || quantity === "" || !Number.isFinite(Number(quantity))) return;
    if (delegated && !/^[0-9]{1,9}(?:\.[0-9]{1,4})?$/.test(quantity)) return setError("Συμπλήρωσε έγκυρη μη αρνητική ποσότητα.");
    setSaving(true);
    setError("");
    try {
      const previous = selected.countedQuantity === null ? 0 : n(selected.countedQuantity);
      const body = {
          lineId: selected.id,
          quantity: replaceCount ? Number(quantity) : previous + Number(quantity),
          expectedVersion: selected.countVersion,
          clientEventId: crypto.randomUUID(),
          source: replaceCount ? "BACKOFFICE" : "SCANNER",
      };
      if (delegated) {
        const confirmed = await delegated.onCount({stocktakeId:current.id,body});
        if (confirmed !== true) return;
      } else {
      await api(`/api/inventory-v2/stocktakes/${current.id}/count`, {
        method: "POST",
        body: JSON.stringify(body),
      });
      await reload(current.id);
      }
      setLookup("");
      setSelected(null);
      setQuantity("");
      setReplaceCount(false);
      setMatches([]);
      setTimeout(() => barcodeRef.current?.focus());
    } catch (error) {
      setError(error.message);
    } finally {
      setSaving(false);
    }
  };

  const clearCount = async (line) => {
    if (delegated) return;
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

  const toggleLine = (lineId) => setSelectedIds((previous) => {
    const next = new Set(previous);
    if (next.has(lineId)) next.delete(lineId); else next.add(lineId);
    return next;
  });

  const toggleAllVisible = () => setSelectedIds((previous) => {
    const next = new Set(previous);
    if (allVisibleSelected) rows.forEach((line) => next.delete(line.id));
    else rows.forEach((line) => next.add(line.id));
    return next;
  });

  const bulkZero = async () => {
    if (delegated) return;
    if (!selectedRows.length || !confirm(`Να καταχωριστεί ποσότητα 0 σε ${selectedRows.length} επιλεγμένα είδη; Το stock θα αλλάξει μόνο μετά την οριστικοποίηση της απογραφής.`)) return;
    setSaving(true);
    setError("");
    try {
      await api(`/api/inventory-v2/stocktakes/${current.id}/count/bulk-zero`, {
        method: "POST",
        body: JSON.stringify({
          lines: selectedRows.map((line) => ({ lineId: line.id, expectedVersion: line.countVersion })),
          clientBatchId: crypto.randomUUID(),
        }),
      });
      setSelectedIds(new Set());
      await reload(current.id);
    } catch (error) {
      setError(error.message);
      await reload(current.id);
    } finally {
      setSaving(false);
    }
  };

  const createProduct = () => {
    if (delegated) return;
    window.dispatchEvent(new CustomEvent("mws:new-product", { detail: { barcode: lookup.trim() } }));
  };

  return (
    <>
      {canCount && current.status === "DRAFT" && (
        <section className="inv2-fast-entry">
          <form onSubmit={find}>
            <label>
              <b>1. Σκάναρε barcode ή αναζήτησε είδος</b>
              <span className="inv2-scan-row">
                <Search />
                <input
                  disabled={locked || saving}
                  ref={barcodeRef}
                  value={lookup}
                  onChange={(event) => { setLookup(event.target.value); setSelected(null); setMatches([]); }}
                  placeholder="Barcode, SKU ή περιγραφή"
                  autoComplete="off"
                />
                <button type="submit" disabled={locked || saving}>Αναζήτηση</button>
              </span>
            </label>
            <label>
              <b>{replaceCount ? "2. Διόρθωση συνολικής καταμέτρησης" : "2. Νέα ποσότητα που βρήκες"}</b>
              <span className="inv2-quantity-row">
                <input
                  name="quantity"
                  aria-label="Ποσότητα καταμέτρησης"
                  ref={quantityRef}
                  type="number"
                  min="0"
                  step={delegated ? "0.0001" : "0.001"}
                  value={quantity}
                  disabled={!selected || locked || saving}
                  onChange={(event) => setQuantity(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "ArrowDown") save(event);
                  }}
                />
                <button type="button" className="primary" disabled={!selected || locked || saving} onClick={save}>
                  {saving ? "Αποθήκευση…" : "Καταχώρηση & επόμενο"}
                </button>
              </span>
            </label>
          </form>
          {selected && (
            <div className="inv2-selected-product">
              <b>{selected.name}</b>
              {showExpected && <span>Απόθεμα {selected.expectedQuantity}</span>}
              {showValues && <><span>Αγορά {euro(selected.unitCost)}</span>
              <span>Λιανική {euro(selected.salePrice)}</span></>}
              {replaceCount ? <strong>Αντικατάσταση καταμέτρησης {selected.countedQuantity ?? "—"} με {n(quantity)}</strong> : selected.countedQuantity !== null && <strong>Προηγούμενα {selected.countedQuantity} + νέα {n(quantity)} = σύνολο {n(selected.countedQuantity) + n(quantity)}</strong>}
            </div>
          )}
          {matches.length > 1 && (
            <div className="inv2-lookup-results">
              {matches.map((line) => <button key={line.id} disabled={locked || saving} onClick={() => choose(line)}><b>{line.name}</b><small>{displayBarcode(line) || line.sku || "—"}</small></button>)}
            </div>
          )}
          {!delegated && !selected && lookup.trim() && matches.length === 0 && (
            <button type="button" className="inv2-new-product" onClick={createProduct}>+ Καταχώρηση νέου είδους με αυτό το barcode</button>
          )}
        </section>
      )}

      {delegated && !canCount && <label>Αναζήτηση είδους<input aria-label="Αναζήτηση είδους" value={lookup} disabled={locked} onChange={event => setLookup(event.target.value)} /></label>}
      <div className="inv2-list-tools">
        <b>{showAll ? "Όλα τα είδη απογραφής" : "Καταμετρημένα είδη"}</b>
        <span>{(delegated || current.scopeType === "FREE") ? `${countedLines.length} καταμετρημένα είδη` : `${countedLines.length} από ${current.lines.length} καταμετρήθηκαν`}</span>
        <button type="button" disabled={locked} onClick={() => setShowAll((value) => !value)}>{showAll ? "Μόνο καταμετρημένα" : "Εμφάνιση όλων"}</button>
      </div>
      {!delegated && current.status === "DRAFT" && (
        <div className="inv2-bulk-tools">
          <label><input type="checkbox" checked={allVisibleSelected} onChange={toggleAllVisible} /> Επιλογή όλων των εμφανιζόμενων</label>
          <span>{selectedRows.length} επιλεγμένα</span>
          <button type="button" disabled={!selectedRows.length || saving} onClick={bulkZero}>{saving ? "Καταχώρηση…" : "Ομαδική καταμέτρηση: Μηδενισμός"}</button>
        </div>
      )}
      <div className="inv2-table-wrap">
        <table>
          <thead><tr>{!delegated && <th className="inv2-select-column">Επιλογή</th>}<th>Barcode</th><th>Περιγραφή</th>{showExpected && <th>Απόθεμα</th>}<th>Καταμέτρηση</th>{showExpected && <th>Διαφορά</th>}{showValues && <><th>Αξία λιανικής</th><th>Αξία κόστους</th></>}<th>Ενέργειες</th></tr></thead>
          <tbody>
            {rows.map((line) => {
              const counted = line.countedQuantity === null ? 0 : n(line.countedQuantity);
              return <tr key={line.id} className={line.recountRequired ? "recount" : ""}>
                {!delegated && <td className="inv2-select-column"><input type="checkbox" checked={selectedIds.has(line.id)} onChange={() => toggleLine(line.id)} aria-label={`Επιλογή ${line.name}`} /></td>}
                <td>{displayBarcode(line) || "—"}</td>
                <td><b>{line.name}</b><small>{line.sku || "—"} · {line.categoryName || "Χωρίς κατηγορία"}</small></td>
                {showExpected && <td>{line.expectedQuantity}</td>}<td>{line.countedQuantity ?? "—"}</td>{showExpected && <td>{counted - n(line.expectedQuantity)}</td>}
                {showValues && <><td>{euro(counted * n(line.salePrice))}</td><td>{euro(counted * n(line.unitCost))}</td></>}
                <td className="inv2-row-actions">
                  {canCount && current.status === "DRAFT" && <><button title="Διόρθωση" disabled={locked || saving} onClick={() => choose(line, true)}><Pencil /></button>{!delegated && <button title="Διαγραφή καταμέτρησης" disabled={line.countedQuantity === null} onClick={() => clearCount(line)}><Trash2 /></button>}</>}
                  {!delegated && <button title="Εκτύπωση barcode" onClick={() => window.print()}><Printer /></button>}
                </td>
              </tr>;
            })}
          </tbody>
          <tfoot><tr>{!delegated && <th />}<th>ΣΥΝΟΛΑ</th><th>{totals.lines} είδη</th>{showExpected && <th>{totals.expected}</th>}<th>{totals.counted}</th>{showExpected && <th>{totals.difference}</th>}{showValues && <><th>{euro(totals.retail)}</th><th>{euro(totals.cost)}</th></>}<th /></tr></tfoot>
        </table>
      </div>
    </>
  );
}
