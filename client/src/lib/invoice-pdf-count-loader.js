// Same local PDF.js build/worker used by the existing invoice PDF viewer.
import {getDocument,GlobalWorkerOptions} from "pdfjs-dist/build/pdf.mjs";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
GlobalWorkerOptions.workerSrc=workerUrl;
export {getDocument};
