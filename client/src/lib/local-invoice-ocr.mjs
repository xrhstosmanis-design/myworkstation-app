async function openPdf(file) {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/legacy/build/pdf.worker.min.mjs",
    import.meta.url,
  ).toString();
  return pdfjs.getDocument({ data: await file.arrayBuffer(), stopAtErrors: true });
}

async function startWorker(onProgress) {
  const { createWorker } = await import("tesseract.js");
  return createWorker("ell+eng", 1, {
    logger: ({ status, progress }) => {
      if (status === "recognizing text") onProgress(progress || 0);
    },
  });
}

async function release(cleanup, primaryError) {
  try {
    await cleanup();
  } catch (error) {
    if (!primaryError) throw error;
  }
}

export async function recognizeLocalInvoice(
  file,
  collectLines,
  {
    onProgress = () => {},
    pdfImageType = "image/jpeg",
    loadPdf = openPdf,
    createWorker = startWorker,
    createCanvas = () => document.createElement("canvas"),
  } = {},
) {
  let task, worker, failure;
  const pages = [];
  let pageCount = null;
  let completed = 0;
  try {
    if (file.type === "application/pdf") {
      task = await loadPdf(file);
      const pdf = await task.promise;
      pageCount = pdf.numPages;
      worker = await createWorker((progress) => onProgress((completed + progress) / (pageCount || 1)));
      for (let number = 1; number <= pageCount; number += 1) {
        let page, canvas, pageFailure;
        try {
          page = await pdf.getPage(number);
          const viewport = page.getViewport({ scale: 2 });
          canvas = createCanvas();
          canvas.width = Math.ceil(viewport.width);
          canvas.height = Math.ceil(viewport.height);
          await page.render({ canvasContext: canvas.getContext("2d"), viewport }).promise;
          const { data } = await worker.recognize(canvas.toDataURL(pdfImageType, 0.92));
          pages.push(data);
          completed = number;
        } catch (error) {
          pageFailure = new Error(`Η τοπική ανάγνωση απέτυχε στη σελίδα ${number} από ${pageCount} του PDF.`, { cause: error });
          throw pageFailure;
        } finally {
          await release(() => {
            if (canvas) canvas.width = canvas.height = 0;
            page?.cleanup();
          }, pageFailure);
        }
      }
    } else {
      worker = await createWorker((progress) => onProgress((completed + progress) / (pageCount || 1)));
      const { data } = await worker.recognize(file);
      pages.push(data);
    }
  } catch (error) {
    failure = error;
    throw error;
  } finally {
    try {
      await release(() => worker?.terminate(), failure);
    } catch (error) {
      failure = error;
      throw error;
    } finally {
      await release(() => task?.destroy(), failure);
    }
  }

  return {
    confidence: Math.max(0, Math.min(100, Math.round(
      pages.reduce((sum, data) => sum + (Number(data?.confidence) || 0), 0) / pages.length,
    ))),
    rawText: pages.map((data) => data?.text || "").join("\n"),
    lines: pages.flatMap((data) => collectLines(data || {})),
    pageCount,
    pdfNote: pageCount === null ? null : `Το OCR διάβασε ${pageCount} από ${pageCount} σελίδες του PDF.`,
  };
}
