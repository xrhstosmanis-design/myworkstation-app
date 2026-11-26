import {Router} from "express";
import {z} from "zod";
import {prisma} from "../prisma.js";
import {requireCompanyOrStoreModule} from "../middleware/module-access.js";
import {DIGITAL_WORK_CARD} from "../services/module-catalog.js";
import {digitalWorkCardDeparture} from "../services/digital-work-card-departure.js";
import {digitalWorkCardTrialClock,digitalWorkCardTrialReason,digitalWorkCardTrialState} from "./digital-work-card-trial-clock.js";

const router = Router();
const managementRoles = new Set(["OWNER", "ADMIN", "MANAGER", "SUPER_ADMIN"]);
const rangeQuery = z.object({
  from: z.string().datetime({offset:true}),
  to: z.string().datetime({offset:true}),
  beforeId: z.string().min(1).optional()
});
const PAGE_SIZE = 100;
const MAX_RANGE_MS = 31 * 86_400_000;

function requireManagement(req, res, next) {
  if (req.user?.tokenType === "STORE_OPERATOR" || req.user?.staffAccess
    || !managementRoles.has(req.user?.role)
    || (req.user.storeId && req.user.storeId !== req.params.storeId)) {
    return res.status(403).json({error:"Δεν έχεις πρόσβαση στα συμβάντα της Ψηφιακής Κάρτας αυτού του καταστήματος."});
  }
  next();
}

router.get("/stores/:storeId/events", requireManagement, requireCompanyOrStoreModule(DIGITAL_WORK_CARD), async (req, res, next) => {
  try {
    if (req.targetStore.id !== req.params.storeId) {
      return res.status(404).json({error:"Δεν βρέθηκε κατάστημα."});
    }
    const parsed = rangeQuery.safeParse(req.query);
    if (!parsed.success) return res.status(400).json({error:"Επίλεξε έγκυρο χρονικό διάστημα."});
    const {beforeId} = parsed.data;
    const from = new Date(parsed.data.from);
    const to = new Date(parsed.data.to);
    if (!(to > from) || to - from > MAX_RANGE_MS) {
      return res.status(400).json({error:"Επίλεξε χρονικό διάστημα έως 31 ημερών."});
    }
    const where = {
      storeId:req.targetStore.id,
      entryAt:{lt:to},
      OR:[
        {entryAt:{gte:from}},
        {departureAt:{gte:from, lt:to}}
      ]
    };
    if (beforeId) {
      const cursor = await prisma.digitalWorkSession.findFirst({where:{...where, id:beforeId}, select:{id:true, entryAt:true}});
      if (!cursor) return res.status(400).json({error:"Η συνέχεια της λίστας δεν είναι διαθέσιμη."});
      where.AND = [{OR:[
        {entryAt:{lt:cursor.entryAt}},
        {entryAt:cursor.entryAt, id:{lt:cursor.id}}
      ]}];
    }
    const page = await prisma.digitalWorkSession.findMany({
      where,
      orderBy:[{entryAt:"desc"}, {id:"desc"}],
      take:PAGE_SIZE + 1,
      select:{
        id:true,
        employee:{select:{id:true, fullName:true}},
        declaredStartAt:true, declaredEndAt:true, declaredRestDay:true,
        entryAt:true, entryStatus:true, entryErganiReference:true, entryError:true,
        departureAt:true, departureStatus:true, departureErganiReference:true, departureError:true, departureReason:true
      }
    });
    const now = new Date();
    const events = page.slice(0, PAGE_SIZE).map(session => ({
      ...session,
      departure: digitalWorkCardDeparture({
        declaredEndAt:session.declaredEndAt,
        entryAcceptedAt:session.entryStatus === "ACCEPTED" ? session.entryAt : null,
        departureAcceptedAt:session.departureStatus === "ACCEPTED" ? session.departureAt : null,
        departureAt:session.departureAt,
        reason:session.departureReason,
        now
      })
    }));
    res.json({events, nextBeforeId:page.length > PAGE_SIZE ? events.at(-1).id : null});
  } catch (error) {
    next(error);
  }
});

router.get("/stores/:storeId/reminders", (req, res, next) => {
  if (req.user?.tokenType !== "STORE_OPERATOR" || req.user.storeId !== req.params.storeId) {
    return res.status(403).json({error:"Οι υπενθυμίσεις είναι διαθέσιμες στο POS του καταστήματος."});
  }
  next();
}, requireCompanyOrStoreModule(DIGITAL_WORK_CARD), async (req, res, next) => {
  try {
    if (req.targetStore.id !== req.params.storeId) return res.status(404).json({error:"Δεν βρέθηκε κατάστημα."});
    const now = new Date();
    const sessions = await prisma.digitalWorkSession.findMany({
      where:{
        storeId:req.targetStore.id,
        entryStatus:"ACCEPTED",
        entryAt:{lte:now},
        declaredEndAt:{lte:new Date(now.getTime() + 3 * 60_000)},
        OR:[{departureStatus:null}, {departureStatus:{not:"ACCEPTED"}}]
      },
      orderBy:[{declaredEndAt:"asc"}, {id:"asc"}],
      select:{id:true, entryAt:true, declaredEndAt:true, employee:{select:{id:true, fullName:true}}}
    });
    const employees = new Map();
    for (const session of sessions) {
      const {showReminder} = digitalWorkCardDeparture({
        declaredEndAt:session.declaredEndAt,
        entryAcceptedAt:session.entryAt,
        now
      });
      if (showReminder && !employees.has(session.employee.id)) {
        employees.set(session.employee.id, {id:session.id, name:session.employee.fullName});
      }
    }
    res.json({reminders:[...employees.values()]});
  } catch (error) {
    next(error);
  }
});

router.get("/stores/:storeId/trial-clock", requireCompanyOrStoreModule(DIGITAL_WORK_CARD), digitalWorkCardTrialState);
router.post("/stores/:storeId/trial-clock", requireCompanyOrStoreModule(DIGITAL_WORK_CARD), digitalWorkCardTrialClock);

router.patch("/stores/:storeId/trial-clock/reason", requireCompanyOrStoreModule(DIGITAL_WORK_CARD), digitalWorkCardTrialReason);

export default router;
