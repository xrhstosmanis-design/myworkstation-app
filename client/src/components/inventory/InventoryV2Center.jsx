import React, { useEffect, useMemo, useState } from "react";
import {
  Boxes,
  Download,
  Printer,
  RefreshCw,
  Search,
  Smartphone,
} from "lucide-react";
import "./inventory-v2-center.css";
const num = (v) => Number(v || 0),
  euro = (v) => `${num(v).toFixed(2)} €`;
export default function InventoryV2Center({
  api,
  stores = [],
  catalog = [],
  loadCatalog,
}) {
  const [scope, setScope] = useState("FULL"),
    [selected, setSelected] = useState([]),
    [stocktakes, setStocktakes] = useState([]),
    [current, setCurrent] = useState(null),
    [storeId, setStoreId] = useState(""),
    [zones, setZones] = useState([]),
    [selectedZones, setSelectedZones] = useState([]),
    [grant, setGrant] = useState(null),
    [finalSummary, setFinalSummary] = useState(null),
    [query, setQuery] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const visible = useMemo(() => {
    const q = query.trim().toLocaleLowerCase("el");
    return (current?.lines || []).filter(
      (x) =>
        !q ||
        `${x.name} ${x.sku || ""} ${x.barcode || ""}`
          .toLocaleLowerCase("el")
          .includes(q),
    );
  }, [current, query]);
  const loadList = async () =>
      setStocktakes(await api("/api/inventory-v2/stocktakes")),
    open = async (id) => {
      const result = await api(`/api/inventory-v2/stocktakes/${id}`);
      setCurrent(result);
      if (result.storeId && result.storeId !== storeId)
        await loadZones(result.storeId);
    };
  useEffect(() => {
    loadList().catch((e) => setError(e.message));
    loadCatalog?.();
  }, []);
  const loadZones = async (value) => {
    setStoreId(value);
    setSelectedZones([]);
    setZones(
      value
        ? await api(
            `/api/inventory-v2/zones?storeId=${encodeURIComponent(value)}`,
          )
        : [],
    );
  };
  const createZone = async (e) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    try {
      await api("/api/inventory-v2/zones", {
        method: "POST",
        body: JSON.stringify({
          storeId,
          code: f.get("code"),
          name: f.get("name"),
        }),
      });
      e.currentTarget.reset();
      await loadZones(storeId);
    } catch (x) {
      setError(x.message);
    }
  };
  const createGrant = async (e) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    try {
      setGrant(
        await api(`/api/inventory-v2/stocktakes/${current.id}/access-grants`, {
          method: "POST",
          body: JSON.stringify({
            displayName: f.get("displayName"),
            zoneId: f.get("zoneId") || null,
            expiresMinutes: 480,
            maxUses: 10,
          }),
        }),
      );
    } catch (x) {
      setError(x.message);
    }
  };
  const create = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    const f = new FormData(e.currentTarget);
    try {
      const r = await api("/api/inventory-v2/stocktakes", {
        method: "POST",
        body: JSON.stringify({
          storeId,
          name: f.get("name"),
          scopeType: scope,
          productIds: scope === "PARTIAL_PRODUCTS" ? selected : [],
          liveDuringTrading: f.get("live") === "on",
          recountPolicy: f.get("recountPolicy"),
          zoneIds: selectedZones,
        }),
      });
      await loadList();
      await open(r.id);
    } catch (x) {
      setError(x.message);
    } finally {
      setBusy(false);
    }
  };
  const count = async (line, value) => {
    try {
      await api(`/api/inventory-v2/stocktakes/${current.id}/count`, {
        method: "POST",
        body: JSON.stringify({
          lineId: line.id,
          quantity: Number(value),
          expectedVersion: line.countVersion,
          clientEventId: crypto.randomUUID(),
          source: "BACKOFFICE",
        }),
      });
      await open(current.id);
    } catch (x) {
      setError(x.message);
    }
  };
  const finalize = async () => {
    if (
      !confirm(
        `Οριστικοποίηση ${current.scopeType === "FULL" ? "πλήρους" : "μερικής"} απογραφής; Θα ενημερωθούν μόνο τα προϊόντα αυτής της απογραφής.`,
      )
    )
      return;
    try {
      await api(`/api/inventory-v2/stocktakes/${current.id}/finalize`, {
        method: "POST",
        body: "{}",
      });
      const report = await api(
        `/api/inventory-v2/stocktakes/${current.id}/audit`,
      );
      setFinalSummary(report.summary);
      await open(current.id);
      await loadList();
    } catch (x) {
      setError(x.message);
    }
  };
  const exportCsv = () => {
    const rows = [
        [
          "Barcode",
          "SKU",
          "Περιγραφή",
          "Απόθεμα",
          "Καταμέτρηση",
          "Διαφορά",
          "Κόστος",
        ],
        ...(current?.lines || []).map((x) => [
          x.barcode || "",
          x.sku || "",
          x.name,
          x.expectedQuantity,
          x.countedQuantity ?? "",
          num(x.countedQuantity) - num(x.expectedQuantity),
          x.unitCost,
        ]),
      ],
      blob = new Blob(
        [
          "\ufeff" +
            rows
              .map((r) =>
                r.map((v) => `"${String(v).replaceAll('"', '""')}"`).join(";"),
              )
              .join("\n"),
        ],
        { type: "text/csv;charset=utf-8" },
      ),
      a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `inventory-${current.id}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  const exportAudit = async () => {
    try {
      const report = await api(
        `/api/inventory-v2/stocktakes/${current.id}/audit`,
      );
      const rows = [
        [
          "SKU",
          "Barcode",
          "Περιγραφή",
          "Ζώνη",
          "Θεωρητικό",
          "Καταμέτρηση",
          "Διαφορά",
          "Κόστος",
          "Αξία διαφοράς",
          "Καταμετρητής",
          "Πηγή",
          "Συμβάντα",
        ],
        ...report.lines.map((line) => [
          line.sku || "",
          line.barcode || "",
          line.name,
          line.zoneName || "",
          line.expectedQuantity,
          line.countedQuantity ?? "",
          line.difference ?? "",
          line.unitCost,
          line.differenceValue ?? "",
          line.countedBy,
          line.countSource || "",
          line.events
            .map(
              (event) =>
                `${event.eventType} ${event.actorName} ${new Date(event.createdAt).toLocaleString("el-GR")}`,
            )
            .join(" | "),
        ]),
      ];
      const blob = new Blob(
          [
            "\ufeff" +
              rows
                .map((row) =>
                  row
                    .map(
                      (value) =>
                        `"${String(value ?? "").replaceAll('"', '""')}"`,
                    )
                    .join(";"),
                )
                .join("\n"),
          ],
          { type: "text/csv;charset=utf-8" },
        ),
        link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `inventory-full-audit-${current.id}.csv`;
      link.click();
      URL.revokeObjectURL(link.href);
    } catch (x) {
      setError(x.message);
    }
  };
  const importCounts = async (file) => {
    if (!file || !current) return;
    setError("");
    try {
      const text = await file.text();
      const lines = text
        .replace(/^\ufeff/, "")
        .split(/\r?\n/)
        .filter(Boolean);
      const delimiter = lines[0]?.includes(";") ? ";" : ",";
      const cells = (line) =>
        line
          .split(delimiter)
          .map((value) => value.trim().replace(/^"|"$/g, ""));
      const headers = cells(lines.shift() || "").map((x) =>
        x.toLocaleLowerCase("el"),
      );
      const index = (names) =>
        headers.findIndex((h) => names.some((name) => h.includes(name)));
      const barcodeIndex = index(["barcode", "ean"]),
        skuIndex = index(["sku", "κωδ"]),
        quantityIndex = index(["καταμέτρηση", "ποσότητα", "quantity", "count"]);
      if (quantityIndex < 0 || (barcodeIndex < 0 && skuIndex < 0))
        throw new Error(
          "Το αρχείο χρειάζεται Barcode ή SKU και Καταμέτρηση/Ποσότητα.",
        );
      const rows = lines
        .map(cells)
        .map((row) => ({
          barcode: barcodeIndex < 0 ? "" : row[barcodeIndex] || "",
          sku: skuIndex < 0 ? "" : row[skuIndex] || "",
          quantity: Number(String(row[quantityIndex] || "0").replace(",", ".")),
        }))
        .filter(
          (row) => (row.barcode || row.sku) && Number.isFinite(row.quantity),
        );
      const result = await api(
        `/api/inventory-v2/stocktakes/${current.id}/import-counts`,
        { method: "POST", body: JSON.stringify({ rows }) },
      );
      if (result.missingCount)
        setError(
          `Εισήχθησαν ${result.imported}. Δεν βρέθηκαν ${result.missingCount} κωδικοί.`,
        );
      await open(current.id);
    } catch (x) {
      setError(x.message);
    }
  };
  return (
    <div className="inv2">
      {error && <div className="op-alert error">{error}</div>}
      {finalSummary && (
        <div className="inv2-final-summary">
          <b>Η απογραφή οριστικοποιήθηκε</b>
          <span>
            {finalSummary.lineCount} είδη · διαφορά{" "}
            {finalSummary.totalDifference} · αξία διαφοράς{" "}
            {euro(finalSummary.totalDifferenceValue)}
          </span>
          <button onClick={() => setFinalSummary(null)}>Κλείσιμο</button>
        </div>
      )}
      <div className="inv2-layout">
        <aside className="op-box">
          <h3>Inventory 2.0</h3>
          <div className="inv2-new-buttons">
            <button
              type="button"
              className={scope === "FULL" ? "active" : ""}
              onClick={() => {
                setScope("FULL");
                setSelected([]);
              }}
            >
              Νέα Ολική Απογραφή
            </button>
            <button
              type="button"
              className={scope === "PARTIAL_PRODUCTS" ? "active" : ""}
              onClick={() => {
                setScope("PARTIAL_PRODUCTS");
                setSelected([]);
              }}
            >
              Νέα Μερική Απογραφή
            </button>
          </div>
          <form className="op-form" onSubmit={create}>
            <label>
              Κατάστημα
              <select
                name="storeId"
                required
                value={storeId}
                onChange={(e) => loadZones(e.target.value)}
              >
                <option value="">Επιλογή</option>
                {stores
                  .filter((s) => s.active !== false)
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
              </select>
            </label>
            {storeId && (
              <div className="inv2-zones">
                <b>Ζώνες απογραφής</b>
                {zones.map((zone) => (
                  <label key={zone.id}>
                    <input
                      type="checkbox"
                      checked={selectedZones.includes(zone.id)}
                      onChange={(e) =>
                        setSelectedZones((value) =>
                          e.target.checked
                            ? [...value, zone.id]
                            : value.filter((id) => id !== zone.id),
                        )
                      }
                    />
                    {zone.code} · {zone.name}
                  </label>
                ))}
              </div>
            )}
            <label>
              Ονομασία
              <input
                name="name"
                required
                defaultValue={`Απογραφή ${new Date().toLocaleDateString("el-GR")}`}
              />
            </label>
            <div className="op-alert info">
              Τύπος:{" "}
              <b>{scope === "FULL" ? "Ολική απογραφή" : "Μερική απογραφή"}</b>
            </div>
            {scope === "PARTIAL_PRODUCTS" && (
              <div className="inv2-products">
                {catalog.map((p) => (
                  <label key={p.id}>
                    <input
                      type="checkbox"
                      checked={selected.includes(p.id)}
                      onChange={(e) =>
                        setSelected((v) =>
                          e.target.checked
                            ? [...v, p.id]
                            : v.filter((id) => id !== p.id),
                        )
                      }
                    />
                    <span>
                      {p.name}
                      <small>{p.sku || "—"}</small>
                    </span>
                  </label>
                ))}
              </div>
            )}
            <label>
              Επανακαταμέτρηση
              <select name="recountPolicy" defaultValue="DIFFERENCES">
                <option value="DIFFERENCES">Μόνο στις διαφορές</option>
                <option value="ALL">Σε όλα τα είδη</option>
                <option value="NONE">Χωρίς υποχρεωτική</option>
              </select>
            </label>
            <label className="check">
              <input name="live" type="checkbox" />
              Ζωντανή απογραφή με ανοικτό κατάστημα
            </label>
            <button className="primary" disabled={busy}>
              <Boxes />
              Έναρξη
            </button>
          </form>
          {storeId && (
            <form className="inv2-zone-create" onSubmit={createZone}>
              <h4>Νέα ζώνη</h4>
              <input name="code" placeholder="π.χ. ΡΑΦΙ-A" required />
              <input name="name" placeholder="Ονομασία ζώνης" required />
              <button>Προσθήκη</button>
            </form>
          )}
          <h4>Απογραφές</h4>
          <div className="inv2-history">
            {stocktakes.map((s) => (
              <button key={s.id} onClick={() => open(s.id)}>
                <b>{s.name}</b>
                <small>
                  {s.scopeType === "FULL" ? "Πλήρης" : "Μερική"} ·{" "}
                  {s.countedCount}/{s.lineCount}
                </small>
              </button>
            ))}
          </div>
        </aside>
        <section className="op-box inv2-work">
          {current ? (
            <>
              <header>
                <div>
                  <h3>Προσωρινή απογραφή ειδών αποθήκης</h3>
                  <small>
                    {current.storeName} ·{" "}
                    {current.scopeType === "FULL"
                      ? "Πλήρης"
                      : "Μερική απογραφή"}{" "}
                    · {current.status}
                  </small>
                </div>
                <div className="inv2-actions">
                  <button onClick={() => open(current.id)}>
                    <RefreshCw />
                    Ανανέωση
                  </button>
                  <button onClick={exportCsv}>
                    <Download />
                    Excel / CSV
                  </button>
                  <button onClick={exportAudit}>
                    <Download />
                    Full Audit
                  </button>
                  {current.status === "DRAFT" && (
                    <label className="inv2-import">
                      <Download />
                      Εισαγωγή CSV
                      <input
                        type="file"
                        accept=".csv,text/csv"
                        onChange={(e) => importCounts(e.target.files?.[0])}
                      />
                    </label>
                  )}
                  <button onClick={() => window.print()}>
                    <Printer />
                    Εκτύπωση
                  </button>
                </div>
              </header>
              <div className="inv2-search">
                <Search />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Barcode, SKU ή περιγραφή"
                />
                <span>{visible.length} είδη</span>
              </div>
              {current.status === "DRAFT" && (
                <form className="inv2-grant" onSubmit={createGrant}>
                  <b>QR/PIN καταμετρητή</b>
                  <input
                    name="displayName"
                    placeholder="Όνομα καταμετρητή"
                    required
                  />
                  <select name="zoneId">
                    <option value="">Όλες οι ζώνες</option>
                    {zones.map((zone) => (
                      <option key={zone.id} value={zone.id}>
                        {zone.name}
                      </option>
                    ))}
                  </select>
                  <button>Έκδοση πρόσβασης</button>
                  {grant && (
                    <span>
                      PIN: <strong>{grant.pin}</strong> ·{" "}
                      <a
                        href={grant.accessUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Άνοιγμα / QR link
                      </a>
                    </span>
                  )}
                </form>
              )}
              <div className="inv2-table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Barcode</th>
                      <th>Περιγραφή</th>
                      <th>Απόθεμα</th>
                      <th>Καταμέτρηση</th>
                      <th>Διαφορά</th>
                      <th>Αξία απογραφής</th>
                      <th>Κατάσταση</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visible.map((line) => {
                      const diff =
                        (line.countedQuantity ?? line.expectedQuantity) -
                        line.expectedQuantity;
                      return (
                        <tr
                          key={line.id}
                          className={line.recountRequired ? "recount" : ""}
                        >
                          <td>{line.barcode || "—"}</td>
                          <td>
                            <b>{line.name}</b>
                            <small>{line.sku || "—"}</small>
                          </td>
                          <td>{line.expectedQuantity}</td>
                          <td>
                            {current.status === "DRAFT" ? (
                              <input
                                type="number"
                                min="0"
                                step="0.001"
                                defaultValue={line.countedQuantity ?? ""}
                                onBlur={(e) =>
                                  e.target.value !== "" &&
                                  count(line, e.target.value)
                                }
                              />
                            ) : (
                              line.countedQuantity
                            )}
                          </td>
                          <td>{diff}</td>
                          <td>
                            {euro(
                              (line.countedQuantity ?? line.expectedQuantity) *
                                line.unitCost,
                            )}
                          </td>
                          <td>
                            {line.recountRequired
                              ? "Χρειάζεται επανακαταμέτρηση"
                              : line.countedQuantity === null
                                ? "Αναμονή"
                                : "Μετρήθηκε"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <footer>
                <span>
                  <Smartphone />
                  QR/PIN και πολλαπλοί καταμετρητές
                </span>
                {current.status === "DRAFT" && (
                  <button className="primary" onClick={finalize}>
                    Οριστικοποίηση & ενημέρωση αποθήκης
                  </button>
                )}
              </footer>
            </>
          ) : (
            <div className="empty">Επίλεξε ή ξεκίνησε απογραφή.</div>
          )}
        </section>
      </div>
    </div>
  );
}
