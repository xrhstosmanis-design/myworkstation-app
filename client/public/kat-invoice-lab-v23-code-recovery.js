/* KAT Invoice Lab V2.3 — focused supplier-code recovery helper.
   Safe test-only helper: no POS intake, purchase order or stock mutation. */
window.KAT_V23 = {
  version: 'V2.3',
  async makeSupplierCodeCrops(file) {
    if (!String(file?.type || '').startsWith('image/')) return [];
    const bitmap = await createImageBitmap(file);
    const specs = [
      { name: 'codes-upper', y0: .14, y1: .48 },
      { name: 'codes-middle', y0: .34, y1: .70 },
      { name: 'codes-lower', y0: .56, y1: .94 }
    ];
    const crops = [];
    for (const s of specs) {
      const sx = 0;
      const sw = Math.max(1, Math.floor(bitmap.width * .62));
      const sy = Math.max(0, Math.floor(bitmap.height * s.y0));
      const sh = Math.max(1, Math.floor(bitmap.height * (s.y1 - s.y0)));
      const targetW = Math.min(3600, Math.max(2600, sw * 3.2));
      const scale = targetW / sw;
      const targetH = Math.max(900, Math.round(sh * scale));
      const canvas = document.createElement('canvas');
      canvas.width = targetW;
      canvas.height = targetH;
      const ctx = canvas.getContext('2d');
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, targetW, targetH);
      ctx.drawImage(bitmap, sx, sy, sw, sh, 0, 0, targetW, targetH);
      crops.push({ name: s.name, dataUrl: canvas.toDataURL('image/jpeg', .99) });
    }
    bitmap.close?.();
    return crops;
  },
  codeFromRaw(line) {
    const raw = String(line?.rawText || '').trim();
    const m = raw.match(/^\s*(\d{5,14})\b/);
    return m ? m[1] : String(line?.code || '').trim();
  },
  discountAudit(line) {
    const initial = Number(line?.initialAmount || 0);
    const net = Number(line?.netAmount || 0);
    const amount = Number(line?.discount1Amount || 0);
    if (!(initial > 0 && net >= 0)) return { ok: false, expected: 0 };
    const expected = Math.round((initial - net + Number.EPSILON) * 100) / 100;
    return { ok: Math.abs(expected - amount) <= .02, expected };
  }
};
