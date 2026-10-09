import { Router } from "express";
import { z } from "zod";
import { auth } from "../middleware/auth.js";
import { prisma } from "../prisma.js";
import { createDemoPreparation, revokeDemoPreparation, demoView, demoPreparationEnabled } from "../services/customer-demo-preparation.js";

const router = Router();
const uuid = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
const input = z.object({ requestKey: uuid, displayName: z.string().trim().min(2).max(100), days: z.number().int().min(1).max(30).default(14) }).strict();
router.use(auth, (req, res, next) => {
  if (!(req.user?.isSuperAdmin === true || req.user?.platformRole === "SUPER_ADMIN")) return res.status(403).json({ error: "Απαιτείται πρόσβαση Platform Super Admin." });
  next();
});

function respond(error, res, next) {
  if (error.name === "ZodError") return res.status(400).json({ error: "Ελέγξτε όνομα, διάρκεια και ταυτότητα αιτήματος.", code: "DEMO_INVALID_INPUT" });
  if (error.code === "P2021") return res.status(503).json({ error: "Η προετοιμασία demo χρειάζεται ενημέρωση βάσης.", code: "DEMO_SCHEMA_REQUIRED" });
  if (error.status) return res.status(error.status).json({ error: error.code === "DEMO_NOT_FOUND" ? "Δεν βρέθηκε demo." : "Το αίτημα demo δεν μπορεί να εκτελεστεί.", code: error.code });
  next(error);
}

router.get("/", async (_req, res, next) => {
  try {
    if (!demoPreparationEnabled()) return res.json({ enabled: false, installable: false, demos: [] });
    const rows = await prisma.customerDemo.findMany({ orderBy: { createdAt: "desc" }, take: 100 });
    res.json({ enabled: true, installable: false, demos: rows.map(row => demoView(row)) });
  } catch (e) { respond(e, res, next); }
});
router.use((_req, res, next) => {
  if (!demoPreparationEnabled()) return res.status(503).json({ error: "Η δημιουργία demo δεν έχει ενεργοποιηθεί ακόμη.", code: "DEMO_PREPARATION_DISABLED" });
  next();
});
router.post("/", async (req, res, next) => {
  try { const result = await createDemoPreparation(prisma, req.user, input.parse(req.body)); res.status(result.created ? 201 : 200).json(result); }
  catch (e) { respond(e, res, next); }
});
router.post("/:demoId/revoke", async (req, res, next) => {
  try { z.object({}).strict().parse(req.body || {}); res.json({ demo: await revokeDemoPreparation(prisma, req.user, uuid.parse(req.params.demoId)) }); }
  catch (e) { respond(e, res, next); }
});
export default router;
