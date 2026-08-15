const nativeFetch = window.fetch.bind(window);

const readJsonBody = (body) => {
  if (!body || typeof body !== "string") return null;
  try { return JSON.parse(body); } catch { return null; }
};

const tokenHeaders = () => {
  const token = localStorage.getItem("token");
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
};

const dataUrlToBytes = (dataUrl) => {
  const comma = String(dataUrl || "").indexOf(",");
  if (comma < 0) throw new Error("Μη έγκυρο αρχείο παραστατικού.");
  const base64 = dataUrl.slice(comma + 1);
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
};

const canvasToDataUrl = (canvas) => canvas.toDataURL("image/jpeg", 0.92);

async function pdfPreview(dataUrl) {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/legacy/build/pdf.worker.min.mjs",
    import.meta.url,
  ).toString();
  const pdf = await pdfjs.getDocument({ data: dataUrlToBytes(dataUrl) }).promise;
  const page = await pdf.getPage(1);
  const viewport = page.getViewport({ scale: 2 });
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  await page.render({ canvasContext: canvas.getContext("2d"), viewport }).promise;
  return {
    imageDataUrl: canvasToDataUrl(canvas),
    pageCount: pdf.numPages,
    pdfNote: pdf.numPages > 1
      ? `Αναγνώστηκε αυτόματα η πρώτη σελίδα από ${pdf.numPages} σελίδες. Το αρχικό PDF παραμένει το παραστατικό της πληρωμής.`
      : "Αναγνώστηκε αυτόματα η πρώτη σελίδα του PDF.",
  };
}

function collectLines(data) {
  const found = [];
  const visit = (node) => {
    if (!node) return;
    if (Array.isArray(node)) { node.forEach(visit); return; }
    if (node.text && node.words && String(node.text).trim()) {
      found.push({
        text: String(node.text).trim(),
        confidence: Math.max(0, Math.min(100, Math.round(Number(node.confidence) || 0))),
      });
    }
    for (const key of ["blocks", "paragraphs", "lines"]) visit(node[key]);
  };
  visit(data.blocks);
  if (found.length) return found;
  return String(data.text || "")
    .split(/\r?\n/)
    .map((text) => text.trim())
    .filter(Boolean)
    .map((text) => ({ text, confidence: Math.round(Number(data.confidence) || 0) }));
}

async function capabilities(storeId) {
  const response = await nativeFetch(`/api/store-pos/stores/${encodeURIComponent(storeId)}/capabilities`, {
    headers: tokenHeaders(),
  });
  if (!response.ok) return { invoiceAi: false };
  return response.json();
}

async function localOcr({ dataUrl, mimeType }) {
  let source = dataUrl;
  let pageCount = null;
  let pdfNote = null;
  if (mimeType === "application/pdf") {
    const preview = await pdfPreview(dataUrl);
    source = preview.imageDataUrl;
    pageCount = preview.pageCount;
    pdfNote = preview.pdfNote;
  }
  const { createWorker } = await import("tesseract.js");
  const worker = await createWorker("ell+eng");
  let result;
  try {
    result = await worker.recognize(source);
  } finally {
    await worker.terminate();
  }
  return {
    localConfidence: Math.max(0, Math.min(100, Math.round(Number(result?.data?.confidence) || 0))),
    result: {
      rawText: result?.data?.text || "",
      lines: collectLines(result?.data || {}),
      pageCount,
      pdfNote,
    },
    paymentImageDataUrl: source,
  };
}

async function createAiJob({ storeId, filename, mimeType, dataUrl, supplierId }) {
  const ocr = await localOcr({ dataUrl, mimeType });
  const response = await nativeFetch("/api/commerce/ai-reader/jobs", {
    method: "POST",
    headers: tokenHeaders(),
    body: JSON.stringify({
      storeId,
      filename,
      mimeType,
      dataUrl,
      localConfidence: ocr.localConfidence,
      result: {
        ...ocr.result,
        // Preserved in rawText as a harmless hint for operator review; server strips unknown fields.
        rawText: ocr.result.rawText,
      },
    }),
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || `Αποτυχία αποστολής OCR (${response.status}).`);
  }
  const job = await response.json();
  window.dispatchEvent(new CustomEvent("mws:pos-invoice-ocr-ready", {
    detail: { storeId, jobId: job.id, supplierId: supplierId || null, filename, confidence: ocr.localConfidence },
  }));
  return job;
}

