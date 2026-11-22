import assert from "node:assert/strict";
import test from "node:test";
import { recognizeLocalInvoice } from "../src/lib/local-invoice-ocr.mjs";

const pdf = { type: "application/pdf" };
const collectLines = ({ text, confidence }) => [{ text, confidence }];

function fixture(count, { failPage, failLoad, failCleanup } = {}) {
  const events = [];
  let current;
  const options = {
    async loadPdf(file) {
      assert.equal(file, pdf);
      return {
        promise: failLoad ? Promise.reject(new Error("malformed PDF")) : Promise.resolve({
          numPages: count,
          async getPage(number) {
            current = number;
            events.push(`get:${number}`);
            return {
              getViewport: () => ({ width: 100, height: 100 }),
              render: () => ({
                promise: number === failPage ? Promise.reject(new Error("render")) : Promise.resolve(),
              }),
              cleanup: () => events.push(`page-clean:${number}`),
            };
          },
        }),
        destroy: () => events.push("pdf-destroy"),
      };
    },
    createCanvas() {
      const number = current;
      const canvas = { width: 0, height: 0, getContext: () => ({}), toDataURL: () => number };
      Object.defineProperty(canvas, "height", {
        set(value) { if (!value) events.push(`canvas-clear:${number}`); },
      });
      return canvas;
    },
    async createWorker() {
      events.push("worker-create");
      return {
        async recognize(source) {
          events.push(source);
          return { data: { text: `MARKER ${source}`, confidence: 85 } };
        },
        async terminate() {
          events.push("worker-end");
          if (failCleanup) throw new Error("cleanup");
        },
      };
    },
  };
  return { options, events };
}

for (const count of [1, 3]) {
  test(`OCR reads ${count} PDF page(s) in order with one worker`, async () => {
    const { options, events } = fixture(count);
    const result = await recognizeLocalInvoice(pdf, collectLines, options);
    const numbers = Array.from({ length: count }, (_, index) => index + 1);
    const markers = numbers.map((number) => `MARKER ${number}`);
    assert.equal(result.pageCount, count);
    assert.equal(result.rawText, markers.join("\n"));
    assert.deepEqual(result.lines.map(({ text }) => text), markers);
    assert.equal(result.confidence, 85);
    assert.deepEqual(events, [
      "worker-create",
      ...numbers.flatMap((number) => [`get:${number}`, number, `canvas-clear:${number}`, `page-clean:${number}`]),
      "worker-end", "pdf-destroy",
    ]);
  });
}

test("page failure rejects the whole PDF and preserves the page error during cleanup", async () => {
  const { options, events } = fixture(3, { failPage: 2, failCleanup: true });
  await assert.rejects(recognizeLocalInvoice(pdf, collectLines, options), /σελίδα 2 από 3/);
  assert.deepEqual(events.slice(-5), ["get:2", "canvas-clear:2", "page-clean:2", "worker-end", "pdf-destroy"]);
});

test("malformed PDF destroys its loading task without starting Tesseract", async () => {
  const { options, events } = fixture(1, { failLoad: true });
  await assert.rejects(recognizeLocalInvoice(pdf, collectLines, options), /malformed PDF/);
  assert.deepEqual(events, ["pdf-destroy"]);
});

test("image is passed directly to OCR without opening a PDF", async () => {
  const image = { type: "image/png" };
  const { options, events } = fixture(1);
  const result = await recognizeLocalInvoice(image, collectLines, options);
  assert.equal(result.pageCount, null);
  assert.equal(result.pdfNote, null);
  assert.deepEqual(events, ["worker-create", image, "worker-end"]);
});

test("multipage PDF results over the line limit are rejected after cleanup", async () => {
  const { options, events } = fixture(2);
  const manyLines = (data) => Array.from({ length: 501 }, () => collectLines(data)[0]);
  await assert.rejects(recognizeLocalInvoice(pdf, manyLines, options), /1000 γραμμών/);
  assert.deepEqual(events.slice(-2), ["worker-end", "pdf-destroy"]);
});

test("multipage PDF results at the line limit keep every line", async () => {
  const { options } = fixture(2);
  const manyLines = (data) => Array.from({ length: 500 }, () => collectLines(data)[0]);
  const result = await recognizeLocalInvoice(pdf, manyLines, options);
  assert.equal(result.lines.length, 1000);
  assert.equal(result.lines[0].text, "MARKER 1");
  assert.equal(result.lines.at(-1).text, "MARKER 2");
});

test("PDF OCR rejects overlong raw text and overlong individual lines", async () => {
  const { options } = fixture(1);
  options.createWorker = () => ({
    recognize: () => ({ data: { text: "a".repeat(100001), confidence: 90 } }),
    terminate() {},
  });
  await assert.rejects(recognizeLocalInvoice(pdf, () => [], options), /100000 χαρακτήρων/);
  await assert.rejects(
    recognizeLocalInvoice(pdf, () => [{ text: "a".repeat(1001), confidence: 90 }], fixture(1).options),
    /γραμμή OCR 1.*1000 χαρακτήρων/,
  );
});
