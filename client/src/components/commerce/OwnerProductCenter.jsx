import React, { useEffect, useMemo, useState } from "react";
import {
  BadgePercent,
  Boxes,
  Check,
  ClipboardList,
  PackageSearch,
  RefreshCw,
  Search,
  Store,
  Tag,
  Upload,
} from "lucide-react";
import "./owner-products.css";
import "./commercial-tools.css";
import InventoryV2Center from "../inventory/InventoryV2Center.jsx";
import ProductPreparationEditor from "./ProductPreparationEditor.jsx";

const money = (v) =>
  v === null || v === undefined || v === "" ? "—" : `${Number(v).toFixed(2)} €`;
const n = (v) => Number(v || 0);
const barcodeLooksValid = (value) =>
  /^\d{8,14}$/.test(String(value || "").trim());
const activeStoreSalePrices = (product) =>
  (product.stores || [])
    .filter((store) => store.active && n(store.salePrice) > 0)
    .map((store) => n(store.salePrice));
const effectiveSalePrice = (product) => {
  const storePrices = activeStoreSalePrices(product);
  return storePrices.length === 1 ? storePrices[0] : n(product.salePrice);
};
const productQualityIssues = (product) => {
  const issues = [];
  const storePrices = activeStoreSalePrices(product),
    sales = storePrices.length ? storePrices : [n(product.salePrice)],
    cost = n(product.costPrice),
    barcodes = product.barcodes || [];
  if (!String(product.sku || "").trim()) issues.push("Χωρίς SKU");
  if (!String(product.categoryName || "").trim())
    issues.push("Χωρίς κατηγορία");
  if (!String(product.subcategoryName || "").trim())
    issues.push("Χωρίς υποκατηγορία");
  if (!product.hasSupplier && !String(product.supplierName || "").trim())
    issues.push("Χωρίς προμηθευτή");
  if (!["PIECE", "KG", "LITER", "PACKAGE"].includes(String(product.unit || "")))
    issues.push("Μονάδα μη ορισμένη");
  if (cost <= 0) issues.push("Αναμονή πρώτης αγοράς");
  if (!sales.some((sale) => sale > 0)) issues.push("Χωρίς λιανική");
  if (cost > 0 && sales.some((sale) => sale > 0 && cost >= sale))
    issues.push("Κόστος ≥ λιανική");
  if (!product.vatVerified) issues.push("ΦΠΑ μη επιβεβαιωμένος");
  if (!barcodes.length) issues.push("Χωρίς barcode");
  if (barcodes.some((row) => !barcodeLooksValid(row.barcode)))
    issues.push("Μη έγκυρο barcode");
  const numericBarcode = barcodes.find((row) =>
    barcodeLooksValid(row.barcode),
  )?.barcode;
  if (numericBarcode && String(product.sku || "").includes(numericBarcode))
    issues.push("Barcode μέσα στο SKU");
  return issues;
};
const localInputDate = (value) => {
  const d = value ? new Date(value) : new Date();
  const pad = (x) => String(x).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

export default function OwnerProductCenter({
  api,
  stores = [],
  onOpenFullProduct,
}) {
  const [tab, setTab] = useState(
    () => sessionStorage.getItem("mws:owner-products-tab") || "master",
  );
  const [masterQuery, setMasterQuery] = useState("");
  const [masterResults, setMasterResults] = useState([]);
  const [selectedMaster, setSelectedMaster] = useState(null);
  const [masterDiscountMode, setMasterDiscountMode] = useState("single");
  const [selectedMasterDiscounts, setSelectedMasterDiscounts] = useState({});
  const [masterAudience, setMasterAudience] = useState("DOCTOR");
  const [masterAudienceStoreId, setMasterAudienceStoreId] = useState("");
  const [masterAudiencePercent, setMasterAudiencePercent] = useState("");
  const [discountAudit, setDiscountAudit] = useState(null);
  const [currentDiscountRules, setCurrentDiscountRules] = useState(null);
  const [discountAuditBusy, setDiscountAuditBusy] = useState(false);
  const [discountAuditError, setDiscountAuditError] = useState("");
  const [activationStores, setActivationStores] = useState({});
  const [basePrice, setBasePrice] = useState("");
  const [catalogQuery, setCatalogQuery] = useState("");
  const [catalog, setCatalog] = useState([]);
  const [qualityOnly, setQualityOnly] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [priceStores, setPriceStores] = useState({});
  const [editBasePrice, setEditBasePrice] = useState("");
  const [editVat, setEditVat] = useState("");
  const [editVatVerified, setEditVatVerified] = useState(false);
  const [productCard, setProductCard] = useState(null);
  const [transferBarcode, setTransferBarcode] = useState("");
  const [transferReview, setTransferReview] = useState(null);
  const [preparationProduct, setPreparationProduct] = useState(null);
  const [promotions, setPromotions] = useState([]);
  const [promotionType, setPromotionType] = useState("PERCENT");
  const [promotionProducts, setPromotionProducts] = useState([]);
  const [promotionGiftProducts, setPromotionGiftProducts] = useState([]);
  const [promotionQuery, setPromotionQuery] = useState("");
  const [promotionSearchBusy, setPromotionSearchBusy] = useState(false);
  const [promotionSelectionOpen, setPromotionSelectionOpen] = useState(false);
  const [promotionSelectionDetails, setPromotionSelectionDetails] = useState({});
  const [bulkProducts, setBulkProducts] = useState([]);
  const [bulkQuery, setBulkQuery] = useState("");
  const [bulkResults, setBulkResults] = useState([]);
  const [bulkCategory, setBulkCategory] = useState("");
  const [bulkSubcategory, setBulkSubcategory] = useState("");
  const [bulkSearchBusy, setBulkSearchBusy] = useState(false);
  const [bulkStores, setBulkStores] = useState([]);
  const [bulkMode, setBulkMode] = useState("SET");
  const [excelFile, setExcelFile] = useState(null);
  const [stocktakes, setStocktakes] = useState([]);
  const [openStocktake, setOpenStocktake] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const activeStores = useMemo(
    () => stores.filter((s) => s.active !== false),
    [stores],
  );
  const catalogWithQuality = useMemo(
    () =>
      catalog.map((product) => ({
        ...product,
        qualityIssues: productQualityIssues(product),
      })),
    [catalog],
  );
  const qualityProducts = useMemo(
    () => catalogWithQuality.filter((product) => product.qualityIssues.length),
    [catalogWithQuality],
  );
  const visibleCatalog = qualityOnly ? qualityProducts : catalogWithQuality;
  const visiblePromotionProducts = useMemo(() => {
    const query = promotionQuery.trim().toLocaleLowerCase("el-GR");
    return query
      ? catalog.filter((product) =>
          `${product.name || ""} ${product.sku || ""} ${(product.barcodes || []).map((row) => row.barcode).join(" ")}`
            .toLocaleLowerCase("el-GR")
            .includes(query),
        )
      : catalog;
  }, [catalog, promotionQuery]);
  useEffect(() => {
    sessionStorage.setItem("mws:owner-products-tab", tab);
  }, [tab]);
  useEffect(() => {
    const refresh = () => loadCatalog();
    window.addEventListener("mws:owner-products-refresh", refresh);
    return () =>
      window.removeEventListener("mws:owner-products-refresh", refresh);
  });
  const clearStatus = () => {
    setError("");
    setMessage("");
  };

  const searchMaster = async (event) => {
    event?.preventDefault();
    clearStatus();
    if (masterQuery.trim().length < 2) return;
    setBusy(true);
    try {
      setMasterResults(
        await api(
          `/api/owner-products/master?q=${encodeURIComponent(masterQuery.trim())}`,
        ),
      );
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const chooseMaster = (row) => {
    setSelectedMaster(row);
    setMasterAudience("DOCTOR");
    setMasterAudienceStoreId(activeStores[0]?.id || "");
    setDiscountAudit(null);
    setCurrentDiscountRules(null);
    setMasterAudiencePercent("");
    setBasePrice(
      row.defaultRetailPrice === null || row.defaultRetailPrice === undefined
        ? ""
        : String(Number(row.defaultRetailPrice)),
    );
    const config = {};
    activeStores.forEach((s) => {
      config[s.id] = {
        active: true,
        salePrice:
          row.defaultRetailPrice === null ||
          row.defaultRetailPrice === undefined
            ? ""
            : String(Number(row.defaultRetailPrice)),
      };
    });
    setActivationStores(config);
  };

  const activateMaster = async () => {
    if (!selectedMaster) return;
    clearStatus();
    setBusy(true);
    try {
      const storeConfigs = activeStores.map((s) => ({
        storeId: s.id,
        active: Boolean(activationStores[s.id]?.active),
        salePrice:
          activationStores[s.id]?.salePrice === ""
            ? null
            : Number(activationStores[s.id]?.salePrice),
      }));
      await api("/api/owner-products/activate", {
        method: "POST",
        body: JSON.stringify({
          masterProductId: selectedMaster.id,
          basePrice: basePrice === "" ? null : Number(basePrice),
          storeConfigs,
        }),
      });
      setMessage(
        `Το προϊόν «${selectedMaster.name}» ενεργοποιήθηκε στην εταιρεία.`,
      );
      setSelectedMaster(null);
      await searchMaster();
      await loadCatalog();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const saveMasterAudienceDiscount = async () => {
    clearStatus();
    const productIds =
      masterDiscountMode === "single"
        ? selectedMaster?.companyProductId
          ? [selectedMaster.companyProductId]
          : []
        : Object.keys(selectedMasterDiscounts);
    if (!productIds.length)
      return setError(
        masterDiscountMode === "single"
          ? "Ενεργοποίησε πρώτα το προϊόν στην εταιρεία."
          : "Επίλεξε ενεργά προϊόντα από τα αποτελέσματα αναζήτησης.",
      );
    if (productIds.length > 500)
      return setError("Μπορείς να αποθηκεύσεις έως 500 προϊόντα κάθε φορά.");
    if (!masterAudienceStoreId) return setError("Επίλεξε κατάστημα.");
    if (masterAudiencePercent.trim() === "")
      return setError("Συμπλήρωσε ποσοστό έκπτωσης.");
    const discountPercent = Number(masterAudiencePercent);
    if (
      !Number.isFinite(discountPercent) ||
      discountPercent < 0 ||
      discountPercent > 100
    )
      return setError("Η έκπτωση πρέπει να είναι από 0% έως 100%.");
    if (
      masterDiscountMode === "bulk" &&
      !window.confirm(
        `Εφαρμογή έκπτωσης ${discountPercent}% σε ${productIds.length} επιλεγμένα προϊόντα;`,
      )
    )
      return;
    setBusy(true);
    try {
      const result = await api("/api/owner-products/bulk-audience-discount", {
        method: "PUT",
        body: JSON.stringify({
          storeId: masterAudienceStoreId,
          productIds,
          audience: masterAudience,
          discountPercent,
        }),
      });
      setDiscountAudit(null);
      setCurrentDiscountRules(null);
      setMessage(
        masterDiscountMode === "single"
          ? `Αποθηκεύτηκε έκπτωση ${discountPercent}% για το «${selectedMaster.name}» σε ${result.changed} προϊόν.`
          : `Αποθηκεύτηκε έκπτωση ${discountPercent}% σε ${result.changed} επιλεγμένα προϊόντα.`,
      );
    } catch (e) {
      setError(e.message || "Η αποθήκευση έκπτωσης απέτυχε.");
    } finally {
      setBusy(false);
    }
  };

  const loadDiscountAudit = async () => {
    if (!masterAudienceStoreId) return;
    setDiscountAuditError("");
    setDiscountAuditBusy(true);
    try {
      const result = await api(
        `/api/owner-products/audience-discount-audit?storeId=${encodeURIComponent(masterAudienceStoreId)}&audience=${encodeURIComponent(masterAudience)}`,
      );
      setDiscountAudit(result.items || []);
      setCurrentDiscountRules(result.currentRules || []);
    } catch (e) {
      setDiscountAuditError(e.message || "Αποτυχία ανάγνωσης ιστορικού.");
    } finally {
      setDiscountAuditBusy(false);
    }
  };

  const loadCatalog = async () => {
    clearStatus();
    setBusy(true);
    try {
      setCatalog(
        await api(
          `/api/owner-products/catalog?q=${encodeURIComponent(catalogQuery.trim())}&_=${Date.now()}`,
        ),
      );
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const searchBulkProducts = async (event) => {
    event?.preventDefault();
    const query = bulkQuery.trim();
    if (query.length < 2) return setError("Γράψε τουλάχιστον 2 χαρακτήρες για αναζήτηση προϊόντος.");
    setError("");setBulkSearchBusy(true);
    try { setBulkResults(await api(`/api/owner-products/catalog?q=${encodeURIComponent(query)}`)); }
    catch (e) { setError(e.message); }
    finally { setBulkSearchBusy(false); }
  };

  const bulkCategories = useMemo(() => [...new Set(bulkResults.map((p)=>p.categoryName).filter(Boolean))].sort((a,b)=>a.localeCompare(b,"el")), [bulkResults]);
  const bulkSubcategories = useMemo(() => [...new Set(bulkResults.filter((p)=>!bulkCategory||p.categoryName===bulkCategory).map((p)=>p.subcategoryName).filter(Boolean))].sort((a,b)=>a.localeCompare(b,"el")), [bulkResults,bulkCategory]);
  const visibleBulkResults = useMemo(() => bulkResults.filter((p)=>(!bulkCategory||p.categoryName===bulkCategory)&&(!bulkSubcategory||p.subcategoryName===bulkSubcategory)), [bulkResults,bulkCategory,bulkSubcategory]);

  const searchPromotionProducts = async (event) => {
    event?.preventDefault();
    const query=promotionQuery.trim();
    if(query.length<2)return setError("Γράψε τουλάχιστον 2 χαρακτήρες για αναζήτηση προϊόντος.");
    setError("");setPromotionSearchBusy(true);
    try{const rows=await api(`/api/owner-products/catalog?q=${encodeURIComponent(query)}`);setCatalog(rows);setPromotionSelectionDetails(previous=>({...previous,...Object.fromEntries(rows.map(row=>[row.id,row]))}));}
    catch(e){setError(e.message)}finally{setPromotionSearchBusy(false)}
  };

  const chooseProduct = (row) => {
    setTransferBarcode("");
    setTransferReview(null);
    setSelectedProduct(row);
    setEditBasePrice(String(Number(row.salePrice || 0)));
    setEditVat(row.vatVerified ? String(Number(row.vatRate || 0)) : "");
    setEditVatVerified(Boolean(row.vatVerified));
    setProductCard({
      name: row.name || "",
      sku: row.sku || "",
      description: row.description || "",
      categoryName: row.categoryName || "",
      unit: row.unit || "PIECE",
      costPrice: String(Number(row.costPrice || 0)),
      trackStock: row.trackStock !== false,
      active: row.active !== false,
      barcodes: (row.barcodes || []).map((item) => ({
        barcode: item.barcode || "",
        unitMultiplier: String(Number(item.unitMultiplier || 1)),
      })),
    });
    const existing = new Map((row.stores || []).map((s) => [s.storeId, s]));
    const config = {};
    activeStores.forEach((s) => {
      const e = existing.get(s.id);
      config[s.id] = {
        active: e ? Boolean(e.active) : false,
        salePrice:
          e?.salePrice === null || e?.salePrice === undefined
            ? String(Number(row.salePrice || 0))
            : String(Number(e.salePrice)),
        minStock:
          e?.minStock === null || e?.minStock === undefined
            ? ""
            : String(Number(e.minStock)),
      };
    });
    setPriceStores(config);
  };
  const openProduct = (row) =>
    onOpenFullProduct
      ? onOpenFullProduct({
          productId: row.id,
          name: row.name,
          sku: row.sku,
          storeId:
            (row.stores || []).find((store) => store.active !== false)
              ?.storeId ||
            stores.find((store) => store.active !== false)?.id ||
            "",
          currentStock:
            (row.stores || []).find((store) => store.active !== false)
              ?.currentStock || 0,
        })
      : chooseProduct(row);

  const checkBarcodeOwner = async () => {
    if (!selectedProduct) return;
    clearStatus();
    setTransferReview(null);
    setBusy(true);
    try {
      const data = await api(
        `/api/owner-products/${selectedProduct.id}/barcode-owner?barcode=${encodeURIComponent(transferBarcode.trim())}`,
      );
      if (data.owners.length !== 1) {
        setError(
          data.owners.length
            ? "Το barcode έχει περισσότερες από μία αντιστοιχίσεις. Χρειάζεται χειροκίνητος έλεγχος."
            : "Το barcode δεν ανήκει σε άλλο προϊόν.",
        );
        return;
      }
      if (data.owners[0].productId === selectedProduct.id) {
        setMessage("Το barcode ανήκει ήδη στο επιλεγμένο προϊόν.");
        return;
      }
      setTransferReview(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  const transferExistingBarcode = async () => {
    if (
      !selectedProduct ||
      !transferReview ||
      transferReview.barcode !== transferBarcode.trim()
    )
      return;
    clearStatus();
    setBusy(true);
    try {
      await api(`/api/owner-products/${selectedProduct.id}/barcode-transfer`, {
        method: "POST",
        body: JSON.stringify({
          barcode: transferReview.barcode,
          sourceProductId: transferReview.owners[0].productId,
        }),
      });
      const fresh = await api(
        `/api/owner-products/catalog?q=${encodeURIComponent(catalogQuery.trim())}`,
      );
      setCatalog(fresh);
      const updated = fresh.find((row) => row.id === selectedProduct.id);
      if (updated) chooseProduct(updated);
      setMessage(
        "Το barcode μεταφέρθηκε. Έλεγξε τη συσκευασία και την τιμή στην καρτέλα προϊόντος.",
      );
    } catch (e) {
      setTransferReview(null);
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const saveProductCard = async () => {
    if (!selectedProduct || !productCard) return;
    clearStatus();
    setBusy(true);
    try {
      const base = Number(editBasePrice || 0);
      await api(`/api/owner-products/${selectedProduct.id}/card`, {
        method: "PATCH",
        body: JSON.stringify({
          ...productCard,
          salePrice: base,
          costPrice: Number(productCard.costPrice || 0),
          vatRate: Number(editVat || 0),
          vatVerified: editVatVerified,
          barcodes: productCard.barcodes
            .filter((row) => row.barcode.trim())
            .map((row) => ({
              barcode: row.barcode.trim(),
              unitMultiplier: Number(row.unitMultiplier || 1),
            })),
          stores: activeStores.map((store) => ({
            storeId: store.id,
            active: Boolean(priceStores[store.id]?.active),
            salePrice: Number(priceStores[store.id]?.salePrice || base),
            minStock:
              priceStores[store.id]?.minStock === "" ||
              priceStores[store.id]?.minStock === undefined
                ? null
                : Number(priceStores[store.id].minStock),
          })),
        }),
      });
      setMessage("Η κεντρική καρτέλα προϊόντος αποθηκεύτηκε με ασφάλεια.");
      const fresh = await api(
        `/api/owner-products/catalog?q=${encodeURIComponent(catalogQuery.trim())}`,
      );
      setCatalog(fresh);
      const updated = fresh.find((row) => row.id === selectedProduct.id);
      if (updated) chooseProduct(updated);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const savePrices = async () => {
    if (!selectedProduct) return;
    clearStatus();
    setBusy(true);
    try {
      const base = Number(editBasePrice || 0);
      const payload = {
        basePrice: base,
        vatRate: editVat === "" ? undefined : Number(editVat),
        vatVerified: editVatVerified,
        stores: activeStores.map((s) => ({
          storeId: s.id,
          active: Boolean(priceStores[s.id]?.active),
          salePrice:
            priceStores[s.id]?.salePrice === ""
              ? base
              : Number(priceStores[s.id]?.salePrice),
        })),
      };
      await api(`/api/owner-products/${selectedProduct.id}/prices`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      });
      setMessage(
        "Οι τιμές ανά κατάστημα αποθηκεύτηκαν και γράφτηκαν στο ιστορικό.",
      );
      await loadCatalog();
      const fresh = await api(
        `/api/owner-products/catalog?q=${encodeURIComponent(selectedProduct.sku || selectedProduct.name)}`,
      );
      const updated = fresh.find((x) => x.id === selectedProduct.id);
      if (updated) chooseProduct(updated);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const loadPromotions = async () => {
    clearStatus();
    setBusy(true);
    try {
      const result = await api("/api/price-catalog/promotions/scoped");
      setPromotions(result.items || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  const createPromotion = async (event) => {
    event.preventDefault();
    clearStatus();
    setBusy(true);
    const f = new FormData(event.currentTarget);
    const type = String(f.get("promotionType"));
    const storeIds = activeStores
      .filter((s) => f.get(`store_${s.id}`) === "on")
      .map((s) => s.id);
    if (!promotionProducts.length) {
      setBusy(false);
      return setError("Επίλεξε τουλάχιστον ένα προϊόν.");
    }
    if (!storeIds.length) {
      setBusy(false);
      return setError("Επίλεξε τουλάχιστον ένα κατάστημα.");
    }
    if (type === "FIXED_PRICE" && promotionProducts.length > 1) {
      setBusy(false);
      return setError(
        "Η κοινή τελική τιμή επιτρέπεται μόνο σε ένα προϊόν. Για πολλά προϊόντα επίλεξε ποσοστό ή έκπτωση σε ευρώ.",
      );
    }
    if (type === "BUY_X_GET_Y" && !promotionGiftProducts.length) {
      setBusy(false);
      return setError("Επίλεξε τα προϊόντα που επιτρέπεται να δοθούν ως δώρο.");
    }
    try {
      const result = await api("/api/price-catalog/promotions/scoped/bulk", {
        method: "POST",
        body: JSON.stringify({
          productIds: promotionProducts,
          giftProductIds: type === "BUY_X_GET_Y" ? promotionGiftProducts : [],
          promotionType: type === "BUY_X_GET_Y" ? "GIFT" : "LEAFLET",
          offerMode:
            type === "PERCENT"
              ? "DISCOUNT_PERCENT"
              : type === "AMOUNT"
                ? "DISCOUNT_AMOUNT"
                : "FIXED_PRICE",
          discountPercent: type === "PERCENT" ? Number(f.get("percentOff")) : 0,
          discountAmount:
            type === "AMOUNT" ? Number(f.get("discountAmount")) : 0,
          offerPrice:
            type === "FIXED_PRICE" ? Number(f.get("fixedPrice")) : null,
          saleQuantity:
            type === "BUY_X_GET_Y" ? Number(f.get("buyQuantity")) : 1,
          bonusQuantity:
            type === "BUY_X_GET_Y" ? Number(f.get("freeQuantity")) : 0,
          validFrom: f.get("startsAt"),
          validUntil: f.get("endsAt"),
          active: true,
          storeIds,
        }),
      });
      event.currentTarget.reset();
      setPromotionType("PERCENT");
      setPromotionProducts([]);
      setPromotionGiftProducts([]);
      setPromotionQuery("");
      setMessage(`Η προσφορά στάλθηκε μαζί σε ${result.created} προϊόντα.`);
      await loadPromotions();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  const togglePromotion = async (promotion) => {
    clearStatus();
    try {
      await api(`/api/price-catalog/promotions/${promotion.id}/scoped`, {
        method: "PATCH",
        body: JSON.stringify({
          active: !promotion.active,
          storeIds: (promotion.stores || []).map((store) => store.id),
        }),
      });
      await loadPromotions();
    } catch (e) {
      setError(e.message);
    }
  };

  const saveBulkPrices = async (event) => {
    event.preventDefault();
    clearStatus();
    if (!bulkProducts.length || !bulkStores.length)
      return setError("Επίλεξε τουλάχιστον ένα προϊόν και ένα κατάστημα.");
    const f = new FormData(event.currentTarget);
    setBusy(true);
    try {
      const result = await api("/api/owner-products/prices/bulk", {
        method: "POST",
        body: JSON.stringify({
          productIds: bulkProducts,
          storeIds: bulkStores,
          mode: bulkMode,
          value: Number(f.get("value")),
        }),
      });
      setMessage(
        `Η μαζική αλλαγή ολοκληρώθηκε σε ${result.changed} τιμές και καταγράφηκε στο ιστορικό.`,
      );
      await loadCatalog();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const importPromotions = async (event) => {
    event.preventDefault();
    clearStatus();
    if (!excelFile) return setError("Επίλεξε αρχείο Excel.");
    const f = new FormData(event.currentTarget),
      sourceStoreId = String(f.get("sourceStoreId") || "");
    const targetStoreIds = activeStores
      .filter((s) => s.id !== sourceStoreId && f.get(`target_${s.id}`) === "on")
      .map((s) => s.id);
    setBusy(true);
    try {
      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error("Δεν διαβάστηκε το αρχείο."));
        reader.readAsDataURL(excelFile);
      });
      const result = await api("/api/owner-products/promotions/import-excel", {
        method: "POST",
        body: JSON.stringify({ dataUrl, sourceStoreId, targetStoreIds }),
      });
      setMessage(
        `Εισήχθησαν ${result.created} γραμμές και εφαρμόστηκαν σε ${result.stores} καταστήματα.`,
      );
      setExcelFile(null);
      event.currentTarget.reset();
      await loadPromotions();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const loadStocktakes = async () => {
    clearStatus();
    setBusy(true);
    try {
      setStocktakes(await api("/api/owner-products/stocktakes/list"));
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  const createStocktake = async (event) => {
    event.preventDefault();
    clearStatus();
    setBusy(true);
    const f = new FormData(event.currentTarget);
    try {
      const result = await api("/api/owner-products/stocktakes", {
        method: "POST",
        body: JSON.stringify({
          storeId: f.get("storeId"),
          name: f.get("name"),
        }),
      });
      event.currentTarget.reset();
      setMessage(
        "Η απογραφή δημιουργήθηκε με το θεωρητικό απόθεμα του καταστήματος.",
      );
      await loadStocktakes();
      await openStocktakeById(result.id);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  const openStocktakeById = async (id) => {
    clearStatus();
    setBusy(true);
    try {
      setOpenStocktake(await api(`/api/owner-products/stocktakes/${id}`));
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  const saveCount = async (lineId, value) => {
    if (!openStocktake) return;
    clearStatus();
    try {
      await api(
        `/api/owner-products/stocktakes/${openStocktake.id}/lines/${lineId}`,
        {
          method: "PATCH",
          body: JSON.stringify({ countedQuantity: Number(value || 0) }),
        },
      );
      await openStocktakeById(openStocktake.id);
    } catch (e) {
      setError(e.message);
    }
  };
  const finalizeStocktake = async () => {
    if (
      !openStocktake ||
      !window.confirm(
        "Να οριστικοποιηθεί η απογραφή; Θα ενημερωθεί το πραγματικό απόθεμα του καταστήματος.",
      )
    )
      return;
    clearStatus();
    setBusy(true);
    try {
      await api(`/api/owner-products/stocktakes/${openStocktake.id}/finalize`, {
        method: "POST",
        body: "{}",
      });
      setMessage(
        "Η απογραφή οριστικοποιήθηκε και οι διαφορές γράφτηκαν ως κινήσεις αποθήκης.",
      );
      await openStocktakeById(openStocktake.id);
      await loadStocktakes();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (
      tab === "prices" ||
      tab === "promotion-import" ||
      tab === "inventory2"
    )
      loadCatalog();
    if (tab === "promotions") {
      setCatalog([]);
      loadPromotions();
    }
    if (tab === "promotion-import") loadPromotions();
    if (tab === "stocktake") loadStocktakes();
  }, [tab]);

  return (
    <div className="owner-products owner-products-colorful">
      <div className="owner-products-head">
        <div>
          <h2>Προϊόντα, Τιμές, Προσφορές & Απογραφή</h2>
          <p>
            Ο Owner επιλέγει από τον κεντρικό κατάλογο και ορίζει ξεχωριστή
            εμπορική πολιτική ανά κατάστημα.
          </p>
        </div>
        <button
          onClick={() => {
            if (tab === "master") searchMaster();
            if (tab === "prices") loadCatalog();
            if (tab === "promotions") loadPromotions();
            if (tab === "stocktake") loadStocktakes();
          }}
        >
          <RefreshCw />
          Ανανέωση
        </button>
      </div>
      <div className="owner-product-tabs">
        <button
          className={tab === "master" ? "active" : ""}
          onClick={() => setTab("master")}
        >
          <PackageSearch />
          Master Catalog
        </button>
        <button
          className={tab === "prices" ? "active" : ""}
          onClick={() => setTab("prices")}
        >
          <Tag />
          Τιμές ανά κατάστημα
        </button>
        <button
          className={tab === "bulk" ? "active" : ""}
          onClick={() => setTab("bulk")}
        >
          <Tag />
          Μαζική αλλαγή τιμών
        </button>
        <button
          className={tab === "promotions" ? "active" : ""}
          onClick={() => setTab("promotions")}
        >
          <BadgePercent />
          Προσφορές
        </button>
        <button
          className={tab === "promotion-import" ? "active" : ""}
          onClick={() => setTab("promotion-import")}
        >
          <Upload />
          Excel / Barcode
        </button>
        <button
          className={tab === "inventory2" ? "active" : ""}
          onClick={() => setTab("inventory2")}
        >
          <ClipboardList />
          Απογραφή
        </button>
      </div>
      {error && <div className="op-alert error">{error}</div>}
      {message && <div className="op-alert success">{message}</div>}
      {tab === "bulk" && (
        <form className="op-box op-form bulk-price-workflow" onSubmit={saveBulkPrices}>
          <h3>Μαζική αλλαγή τιμών με επιλογή προϊόντων</h3>
          <p>
            Επίλεξε συγκεκριμένα προϊόντα και καταστήματα. Κάθε αλλαγή
            αποθηκεύεται στο ιστορικό τιμών.
          </p>
          <fieldset>
            <legend>1. Επιλογή προϊόντων</legend>
            <div className="bulk-product-search">
              <input value={bulkQuery} onChange={(e)=>setBulkQuery(e.target.value)} placeholder="Περιγραφή / κωδικός — γράψε τουλάχιστον 2 χαρακτήρες" />
              <button type="button" onClick={searchBulkProducts} disabled={bulkSearchBusy}>{bulkSearchBusy?"Αναζήτηση…":"Αναζήτηση"}</button>
            </div>
            <div className="bulk-product-filters"><select value={bulkCategory} onChange={(e)=>{setBulkCategory(e.target.value);setBulkSubcategory("")}}><option value="">Όλες οι κατηγορίες</option>{bulkCategories.map((name)=><option key={name} value={name}>{name}</option>)}</select><select value={bulkSubcategory} onChange={(e)=>setBulkSubcategory(e.target.value)}><option value="">Όλες οι υποκατηγορίες</option>{bulkSubcategories.map((name)=><option key={name} value={name}>{name}</option>)}</select></div>
            <div className="bulk-check-list">
              {visibleBulkResults.map((product) => (
                <label className="check" key={product.id}>
                  <input
                    type="checkbox"
                    checked={bulkProducts.includes(product.id)}
                    onChange={(e) =>
                      setBulkProducts((current) =>
                        e.target.checked
                          ? [...current, product.id]
                          : current.filter((id) => id !== product.id),
                      )
                    }
                  />
                  <span>
                    {product.name}
                    <small>{product.sku || "—"} · {money(product.salePrice)}</small>
                  </span>
                </label>
              ))}
              {!visibleBulkResults.length&&!bulkSearchBusy&&<div className="bulk-search-hint">Αναζήτησε προϊόν για να εμφανιστούν μόνο τα σχετικά αποτελέσματα.</div>}
            </div>
          </fieldset>
          <fieldset>
            <legend>2. Επιλογή καταστημάτων</legend>
            {activeStores.map((store) => (
              <label className="check" key={store.id}>
                <input
                  type="checkbox"
                  checked={bulkStores.includes(store.id)}
                  onChange={(e) =>
                    setBulkStores((current) =>
                      e.target.checked
                        ? [...current, store.id]
                        : current.filter((id) => id !== store.id),
                    )
                  }
                />
                {store.name}
              </label>
            ))}
          </fieldset>
          <div className="bulk-price-summary">
            <div><b>{bulkProducts.length}</b><span>Επιλεγμένα προϊόντα</span></div>
            <div><b>{bulkStores.length}</b><span>Επιλεγμένα καταστήματα</span></div>
            <div><b>{bulkProducts.length * bulkStores.length}</b><span>Συνολικές αλλαγές</span></div>
          </div>
          <div className="op-two">
            <label>
              3. Ενέργεια
              <select
                value={bulkMode}
                onChange={(e) => setBulkMode(e.target.value)}
              >
                <option value="SET">Ορισμός νέας τιμής</option>
                <option value="INCREASE_PERCENT">Αύξηση %</option>
                <option value="DECREASE_PERCENT">Μείωση %</option>
              </select>
            </label>
            <label>
              4. {bulkMode === "SET" ? "Νέα τιμή €" : "Ποσοστό %"}
              <input
                name="value"
                type="number"
                min="0"
                max="999999"
                step="0.01"
                required
              />
            </label>
          </div>
          <button className="primary" disabled={busy}>
            Εφαρμογή σε {bulkProducts.length} προϊόντα × {bulkStores.length}{" "}
            καταστήματα
          </button>
        </form>
      )}
      {tab === "promotion-import" && (
        <div className="op-grid two promotion-import-workspace">
          <section className="op-box">
            <div className="promotion-import-heading"><span>1</span><div><h3>Νέα προσφορά με Barcode</h3><p>Σκάναρε το προϊόν και συμπλήρωσε την προσφορά.</p></div></div>
            <form className="op-form" onSubmit={createPromotion}>
              <label>
                Barcode προϊόντος
                <input
                  name="barcode"
                  required
                  autoFocus
                  placeholder="Σκάναρε ή γράψε barcode"
                />
              </label>
              <input name="productId" type="hidden" value="" readOnly />
              <label>
                Όνομα προσφοράς
                <input name="name" required />
              </label>
              <label>
                Τύπος
                <select
                  name="promotionType"
                  value={promotionType}
                  onChange={(e) => setPromotionType(e.target.value)}
                >
                  <option value="PERCENT">Ποσοστό %</option>
                  <option value="BUY_X_GET_Y">X + Y δωρεάν</option>
                  <option value="FIXED_PRICE">Τελική τιμή</option>
                </select>
              </label>
              {promotionType === "PERCENT" && (
                <label>
                  Έκπτωση %
                  <input
                    name="percentOff"
                    type="number"
                    min="0.01"
                    max="100"
                    step="0.01"
                    required
                  />
                </label>
              )}
              {promotionType === "BUY_X_GET_Y" && (
                <><div className="op-two">
                  <label>
                    Αγορά X
                    <input name="buyQuantity" type="number" min="1" required />
                  </label>
                  <label>
                    Δωρεάν Y
                    <input name="freeQuantity" type="number" min="1" required />
                  </label>
                </div><div className="promotion-product-picker"><div className="section-heading"><div><b>Επιτρεπόμενα προϊόντα δώρου</b><small>{promotionGiftProducts.length} επιλεγμένα · μόνο αυτά θα εμφανιστούν στο POS</small></div><div className="promotion-picker-actions"><button type="button" className="secondary" onClick={()=>setPromotionGiftProducts(previous=>[...new Set([...previous,...visiblePromotionProducts.map(product=>product.id)])])}>Όλα τα εμφανιζόμενα</button><button type="button" className="secondary" onClick={()=>setPromotionGiftProducts([])}>Κανένα</button></div></div><div className="promotion-product-list">{visiblePromotionProducts.map(product=><label className="check" key={`gift-${product.id}`}><input type="checkbox" checked={promotionGiftProducts.includes(product.id)} onChange={event=>setPromotionGiftProducts(previous=>event.target.checked?[...new Set([...previous,product.id])]:previous.filter(id=>id!==product.id))}/><span><b>{product.name}</b><small>{product.sku||"χωρίς SKU"} · {money(effectiveSalePrice(product))}</small></span></label>)}</div></div></>
              )}
              {promotionType === "FIXED_PRICE" && (
                <label>
                  Τελική τιμή
                  <input
                    name="fixedPrice"
                    type="number"
                    min="0.01"
                    step="0.01"
                    required
                  />
                </label>
              )}
              <div className="op-two">
                <label>
                  Από
                  <input
                    name="startsAt"
                    type="datetime-local"
                    defaultValue={localInputDate(new Date())}
                    required
                  />
                </label>
                <label>
                  Έως
                  <input
                    name="endsAt"
                    type="datetime-local"
                    defaultValue={localInputDate(
                      new Date(Date.now() + 7 * 86400000),
                    )}
                    required
                  />
                </label>
              </div>
              <input name="priority" type="hidden" value="100" readOnly />
              <fieldset>
                <legend>Δημιουργία και αποστολή σε καταστήματα</legend>
                {activeStores.map((store) => (
                  <label className="check" key={store.id}>
                    <input
                      name={`store_${store.id}`}
                      type="checkbox"
                      defaultChecked
                    />
                    {store.name}
                  </label>
                ))}
              </fieldset>
              <button className="primary">Δημιουργία με barcode</button>
            </form>
          </section>
          <section className="op-box">
            <div className="promotion-import-heading"><span>2</span><div><h3>Εισαγωγή προσφορών από Excel</h3><p>Ανέβασε το αρχείο και επίλεξε πού θα εφαρμοστούν οι προσφορές.</p></div></div>
            <form className="op-form" onSubmit={importPromotions}>
              <label>
                Αρχείο Excel
                <input
                  type="file"
                  accept=".xlsx,.xls"
                  onChange={(e) => setExcelFile(e.target.files?.[0] || null)}
                  required
                />
              </label>
              <label>
                Δημιουργία πρώτα στο κατάστημα
                <select name="sourceStoreId" required>
                  <option value="">Επιλογή</option>
                  {activeStores.map((store) => (
                    <option key={store.id} value={store.id}>
                      {store.name}
                    </option>
                  ))}
                </select>
              </label>
              <fieldset>
                <legend>Αποστολή αντιγράφου και στα υπόλοιπα</legend>
                {activeStores.map((store) => (
                  <label className="check" key={store.id}>
                    <input name={`target_${store.id}`} type="checkbox" />
                    {store.name}
                  </label>
                ))}
              </fieldset>
              <div className="op-alert info">
                Στήλες: Barcode, Όνομα προσφοράς, Τύπος, Από, Έως και ανάλογα
                Έκπτωση %, Αγορά X, Δωρεάν Y ή Τελική τιμή.
              </div>
              <button className="primary" disabled={busy}>
                <Upload />
                Εισαγωγή και αποστολή
              </button>
            </form>
          </section>
        </div>
      )}

      {tab === "master" && (
        <div className="op-grid two op-master-workspace">
          <section className="op-box">
            <h3>Αναζήτηση 26.656 προϊόντων</h3>
            <form className="op-search" onSubmit={searchMaster}>
              <input
                value={masterQuery}
                onChange={(e) => setMasterQuery(e.target.value)}
                placeholder="Περιγραφή, κωδικός ή barcode"
              />
              <button disabled={busy}>
                <Search />
                Αναζήτηση
              </button>
            </form>
            <div className="op-list">
              {masterResults.map((row) => (
                <div key={row.id} className="op-master-result">
                  <label
                    className="op-master-select"
                    title={
                      row.companyProductId
                        ? "Επιλογή για μαζική έκπτωση"
                        : "Ενεργοποίησε πρώτα το προϊόν"
                    }
                  >
                    <input
                      type="checkbox"
                      disabled={!row.companyProductId}
                      checked={Boolean(
                        row.companyProductId &&
                        selectedMasterDiscounts[row.companyProductId],
                      )}
                      onChange={(e) =>
                        setSelectedMasterDiscounts((current) => {
                          const next = { ...current };
                          if (e.target.checked)
                            next[row.companyProductId] = {
                              name: row.name,
                              sourceCode: row.sourceCode,
                            };
                          else delete next[row.companyProductId];
                          return next;
                        })
                      }
                    />
                  </label>
                  <button
                    className={`op-product ${selectedMaster?.id === row.id ? "selected" : ""}`}
                    onClick={() => chooseMaster(row)}
                  >
                    <span>
                      <b>{row.name}</b>
                      <small>
                        {row.sourceCode} ·{" "}
                        {row.categoryName || "Χωρίς κατηγορία"}
                      </small>
                    </span>
                    <span>
                      {row.companyProductId ? (
                        <em className="ok">ΕΝΕΡΓΟ</em>
                      ) : (
                        <em>MASTER</em>
                      )}
                      <small>{money(row.defaultRetailPrice)}</small>
                    </span>
                  </button>
                </div>
              ))}
            </div>
            <p className="op-master-selection">
              {Object.keys(selectedMasterDiscounts).length} ενεργά προϊόντα
              επιλεγμένα για μαζική έκπτωση
            </p>
          </section>
          {selectedMaster ? (
            <aside className="op-box">
              <h3>{selectedMaster.name}</h3>
              <p>
                Βασική λιανική Master:{" "}
                <b>{money(selectedMaster.defaultRetailPrice)}</b>
              </p>
              <label>
                Βασική τιμή εταιρείας
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={basePrice}
                  onChange={(e) => setBasePrice(e.target.value)}
                />
              </label>
              <div className="store-price-list">
                <h4>Καταστήματα</h4>
                {activeStores.map((store) => (
                  <div className="store-price" key={store.id}>
                    <label className="check">
                      <input
                        type="checkbox"
                        checked={Boolean(activationStores[store.id]?.active)}
                        onChange={(e) =>
                          setActivationStores((c) => ({
                            ...c,
                            [store.id]: {
                              ...c[store.id],
                              active: e.target.checked,
                            },
                          }))
                        }
                      />
                      <Store />
                      {store.name}
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={activationStores[store.id]?.salePrice ?? ""}
                      onChange={(e) =>
                        setActivationStores((c) => ({
                          ...c,
                          [store.id]: {
                            ...c[store.id],
                            salePrice: e.target.value,
                          },
                        }))
                      }
                      placeholder="Τιμή"
                    />
                  </div>
                ))}
              </div>
              {selectedMaster.vatVerified ? (
                <div className="op-alert success">
                  ΦΠΑ Master επιβεβαιωμένος: {n(selectedMaster.vatRate)}%
                </div>
              ) : (
                <div className="op-alert warning">
                  Ο ΦΠΑ δεν είναι επιβεβαιωμένος. Το προϊόν θα ενεργοποιηθεί
                  χωρίς αυθαίρετη φορολογική τιμή.
                </div>
              )}
              <button
                className="primary"
                onClick={activateMaster}
                disabled={busy}
              >
                <Check />
                Ενεργοποίηση / ενημέρωση προϊόντος
              </button>
              {selectedMaster.companyProductId && (
                <div className="op-box op-form">
                  <h4>Έκπτωση δικαιούχου</h4>
                  <div className="op-discount-mode">
                    <button
                      type="button"
                      className={
                        masterDiscountMode === "single" ? "active" : ""
                      }
                      onClick={() => setMasterDiscountMode("single")}
                    >
                      Ένα προϊόν
                    </button>
                    <button
                      type="button"
                      className={masterDiscountMode === "bulk" ? "active" : ""}
                      onClick={() => setMasterDiscountMode("bulk")}
                    >
                      Μαζικά ({Object.keys(selectedMasterDiscounts).length})
                    </button>
                  </div>
                  <p>
                    {masterDiscountMode === "single"
                      ? `${selectedMaster.name} · ${selectedMaster.sourceCode} · ένα προϊόν`
                      : `${Object.keys(selectedMasterDiscounts).length} ενεργά προϊόντα επιλεγμένα από τη λίστα αριστερά`}
                  </p>
                  <label>
                    Κατάστημα
                    <select
                      value={masterAudienceStoreId}
                      onChange={(e) => setMasterAudienceStoreId(e.target.value)}
                    >
                      {activeStores.map((store) => (
                        <option key={store.id} value={store.id}>
                          {store.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Δικαιούχος
                    <select
                      value={masterAudience}
                      onChange={(e) => setMasterAudience(e.target.value)}
                    >
                      <option value="DOCTOR">Ιατροί</option>
                      <option value="NURSE">Νοσηλευτές / Νοσοκόμοι</option>
                      <option value="STAFF">Προσωπικό</option>
                      <option value="CUSTOMER">Πελάτες</option>
                    </select>
                  </label>
                  <label>
                    Έκπτωση %
                    <input
                      type="number"
                      min="0"
                      max="100"
                      step="0.01"
                      value={masterAudiencePercent}
                      onChange={(e) => setMasterAudiencePercent(e.target.value)}
                    />
                  </label>
                  <button
                    type="button"
                    className="primary"
                    disabled={
                      busy ||
                      !masterAudienceStoreId ||
                      masterAudiencePercent.trim() === "" ||
                      (masterDiscountMode === "bulk" &&
                        !Object.keys(selectedMasterDiscounts).length)
                    }
                    onClick={saveMasterAudienceDiscount}
                  >
                    Αποθήκευση έκπτωσης για{" "}
                    {masterDiscountMode === "single"
                      ? "1 προϊόν"
                      : `${Object.keys(selectedMasterDiscounts).length} προϊόντα`}
                  </button>
                  <small>
                    Το 0% απενεργοποιεί την έκπτωση. Η βασική τιμή λιανικής
                    παραμένει ίδια.
                  </small>
                </div>
              )}
            </aside>
          ) : (
            <aside className="op-box empty">
              Επίλεξε προϊόν από τον Master Catalog.
            </aside>
          )}
        </div>
      )}

      {tab === "master" && (
        <section className="op-box" aria-label="Ιστορικό εκπτώσεων δικαιούχων">
          <h3>Ιστορικό αποθήκευσης έκπτωσης</h3>
          <label>
            Κατάστημα{" "}
            <select
              value={masterAudienceStoreId}
              onChange={(e) => {
                setMasterAudienceStoreId(e.target.value);
                setDiscountAudit(null);
                setCurrentDiscountRules(null);
              }}
            >
              <option value="">Επιλογή</option>
              {activeStores.map((store) => (
                <option key={store.id} value={store.id}>
                  {store.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Δικαιούχος{" "}
            <select
              value={masterAudience}
              onChange={(e) => {
                setMasterAudience(e.target.value);
                setDiscountAudit(null);
                setCurrentDiscountRules(null);
              }}
            >
              <option value="DOCTOR">Ιατροί</option>
              <option value="NURSE">Νοσηλευτές / Νοσοκόμοι</option>
              <option value="STAFF">Προσωπικό</option>
              <option value="CUSTOMER">Πελάτες</option>
            </select>
          </label>
          <button
            type="button"
            disabled={!masterAudienceStoreId || discountAuditBusy}
            onClick={loadDiscountAudit}
          >
            Ανάγνωση κανόνων και ιστορικού (χωρίς αποθήκευση)
          </button>
          {discountAuditError && <p role="alert">{discountAuditError}</p>}
          {currentDiscountRules !== null && (
            <>
              <h4>
                Ενεργοί κανόνες τώρα: {currentDiscountRules.length} προϊόντα
              </h4>
              {currentDiscountRules.length ? (
                <ul>
                  {currentDiscountRules.map((row) => (
                    <li key={row.productId}>
                      {row.productName || "Προϊόν χωρίς όνομα"} ·{" "}
                      {row.discountPercent}% · ID {row.productId}
                    </li>
                  ))}
                </ul>
              ) : (
                <p>Δεν υπάρχουν ενεργοί κανόνες σε αυτή την επιλογή.</p>
              )}
            </>
          )}
          {discountAudit !== null &&
            (discountAudit.length ? (
              <ul>
                {discountAudit.map((row) => (
                  <li key={row.id}>
                    {new Date(row.createdAt).toLocaleString("el-GR", {
                      timeZone: "Europe/Athens",
                    })}{" "}
                    · {row.discountPercent}% ·{" "}
                    {Array.isArray(row.productIds) ? row.productIds.length : 0}{" "}
                    προϊόντα · IDs:{" "}
                    {Array.isArray(row.productIds)
                      ? row.productIds.join(", ")
                      : "—"}{" "}
                    · χρήστης {row.actorId || "—"} · Audit {row.id}
                  </li>
                ))}
              </ul>
            ) : (
              <p>Δεν βρέθηκαν εγγραφές για αυτή την επιλογή.</p>
            ))}
        </section>
      )}

      {tab === "prices" && (
        <section className="op-box preparation-quick-access">
          <div>
            <b>Παρασκευή προϊόντος και σταθμός εκτέλεσης</b>
            <small>
              Επίλεξε έτοιμο προϊόν για ΚΑΦΕ, ΚΟΥΖΙΝΑ ή άλλο σταθμό.
            </small>
          </div>
          <select
            aria-label="Προϊόν για ρυθμίσεις παρασκευής"
            defaultValue=""
            onChange={(event) => {
              const product = catalog.find(
                (row) => row.id === event.target.value,
              );
              if (product) setPreparationProduct(product);
              event.target.value = "";
            }}
          >
            <option value="">Επιλογή προϊόντος…</option>
            {catalog.map((row) => (
              <option key={row.id} value={row.id}>
                {row.name} · {row.sku || "χωρίς SKU"}
              </option>
            ))}
          </select>
        </section>
      )}

      {tab === "prices" && (
        <div className="op-grid product-card-grid">
          <section className="op-box">
            <h3>Προϊόντα εταιρείας</h3>
            <form
              className="op-search"
              onSubmit={(e) => {
                e.preventDefault();
                loadCatalog();
              }}
            >
              <input
                value={catalogQuery}
                onChange={(e) => setCatalogQuery(e.target.value)}
                placeholder="Αναζήτηση προϊόντος"
              />
              <button>
                <Search />
                Αναζήτηση
              </button>
            </form>
            <div
              className={`product-quality-summary ${qualityProducts.length ? "warning" : "ok"}`}
            >
              <div>
                <b>Έλεγχος ποιότητας LAB</b>
                <small>
                  {catalog.length} προϊόντα · {qualityProducts.length}{" "}
                  χρειάζονται έλεγχο
                </small>
              </div>
              <button
                type="button"
                onClick={() => setQualityOnly((value) => !value)}
              >
                {qualityOnly ? "Όλα τα προϊόντα" : "Μόνο προβλήματα"}
              </button>
            </div>
            <div className="op-list">
              {visibleCatalog.map((row) => (
                <div key={row.id} className="op-product-wrap">
                  <button
                    className={`op-product ${selectedProduct?.id === row.id ? "selected" : ""}`}
                    onClick={() => openProduct(row)}
                  >
                    <span>
                      <b>{row.name}</b>
                      <small>
                        {row.sku || "—"} ·{" "}
                        {row.categoryName || "Χωρίς κατηγορία"}
                      </small>
                      {row.qualityIssues.length > 0 && (
                        <small className="quality-issues">
                          {row.qualityIssues.join(" · ")}
                        </small>
                      )}
                    </span>
                    <span>
                      <b>{money(effectiveSalePrice(row))}</b>
                      <small>
                        {(row.stores || []).filter((s) => s.active).length}{" "}
                        ενεργά καταστήματα
                      </small>
                    </span>
                  </button>
                  <button
                    type="button"
                    className="secondary op-product-card-action"
                    onClick={() => chooseProduct(row)}
                  >
                    Καρτέλα / barcode
                  </button>
                </div>
              ))}
            </div>
          </section>
          {selectedProduct && productCard ? (
            <aside className="op-box product-card">
              <div className="product-card-title">
                <div>
                  <h3>Κεντρική καρτέλα προϊόντος</h3>
                  <p>{selectedProduct.name}</p>
                </div>
                <em className={productCard.active ? "active" : ""}>
                  {productCard.active ? "ΕΝΕΡΓΟ" : "ΑΝΕΝΕΡΓΟ"}
                </em>
              </div>
              {productQualityIssues(selectedProduct).length > 0 && (
                <div className="op-alert warning">
                  <b>Χρειάζεται έλεγχο:</b>{" "}
                  {productQualityIssues(selectedProduct).join(" · ")}
                </div>
              )}
              <div className="product-card-fields">
                <label className="span-two">
                  Περιγραφή προϊόντος
                  <input
                    value={productCard.name}
                    onChange={(e) =>
                      setProductCard((c) => ({ ...c, name: e.target.value }))
                    }
                  />
                </label>
                <label>
                  Κωδικός / SKU
                  <input
                    value={productCard.sku}
                    onChange={(e) =>
                      setProductCard((c) => ({ ...c, sku: e.target.value }))
                    }
                  />
                </label>
                <label>
                  Κατηγορία
                  <input
                    value={productCard.categoryName}
                    onChange={(e) =>
                      setProductCard((c) => ({
                        ...c,
                        categoryName: e.target.value,
                      }))
                    }
                  />
                </label>
                <label className="span-two">
                  Σχόλια / περιγραφή
                  <textarea
                    value={productCard.description}
                    onChange={(e) =>
                      setProductCard((c) => ({
                        ...c,
                        description: e.target.value,
                      }))
                    }
                  />
                </label>
                <label>
                  Μονάδα μέτρησης
                  <select
                    value={productCard.unit}
                    onChange={(e) =>
                      setProductCard((c) => ({ ...c, unit: e.target.value }))
                    }
                  >
                    <option value="PIECE">Τεμάχιο</option>
                    <option value="KG">Κιλό</option>
                    <option value="LITER">Λίτρο</option>
                    <option value="PACKAGE">Συσκευασία</option>
                  </select>
                </label>
                <label>
                  Τιμή αγοράς €
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={productCard.costPrice}
                    onChange={(e) =>
                      setProductCard((c) => ({
                        ...c,
                        costPrice: e.target.value,
                      }))
                    }
                  />
                </label>
                <label>
                  Βασική τιμή λιανικής €
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={editBasePrice}
                    onChange={(e) => setEditBasePrice(e.target.value)}
                  />
                </label>
                <label>
                  ΦΠΑ %
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="0.01"
                    value={editVat}
                    placeholder={
                      editVatVerified ? "Ποσοστό" : "Μη επιβεβαιωμένος"
                    }
                    onChange={(e) => setEditVat(e.target.value)}
                  />
                </label>
              </div>
              <div className="product-card-switches">
                <label className="check">
                  <input
                    type="checkbox"
                    checked={editVatVerified}
                    onChange={(e) => setEditVatVerified(e.target.checked)}
                  />
                  ΦΠΑ επιβεβαιωμένος
                </label>
                <label className="check">
                  <input
                    type="checkbox"
                    checked={productCard.trackStock}
                    onChange={(e) =>
                      setProductCard((c) => ({
                        ...c,
                        trackStock: e.target.checked,
                      }))
                    }
                  />
                  Παρακολούθηση αποθήκης
                </label>
                <label className="check">
                  <input
                    type="checkbox"
                    checked={productCard.active}
                    onChange={(e) =>
                      setProductCard((c) => ({
                        ...c,
                        active: e.target.checked,
                      }))
                    }
                  />
                  Ενεργό προϊόν
                </label>
              </div>
              {!editVatVerified && (
                <div className="op-alert warning">
                  Ο ΦΠΑ παραμένει μη επιβεβαιωμένος και εμφανίζεται καθαρά ως
                  εκκρεμότητα.
                </div>
              )}
              <div className="barcode-editor">
                <div className="section-heading">
                  <div>
                    <h4>Barcodes</h4>
                    <small>
                      Πολλαπλά barcodes και συσκευασίες για το ίδιο είδος.
                    </small>
                  </div>
                  <button
                    type="button"
                    className="secondary"
                    onClick={() =>
                      setProductCard((c) => ({
                        ...c,
                        barcodes: [
                          ...c.barcodes,
                          { barcode: "", unitMultiplier: "1" },
                        ],
                      }))
                    }
                  >
                    + Προσθήκη
                  </button>
                </div>
                {productCard.barcodes.length === 0 && (
                  <div className="empty-row">
                    Δεν έχει καταχωριστεί barcode.
                  </div>
                )}
                {productCard.barcodes.map((row, index) => (
                  <div className="barcode-row" key={index}>
                    <input
                      aria-label={`Barcode ${index + 1}`}
                      value={row.barcode}
                      onChange={(e) =>
                        setProductCard((c) => ({
                          ...c,
                          barcodes: c.barcodes.map((item, i) =>
                            i === index
                              ? { ...item, barcode: e.target.value }
                              : item,
                          ),
                        }))
                      }
                      placeholder="Barcode"
                    />
                    <input
                      aria-label={`Πολλαπλασιαστής ${index + 1}`}
                      type="number"
                      step="0.001"
                      min="0.001"
                      value={row.unitMultiplier}
                      onChange={(e) =>
                        setProductCard((c) => ({
                          ...c,
                          barcodes: c.barcodes.map((item, i) =>
                            i === index
                              ? { ...item, unitMultiplier: e.target.value }
                              : item,
                          ),
                        }))
                      }
                      placeholder="Τεμάχια"
                    />
                    <button
                      type="button"
                      className="remove-row"
                      onClick={() =>
                        setProductCard((c) => ({
                          ...c,
                          barcodes: c.barcodes.filter((_, i) => i !== index),
                        }))
                      }
                    >
                      Διαγραφή
                    </button>
                  </div>
                ))}
              </div>
              <div className="barcode-transfer">
                <h4>Μεταφορά υπάρχοντος barcode</h4>
                <small>
                  Επίλεξε το προϊόν προορισμού, γράψε το barcode και έλεγξε σε
                  ποιο προϊόν ανήκει. Η μεταφορά δεν αλλάζει τιμές, απόθεμα ή
                  ιστορικό.
                </small>
                <div className="barcode-row">
                  <input
                    aria-label="Barcode για μεταφορά"
                    inputMode="numeric"
                    value={transferBarcode}
                    onChange={(e) => {
                      setTransferBarcode(e.target.value);
                      setTransferReview(null);
                    }}
                    placeholder="Barcode από άλλο προϊόν"
                  />
                  <button
                    type="button"
                    className="secondary"
                    onClick={checkBarcodeOwner}
                    disabled={busy}
                  >
                    Έλεγχος
                  </button>
                </div>
                {transferReview && (
                  <div className="op-alert warning">
                    <b>{transferReview.barcode}</b> · Από «
                    {transferReview.owners[0].name}» (
                    {transferReview.owners[0].sku || "χωρίς SKU"}) προς «
                    {selectedProduct.name}». Ο πολλαπλασιαστής επανέρχεται σε 1
                    και τυχόν ειδική τιμή barcode αφαιρείται.
                    <button
                      type="button"
                      className="secondary"
                      onClick={transferExistingBarcode}
                      disabled={busy}
                    >
                      Επιβεβαίωση μεταφοράς
                    </button>
                  </div>
                )}
              </div>
              <div className="store-price-list">
                <div className="section-heading">
                  <div>
                    <h4>Καταστήματα, τιμές και alarm stock</h4>
                    <small>
                      Ξεχωριστή ενεργοποίηση, λιανική και ελάχιστο απόθεμα.
                    </small>
                  </div>
                </div>
                {activeStores.map((store) => (
                  <div className="store-product-card" key={store.id}>
                    <label className="check">
                      <input
                        type="checkbox"
                        checked={Boolean(priceStores[store.id]?.active)}
                        onChange={(e) =>
                          setPriceStores((c) => ({
                            ...c,
                            [store.id]: {
                              ...c[store.id],
                              active: e.target.checked,
                            },
                          }))
                        }
                      />
                      <Store />
                      {store.name}
                    </label>
                    <label>
                      Τιμή €
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={
                          priceStores[store.id]?.salePrice ?? editBasePrice
                        }
                        onChange={(e) =>
                          setPriceStores((c) => ({
                            ...c,
                            [store.id]: {
                              ...c[store.id],
                              salePrice: e.target.value,
                            },
                          }))
                        }
                      />
                    </label>
                    <label>
                      Alarm stock
                      <input
                        type="number"
                        step="0.001"
                        min="0"
                        value={priceStores[store.id]?.minStock ?? ""}
                        onChange={(e) =>
                          setPriceStores((c) => ({
                            ...c,
                            [store.id]: {
                              ...c[store.id],
                              minStock: e.target.value,
                            },
                          }))
                        }
                        placeholder="—"
                      />
                    </label>
                  </div>
                ))}
              </div>
              <button
                type="button"
                className="secondary product-card-save"
                onClick={() => setPreparationProduct(selectedProduct)}
              >
                Παρασκευή / Modifiers
              </button>
              <button
                className="primary product-card-save"
                onClick={saveProductCard}
                disabled={busy || !productCard.name.trim()}
              >
                <Check />
                Αποθήκευση καρτέλας προϊόντος
              </button>
            </aside>
          ) : (
            <aside className="op-box empty">
              Επίλεξε προϊόν για να ανοίξει η πλήρης καρτέλα του.
            </aside>
          )}
        </div>
      )}

      {tab === "promotions" && (
        <div className="op-grid two offers-workspace">
          <section className="op-box">
            <h3>Νέα μαζική προσφορά</h3>
            <form className="op-form" onSubmit={createPromotion}>
              <div className="promotion-product-picker">
                <div className="section-heading">
                  <div>
                    <b>Προϊόντα προσφοράς</b>
                    <small>{promotionProducts.length} επιλεγμένα</small>{promotionProducts.length>0&&<button type="button" className="promotion-selected-review-toggle" onClick={()=>setPromotionSelectionOpen(v=>!v)}>{promotionSelectionOpen?"Απόκρυψη επιλεγμένων":`Προβολή ${promotionProducts.length} επιλεγμένων`}</button>}
                  </div>
                  <div className="promotion-picker-actions">
                    <button
                      type="button"
                      className="secondary"
                      onClick={() =>
                        setPromotionProducts((previous) => [
                          ...new Set([
                            ...previous,
                            ...visiblePromotionProducts.map(
                              (product) => product.id,
                            ),
                          ]),
                        ])
                      }
                    >
                      Όλα τα εμφανιζόμενα
                    </button>
                    <button
                      type="button"
                      className="secondary"
                      onClick={() => setPromotionProducts([])}
                    >
                      Κανένα
                    </button>
                  </div>
                </div>
                <div className="offers-product-search">
                  <input
                    aria-label="Αναζήτηση προϊόντων προσφοράς"
                    value={promotionQuery}
                    onChange={(event) => setPromotionQuery(event.target.value)}
                    onKeyDown={(event)=>{if(event.key==="Enter"){event.preventDefault();searchPromotionProducts()}}}
                    placeholder="Όνομα, SKU ή barcode — τουλάχιστον 2 χαρακτήρες"
                  />
                  <button type="button" className="secondary" disabled={promotionSearchBusy} onClick={searchPromotionProducts}>{promotionSearchBusy?"Αναζήτηση…":"Αναζήτηση"}</button>
                </div>
                <div className="promotion-product-list">
                  {visiblePromotionProducts.map((product) => (
                    <label className="check" key={product.id}>
                      <input
                        type="checkbox"
                        checked={promotionProducts.includes(product.id)}
                        onChange={(event) =>
                          setPromotionProducts((previous) =>
                            event.target.checked
                              ? [...new Set([...previous, product.id])]
                              : previous.filter((id) => id !== product.id),
                          )
                        }
                      />
                      <span>
                        <b>{product.name}</b>
                        <small>
                          {product.sku || "χωρίς SKU"} ·{" "}
                          {money(effectiveSalePrice(product))}
                        </small>
                      </span>
                    </label>
                  ))}
                </div>
              </div>
              {promotionSelectionOpen&&promotionProducts.length>0&&<div className="promotion-selected-review"><div className="section-heading"><div><b>Επιλεγμένα προϊόντα προσφοράς</b><small>Έλεγχος πριν από την αποστολή</small></div><button type="button" className="secondary" onClick={()=>setPromotionProducts([])}>Καθαρισμός όλων</button></div><div className="promotion-selected-review-list">{promotionProducts.map(id=>{const product=promotionSelectionDetails[id]||catalog.find(row=>row.id===id);return <div key={id}><span><b>{product?.name||"Επιλεγμένο προϊόν"}</b><small>{product?.sku||id}</small></span><button type="button" onClick={()=>setPromotionProducts(previous=>previous.filter(productId=>productId!==id))}>Αφαίρεση</button></div>})}</div></div>}
              <div className="offers-summary">
                <div><b>{promotionProducts.length}</b><span>Επιλεγμένα προϊόντα</span></div>
                <div><b>{activeStores.length}</b><span>Διαθέσιμα καταστήματα</span></div>
              </div>
              <label>
                Τύπος
                <select
                  name="promotionType"
                  value={promotionType}
                  onChange={(e) => setPromotionType(e.target.value)}
                >
                  <option value="PERCENT">Ποσοστό % σε όλα</option>
                  <option value="AMOUNT">Έκπτωση € σε όλα</option>
                  <option value="BUY_X_GET_Y">Αγορά Χ + δωρεάν Υ</option>
                  <option value="FIXED_PRICE">
                    Κοινή τελική τιμή (1 προϊόν)
                  </option>
                </select>
              </label>
              {promotionType === "PERCENT" && (
                <label>
                  Έκπτωση %
                  <input
                    name="percentOff"
                    type="number"
                    min="0.01"
                    max="100"
                    step="0.01"
                    required
                  />
                </label>
              )}
              {promotionType === "AMOUNT" && (
                <label>
                  Έκπτωση €
                  <input
                    name="discountAmount"
                    type="number"
                    min="0.01"
                    step="0.01"
                    required
                    placeholder="π.χ. 0,40 ή 0,50"
                  />
                </label>
              )}
              {promotionType === "BUY_X_GET_Y" && (
                <div className="op-two">
                  <label>
                    Αγορά Χ
                    <input
                      name="buyQuantity"
                      type="number"
                      min="1"
                      step="1"
                      required
                    />
                  </label>
                  <label>
                    Δωρεάν Υ
                    <input
                      name="freeQuantity"
                      type="number"
                      min="1"
                      step="1"
                      required
                    />
                  </label>
                </div>
              )}
              {promotionType === "FIXED_PRICE" && (
                <label>
                  Τελική τιμή
                  <input
                    name="fixedPrice"
                    type="number"
                    min="0.01"
                    step="0.01"
                    required
                  />
                </label>
              )}
              <div className="op-two">
                <label>
                  Από
                  <input
                    name="startsAt"
                    type="datetime-local"
                    defaultValue={localInputDate(new Date())}
                    required
                  />
                </label>
                <label>
                  Έως
                  <input
                    name="endsAt"
                    type="datetime-local"
                    defaultValue={localInputDate(
                      new Date(Date.now() + 7 * 86400000),
                    )}
                    required
                  />
                </label>
              </div>
              <fieldset>
                <legend>Καταστήματα προσφοράς</legend>
                {activeStores.map((s) => (
                  <label className="check" key={s.id}>
                    <input
                      name={`store_${s.id}`}
                      type="checkbox"
                      defaultChecked
                    />
                    {s.name}
                  </label>
                ))}
              </fieldset>
              <button
                className="primary"
                disabled={busy || !promotionProducts.length}
              >
                Αποστολή σε {promotionProducts.length || 0} προϊόντα
              </button>
            </form>
          </section>
          <section className="op-box">
            <h3>Προσφορές</h3>
            <div className="promo-list">
              {promotions.map((p) => (
                <article key={p.id}>
                  <div>
                    <b>{p.productName}</b>
                    <small>
                      {p.promotionType === "GIFT"
                        ? `Αγορά ${Number(p.saleQuantity)} + ${Number(p.bonusQuantity)} δωρεάν`
                        : p.offerMode === "DISCOUNT_PERCENT"
                          ? `-${Number(p.discountPercent)}%`
                          : p.offerMode === "DISCOUNT_AMOUNT"
                            ? `-${money(p.discountAmount)}`
                            : `Τιμή ${money(p.offerPrice)}`}
                    </small>
                    <small>
                      {new Date(p.validFrom).toLocaleString("el-GR")} →{" "}
                      {p.validUntil
                        ? new Date(p.validUntil).toLocaleString("el-GR")
                        : "χωρίς λήξη"}
                    </small>
                    <small>
                      {(p.stores || []).map((s) => s.name).join(", ")}
                    </small>
                  </div>
                  <button
                    className={p.active ? "danger" : "secondary"}
                    onClick={() => togglePromotion(p)}
                  >
                    {p.active ? "Παύση" : "Ενεργοποίηση"}
                  </button>
                </article>
              ))}
            </div>
          </section>
        </div>
      )}

      {tab === "stocktake" && (
        <div className="op-grid two">
          <section className="op-box">
            <h3>Νέα απογραφή</h3>
            <form className="op-form" onSubmit={createStocktake}>
              <label>
                Κατάστημα
                <select name="storeId" required>
                  <option value="">Επιλογή</option>
                  {activeStores.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Ονομασία
                <input
                  name="name"
                  required
                  defaultValue={`Απογραφή ${new Date().toLocaleDateString("el-GR")}`}
                />
              </label>
              <button className="primary">
                <Boxes />
                Έναρξη απογραφής
              </button>
            </form>
            <h3>Ιστορικό</h3>
            <div className="promo-list">
              {stocktakes.map((st) => (
                <button
                  className="stocktake-card"
                  key={st.id}
                  onClick={() => openStocktakeById(st.id)}
                >
                  <span>
                    <b>{st.name}</b>
                    <small>
                      {st.storeName} ·{" "}
                      {new Date(st.startedAt).toLocaleString("el-GR")}
                    </small>
                  </span>
                  <span>
                    <em className={st.status === "FINALIZED" ? "ok" : ""}>
                      {st.status}
                    </em>
                    <small>
                      {st.countedCount}/{st.lineCount}
                    </small>
                  </span>
                </button>
              ))}
            </div>
          </section>
          <section className="op-box">
            {openStocktake ? (
              <>
                <div className="stocktake-head">
                  <div>
                    <h3>{openStocktake.name}</h3>
                    <p>
                      {openStocktake.storeName} · {openStocktake.status}
                    </p>
                  </div>
                  {openStocktake.status === "DRAFT" && (
                    <button className="primary" onClick={finalizeStocktake}>
                      Οριστικοποίηση
                    </button>
                  )}
                </div>
                <div className="stocktake-table">
                  <div className="stock-row head">
                    <span>Προϊόν</span>
                    <span>Θεωρητικό</span>
                    <span>Φυσικό</span>
                    <span>Διαφορά</span>
                    <span>Αξία</span>
                  </div>
                  {(openStocktake.lines || []).map((line) => (
                    <div className="stock-row" key={line.id}>
                      <span>
                        <b>{line.name}</b>
                        <small>{line.sku || "—"}</small>
                      </span>
                      <span>{n(line.expectedQuantity)}</span>
                      <span>
                        {openStocktake.status === "DRAFT" ? (
                          <input
                            type="number"
                            min="0"
                            step="0.001"
                            defaultValue={line.countedQuantity ?? ""}
                            onBlur={(e) =>
                              e.target.value !== "" &&
                              saveCount(line.id, e.target.value)
                            }
                          />
                        ) : (
                          n(line.countedQuantity)
                        )}
                      </span>
                      <span>{n(line.difference)}</span>
                      <span>{money(line.differenceValue)}</span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="empty">Επίλεξε ή ξεκίνησε απογραφή.</div>
            )}
          </section>
        </div>
      )}
      {tab === "inventory2" && (
        <InventoryV2Center
          api={api}
          stores={activeStores}
          catalog={catalog}
          loadCatalog={loadCatalog}
        />
      )}
      {preparationProduct && (
        <ProductPreparationEditor
          api={api}
          product={preparationProduct}
          onClose={() => setPreparationProduct(null)}
        />
      )}
    </div>
  );
}
