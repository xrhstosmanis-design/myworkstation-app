import {readInventoryReconciliation} from './inventory-reconciliation-source.js';
import {inventoryReconciliationWorkbook,inventoryReconciliationPdf} from './inventory-reconciliation-export.js';
export function createInventoryReconciliationHandler({db,access,requireLossDetection}) {
  return async (req,res,next) => {
    try {
      if (req.user?.staffAccess || req.user?.tokenType === 'INVENTORY_COUNTER') return res.status(403).json({error:'Δεν επιτρέπεται η προβολή του ελέγχου κόστους.'});
      if (Object.keys(req.query).some(k=>!['previousStocktakeId','format','expectedFingerprint'].includes(k)) ||
          req.query.previousStocktakeId !== undefined && (typeof req.query.previousStocktakeId !== 'string' || !req.query.previousStocktakeId || req.query.previousStocktakeId.length>120) ||
          req.query.format !== undefined && !['xlsx','pdf'].includes(req.query.format) ||
          req.query.expectedFingerprint !== undefined && (typeof req.query.expectedFingerprint !== 'string' || !/^[a-f0-9]{64}$/.test(req.query.expectedFingerprint))) return res.status(400).json({error:'Μη έγκυρες επιλογές αναφοράς.'});
      const st = await access(req,req.params.stocktakeId);
      if (!st) return res.status(404).json({error:'Δεν βρέθηκε η απογραφή.'});
      if (st.status !== 'FINALIZED') return res.status(409).json({error:'Ο έλεγχος απαιτεί οριστικοποιημένη απογραφή.'});
      if (!(await requireLossDetection(req,res,st))) return;
      const report = await readInventoryReconciliation(db,st,req.query.previousStocktakeId || null);
      report.current.storeName = st.storeName;
      res.setHeader('Cache-Control','private, no-store');
      const format = req.query.format;
      if (!format) return res.json(report);
      if (req.query.expectedFingerprint !== report.fingerprint) return res.status(409).json({error:'Τα στοιχεία άλλαξαν. Ανανέωσε την αναφορά πριν την εξαγωγή.'});
      const bytes = format === 'xlsx' ? inventoryReconciliationWorkbook(report) : await inventoryReconciliationPdf(report);
      res.json({filename:`inventory-reconciliation-${st.id}.${format}`,mimeType:format==='xlsx'?'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':'application/pdf',base64:bytes.toString('base64')});
    } catch(error) { next(error); }
  };
}
