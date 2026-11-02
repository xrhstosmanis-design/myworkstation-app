import React, { useCallback, useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import {
  Boxes,
  ClipboardCopy,
  Download,
  Printer,
  RefreshCw,
  Share2,
  Smartphone,
} from "lucide-react";
import "./inventory-v2-center.css";
import InventoryMobileApp from "./InventoryMobileApp.jsx";
import InventoryFastCount from "./InventoryFastCount.jsx";
import InventoryReconciliationPanel from "./InventoryReconciliationPanel.jsx";
const num = (v) => Number(v || 0),
  euro = (v) => v===null||v===undefined?'Άγνωστο':`${num(v).toFixed(2)} €`;
export default function InventoryV2Center({
  api,
  stores = [],
  catalog = [],
  loadCatalog,
  delegated = null,
}) {
  const [ownerStocktakes, setStocktakes] = useState([]),
    [ownerCurrent, setCurrent] = useState(null),
    [ownerStoreId, setStoreId] = useState(""),
    [zones, setZones] = useState([]),
    [selectedZones, setSelectedZones] = useState([]),
    [grant, setGrant] = useState(null),
    [grantQr, setGrantQr] = useState(""),
    [finalSummary, setFinalSummary] = useState(null),
    [investigation, setInvestigation] = useState(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [finalizeReason, setFinalizeReason] = useState(""),
    [finalizing, setFinalizing] = useState(false),
    [reviewLocked,setReviewLocked]=useState(false);
  const reviewLockRef=useRef(false);
  const handleReviewLock=useCallback(value=>{reviewLockRef.current=value;setReviewLocked(value);},[]);
  // Controlled personal view uses redacted data and existing scoped writers only.
  // This is presentation, never a substitute for the canonical server grant check.
  const stocktakes = delegated ? delegated.stocktakes : ownerStocktakes;
  const current = delegated ? delegated.current : ownerCurrent;
  const storeId = delegated ? delegated.storeId : ownerStoreId;
  const locked = Boolean(delegated?.locked||reviewLocked);
  const finalizingRef = useRef(false);
  const [mobileView,setMobileView]=useState(false);
  useEffect(()=>setMobileView(false),[current?.id,current?.status]);
  useEffect(() => { setFinalizeReason(current?.scopeType === "FREE" ? "Καταχώρηση καταμετρημένων ειδών" : ""); }, [current?.id, current?.scopeType]);
  const grantUrl = !delegated && grant ? `${window.location.origin}${grant.accessUrl}` : "";
  useEffect(() => {
    if (!grantUrl) return setGrantQr("");
    QRCode.toDataURL(grantUrl, { width: 260, margin: 1, errorCorrectionLevel: "M" })
      .then(setGrantQr)
      .catch(() => setError("Δεν ήταν δυνατή η δημιουργία του QR."));
  }, [grantUrl]);
  const copyGrant = async () => navigator.clipboard.writeText(`${grantUrl}\nPIN: ${grant.pin}`);
  const shareGrant = async () => {
    const text = `MyWorkStation Απογραφή\nPIN: ${grant.pin}`;
    if (navigator.share) await navigator.share({ title: "Πρόσβαση απογραφής", text, url: grantUrl });
    else await navigator.clipboard.writeText(`${text}\n${grantUrl}`);
  };
  const loadList = async () =>
      delegated ? delegated.onLoad() : setStocktakes(await api("/api/inventory-v2/stocktakes")),
    open = async (id) => {
      if(reviewLockRef.current){setError('Επαλήθευσε πρώτα την ενέργεια ελέγχου απογραφής.');return;}
      if (delegated) return locked ? undefined : delegated.onOpen(id);
      const result = await api(`/api/inventory-v2/stocktakes/${id}`);
      setCurrent(result);
      setInvestigation(null);
      if (result.status === "FINALIZED") {
        const report = await api(`/api/inventory-v2/stocktakes/${id}/audit`);
        setFinalSummary(report.summary);
      } else setFinalSummary(null);
      if (result.storeId && result.storeId !== storeId)
        await loadZones(result.storeId);
    };
  useEffect(() => {
    if (delegated) return;
    loadList().catch((e) => setError(e.message));
    loadCatalog?.();
  }, []);
  const loadZones = async (value) => {
    if(reviewLockRef.current)return;
    if (delegated) return;
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
    if(reviewLockRef.current)return;
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
    if(reviewLockRef.current)return;
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
    if(reviewLockRef.current)return;
    setBusy(true);
    setError("");
    const f = new FormData(e.currentTarget);
    try {
      const r = await api("/api/inventory-v2/stocktakes", {
        method: "POST",
        body: JSON.stringify({
          storeId,
          name: f.get("name"),
          scopeType: "FREE",
          liveDuringTrading: f.get("live") === "on",
          recountPolicy: "NONE",
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
  const convertingRef = useRef(false);
  const convertToFree = async () => {
    if (convertingRef.current || current?.status !== "DRAFT" || current.scopeType === "FREE") return;
    if (!confirm("Συνέχεια ως ελεύθερη απογραφή; Οι μετρήσεις διατηρούνται και στην καταχώρηση θα ενημερωθούν μόνο τα καταμετρημένα προϊόντα.")) return;
    convertingRef.current = true; setBusy(true); setError("");
    try {
      await api(`/api/inventory-v2/stocktakes/${current.id}/free`, {method:"POST",body:JSON.stringify({confirmed:true})});
      await open(current.id); await loadList();
    } catch (error) { setError(error.message); }
    finally { convertingRef.current = false; setBusy(false); }
  };
  const deleteStocktake = async (stocktake) => {
    if(reviewLockRef.current)return;
    if (stocktake.status !== "DRAFT" || (delegated && (!delegated.canDelete || locked))) return;
    if (!confirm(`Διαγραφή της μη οριστικοποιημένης απογραφής «${stocktake.name}»;`)) return;
    if (delegated) return delegated.onDelete(stocktake.id);
    try {
      await api(`/api/inventory-v2/stocktakes/${stocktake.id}`, { method: "DELETE" });
      if (current?.id === stocktake.id) {
        setCurrent(null);
        setFinalSummary(null);
      }
      await loadList();
    } catch (x) {
      setError(x.message);
    }
  };
  const finalize = async () => {
    if (finalizingRef.current || current?.status !== "DRAFT") return;
    const reason = finalizeReason.trim();
    if (reason.length < 3 || reason.length > 300) {
      setError("Γράψε αιτιολογία οριστικοποίησης από 3 έως 300 χαρακτήρες.");
      return;
    }
    if (
      !confirm(
        current.scopeType === "FREE" ? `Καταχώρηση ${current.lines.filter(line => line.countedQuantity !== null).length} καταμετρημένων προϊόντων; Θα ενημερωθούν μόνο αυτά τα προϊόντα.` : `Οριστικοποίηση ${current.scopeType === "FULL" ? "πλήρους" : "μερικής"} απογραφής; Θα ενημερωθούν μόνο τα προϊόντα αυτής της απογραφής.`,
      )
    )
      return;
    finalizingRef.current = true;
    setFinalizing(true);
    setError("");
    try {
      await api(`/api/inventory-v2/stocktakes/${current.id}/finalize`, {
        method: "POST",
        body: JSON.stringify({ reason }),
      });
      const report = await api(
        `/api/inventory-v2/stocktakes/${current.id}/audit`,
      );
      setFinalSummary(report.summary);
      await open(current.id);
      await loadList();
    } catch (x) {
      setError(x.message);
    } finally {
      finalizingRef.current = false;
      setFinalizing(false);
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
  const loadInvestigation = async () => {
    setBusy(true);
    setError("");
    try {
      setInvestigation(
        await api(`/api/inventory-v2/stocktakes/${current.id}/investigation`),
      );
    } catch (x) {
      setError(x.message);
    } finally {
      setBusy(false);
    }
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
                `${event.eventType} ${event.actorName} ${new Date(event.createdAt).toLocaleString("el-GR",{timeZone:"Europe/Athens",hour12:false})}`,
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
    if(reviewLockRef.current)return;
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
      {!delegated && error && <div className="op-alert error">{error}</div>}
      {!delegated && current?.status === 'FINALIZED' && <InventoryReconciliationPanel key={`${current.storeId}:${current.id}`} api={api} stocktakeId={current.id} storeId={current.storeId} onReviewLockChange={handleReviewLock} />}
      {!delegated && finalSummary && (
        <div className="inv2-final-summary">
          <div><b>Αρχικό αποτέλεσμα καταμέτρησης</b><small>{finalSummary.countedCount} από {finalSummary.lineCount} είδη</small></div>
          <span><small>Καταμέτρηση</small><b>{finalSummary.countedQuantity}</b></span>
          <span><small>Συνολική διαφορά</small><b>{finalSummary.totalDifference}</b></span>
          <span className="shortage"><small>Έλλειμμα</small><b>{finalSummary.shortageQuantity} · {euro(finalSummary.shortageCostValue)}</b></span>
          <span className="surplus"><small>Πλεόνασμα</small><b>{finalSummary.surplusQuantity} · {euro(finalSummary.surplusCostValue)}</b></span>
          <span><small>Λιανική αξία</small><b>{euro(finalSummary.totalRetailValue)}</b></span>
          <span><small>Αξία κόστους</small><b>{euro(finalSummary.totalCostValue)}</b></span>
          {finalSummary.missingCostItems>0&&<span><small>Είδη χωρίς θετικό κόστος</small><b>{finalSummary.missingCostItems} · μη αποτιμημένα</b></span>}
          <button className="primary" disabled={busy} onClick={loadInvestigation}>Έλεγχος αιτιών διαφορών</button>
          <button onClick={() => setFinalSummary(null)}>Κλείσιμο</button>
        </div>
      )}
      {!delegated && investigation && (
        <section className="inv2-investigation">
          <header>
            <div>
              <h3>Τεκμηριωμένος έλεγχος διαφορών</h3>
              <p>{investigation.disclaimer}</p>
            </div>
            <button onClick={() => setInvestigation(null)}>Κλείσιμο</button>
          </header>
          <div className="inv2-investigation-totals">
            <b>{investigation.summary.differenceItems} είδη με διαφορά</b>
            <span>{investigation.summary.evidenceItems} με ένδειξη προς έλεγχο</span>
            <span>{investigation.summary.shortageItems} ελλείμματα</span>
            <span>{investigation.summary.surplusItems} πλεονάσματα</span>
          </div>
          {investigation.items.length ? investigation.items.map((item) => (
            <article key={item.productId} className={item.reviewStatus === "EVIDENCE_FOUND" ? "has-evidence" : ""}>
              <div className="inv2-investigation-product">
                <b>{item.name}</b>
                <small>{item.barcode || item.sku || "Χωρίς κωδικό"}</small>
                <strong>Διαφορά {item.difference > 0 ? "+" : ""}{item.difference} · {euro(item.differenceCostValue)}</strong>
              </div>
              <div className="inv2-evidence-list">
                {item.evidence.length ? item.evidence.map((row, index) => (
                  <div key={`${row.type}-${row.reference}-${index}`} className={`severity-${row.severity.toLowerCase()}`}>
                    <b>{row.title}</b>
                    <span>{row.details}</span>
                    <small>{new Date(row.at).toLocaleString("el-GR",{timeZone:"Europe/Athens",hour12:false})} · {row.actorName} · {row.reference}</small>
                  </div>
                )) : <p>Δεν βρέθηκε καταγεγραμμένο στοιχείο που να εξηγεί τη διαφορά.</p>}
              </div>
            </article>
          )) : <p>Δεν υπάρχουν διαφορές προς διερεύνηση.</p>}
        </section>
      )}
      <div className="inv2-layout">
        <aside className="op-box">
          <h3>Inventory 2.0</h3>
          {(!delegated || delegated.canCreate) && <div className="inv2-new-buttons">
            <button type="button" disabled={locked} onClick={() => { if (delegated) return delegated.onNew(); setCurrent(null); setFinalSummary(null); setError(""); }}>Νέα απογραφή</button>
          </div>}
          {delegated ? <><p>{delegated.storeName}</p>{delegated.canCreate && delegated.createForm}<button type="button" disabled={locked} onClick={loadList}><RefreshCw/>Φόρτωση / Ανανέωση</button></> : <>
          <form className="op-form" onSubmit={create}>
            <label>
              Κατάστημα
              <select
                name="storeId"
                required
                disabled={locked}
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
                defaultValue={`Απογραφή ${new Date().toLocaleDateString("el-GR",{timeZone:"Europe/Athens"})}`}
              />
            </label>
            <p>Σκάναρε όσα προϊόντα θέλεις και κάνε καταχώρηση όταν τελειώσεις.</p>
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
          </>}
          <h4>Απογραφές</h4>
          {delegated?.listLoaded && !stocktakes.length && <p>Δεν υπάρχουν ανοιχτές απογραφές στο κατάστημα.</p>}
          <div className="inv2-history">
            {stocktakes.map((s) => (
              <div key={s.id} className="inv2-history-row">
                <button className="inv2-history-open" disabled={locked} onClick={() => open(s.id)}>
                  <b>{s.name}</b>
                  <small>{delegated ? s.status || "Ανοιχτή απογραφή" : <>{s.scopeType === "FREE" ? "Απογραφή" : s.scopeType === "FULL" ? "Πλήρης" : "Μερική"} · {s.scopeType === "FREE" ? `${s.countedCount} είδη` : `${s.countedCount}/${s.lineCount}`}</>}</small>
                </button>
                {(!delegated || delegated.canDelete) && s.status === "DRAFT" && <button className="inv2-history-delete" disabled={locked} title="Διαγραφή μη οριστικοποιημένης απογραφής" onClick={() => deleteStocktake(s)}>×</button>}
              </div>
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
                    {delegated ? `${current.name} · ${delegated.storeName} · ${current.status}` : <>{current.storeName} ·{" "}
                    {current.scopeType === "FREE" ? "Απογραφή" : current.scopeType === "FULL" ? "Πλήρης" : "Μερική απογραφή"}{" "}
                    · {current.status}</>}
                  </small>
                </div>
                <div className="inv2-actions">
                  {!delegated && current.status === "DRAFT" && <button type="button" onClick={()=>setMobileView(v=>!v)}><Smartphone/>{mobileView?"Προβολή υπολογιστή":"Προβολή κινητού / tablet"}</button>}
                  <button disabled={locked} onClick={() => open(current.id)}>
                    <RefreshCw />
                    Ανανέωση
                  </button>
                  {!delegated && <>
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
                  </button></>}
                </div>
              </header>
              {!delegated && current.status === "DRAFT" && current.scopeType !== "FREE" && <button type="button" disabled={busy} onClick={convertToFree}>Συνέχεια ως ελεύθερη απογραφή</button>}
              {!delegated && current.status === "DRAFT" && (
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
                    <section className="inv2-grant-result">
                      {grantQr && <img src={grantQr} alt="QR πρόσβασης απογραφής" />}
                      <div>
                        <b>Έτοιμη πρόσβαση απογραφέα</b>
                        <strong className="inv2-grant-pin">PIN: {grant.pin}</strong>
                        <small>Σκάναρε το QR από κινητό ή tablet και πληκτρολόγησε το PIN.</small>
                        <a href={grantUrl} target="_blank" rel="noreferrer">Άνοιγμα συνδέσμου</a>
                        <span className="inv2-grant-actions">
                          <button type="button" onClick={copyGrant}><ClipboardCopy /> Αντιγραφή link & PIN</button>
                          <button type="button" onClick={shareGrant}><Share2 /> Αποστολή</button>
                        </span>
                      </div>
                    </section>
                  )}
                </form>
              )}
              {!delegated && mobileView?<div className="inv2-mobile-preview"><InventoryMobileApp key={current.id} api={api} stocktakeId={current.id}/></div>:<InventoryFastCount key={delegated ? current.id : undefined} api={api} current={current} reload={open} setError={delegated ? delegated.setError : setError} delegated={delegated ? {canCount:delegated.canCount,canClear:delegated.canClear,canBulkZero:delegated.canBulkZero,onClear:delegated.onClear,onBulkZero:delegated.onBulkZero,canSeeExpected:delegated.canFinalize,locked,onCount:delegated.onCount} : null} />}
              <footer>
                {delegated ? (delegated.canFinalize ? delegated.finalizationForm : null) : <>
                <span>
                  <Smartphone />
                  QR/PIN και πολλαπλοί καταμετρητές
                </span>
                {current.status === "DRAFT" ? (
                  <div className="inv2-finalization">
                    <label>
                      Αιτιολογία οριστικοποίησης
                      <textarea value={finalizeReason} maxLength={300} required disabled={finalizing}
                        onChange={(event) => setFinalizeReason(event.target.value)}
                        placeholder="Τεκμηρίωσε τον έλεγχο και τις διαφορές της απογραφής" />
                    </label>
                    <button className="primary" onClick={finalize}
                      disabled={finalizing || finalizeReason.trim().length < 3 || (current.scopeType === "FREE" && !current.lines.some(line => line.countedQuantity !== null))}>
                      {finalizing ? (current.scopeType === "FREE" ? "Καταχώρηση…" : "Οριστικοποίηση…") : current.scopeType === "FREE" ? "Καταχώρηση απογραφής" : "Οριστικοποίηση & αποτέλεσμα απογραφής"}
                    </button>
                  </div>
                ) : current.snapshotJson?.reason ? (
                  <p className="inv2-finalization-reason"><b>Αιτιολογία οριστικοποίησης:</b> {current.snapshotJson.reason}</p>
                ) : null}</>}
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