async function preparePaymentRequest(url, init) {
  if (String(init?.method || "GET").toUpperCase() !== "POST") return null;
  const match = String(url || "").match(/\/api\/transactions\/stores\/([^/?#]+)/);
  if (!match) return null;
  const body = readJsonBody(init.body);
  if (!body || body.type !== "SUPPLIER_PAYMENT" || !body.attachment?.dataUrl) return null;

  const storeId = decodeURIComponent(match[1]);
  const originalDataUrl = body.attachment.dataUrl;
  const mimeMatch = /^data:([^;,]+);base64,/.exec(originalDataUrl);
  const mimeType = mimeMatch?.[1] || "image/jpeg";
  const filename = body.attachment.filename || (mimeType === "application/pdf" ? "timologio.pdf" : "timologio.jpg");
  let requestInit = init;

  // The legacy payment endpoint stores images. For PDF payments we keep OCR on the
  // original PDF and send a deterministic first-page JPEG preview to the ledger.
  if (mimeType === "application/pdf") {
    const preview = await pdfPreview(originalDataUrl);
    requestInit = {
      ...init,
      body: JSON.stringify({
        ...body,
        attachment: {
          ...body.attachment,
          dataUrl: preview.imageDataUrl,
          filename: `${filename.replace(/\.pdf$/i, "")}-preview.jpg`,
        },
      }),
    };
  }

  return {
    requestInit,
    storeId,
    supplierId: body.supplierId || null,
    originalDataUrl,
    mimeType,
    filename,
  };
}

window.fetch = async function mwsInvoiceAwareFetch(input, init = {}) {
  const url = typeof input === "string" ? input : input?.url;
  let prepared = null;
  try {
    prepared = await preparePaymentRequest(url, init);
  } catch (error) {
    console.warn("MyWorkStation invoice PDF preview:", error);
  }

  const response = await nativeFetch(input, prepared?.requestInit || init);
  if (!prepared || !response.ok) return response;

  // Do not delay or fail the successful payment if OCR has a problem.
  queueMicrotask(async () => {
    try {
      const caps = await capabilities(prepared.storeId);
      if (!caps?.invoiceAi) return;
      await createAiJob({
        storeId: prepared.storeId,
        filename: prepared.filename,
        mimeType: prepared.mimeType,
        dataUrl: prepared.originalDataUrl,
        supplierId: prepared.supplierId,
      });
    } catch (error) {
      console.error("MyWorkStation automatic invoice OCR:", error);
      window.dispatchEvent(new CustomEvent("mws:pos-invoice-ocr-error", {
        detail: { message: error?.message || "Η αυτόματη ανάγνωση τιμολογίου απέτυχε." },
      }));
    }
  });

  return response;
};

function enablePdfInput(root = document) {
  root.querySelectorAll?.(".pos-photo-actions input[type='file']").forEach((input) => {
    input.setAttribute("accept", "image/jpeg,image/png,image/webp,application/pdf");
  });
  root.querySelectorAll?.(".pos-ai-reader").forEach((button) => {
    if (!button.dataset.autoInvoiceLabel) {
      button.dataset.autoInvoiceLabel = "1";
      button.textContent = "Αυτόματη καταχώρηση τιμολογίου ενεργή";
    }
  });
}

enablePdfInput();
new MutationObserver(() => enablePdfInput()).observe(document.documentElement, { childList: true, subtree: true });

window.addEventListener("mws:pos-invoice-ocr-ready", (event) => {
  const confidence = Number(event.detail?.confidence || 0);
  console.info(`MyWorkStation: το τιμολόγιο στάλθηκε αυτόματα για έλεγχο OCR (${confidence}%).`);
});
