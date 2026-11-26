import {z} from "zod";
import {greeceDateInput} from "../../../shared/greece-time.mjs";
import {digitalWorkCardDeparture} from "../services/digital-work-card-departure.js";
import {digitalWorkCardAlertKinds, sendDigitalWorkCardAlert} from "../services/digital-work-card-alerts.js";
import {prisma} from "../prisma.js";
import {authenticateErganiTrial} from "../services/ergani-trial-work-card.js";
import {recordDigitalWorkCardDeparture, recordDigitalWorkCardEntry} from "../services/digital-work-card-recording.js";
import {sendRecordedDigitalWorkCard} from "../services/digital-work-card-submission.js";

const configuration = z.object({
  storeId:z.string().min(1),
  employeeId:z.string().min(1),
  employerTaxId:z.string().regex(/^\d{9}$/),
  employeeTaxId:z.string().regex(/^\d{9}$/),
  branchNumber:z.string().regex(/^\d+$/),
  firstName:z.string().trim().min(1),
  lastName:z.string().trim().min(1),
  username:z.string().trim().min(1),
  password:z.string().min(1),
  overtimeThresholdMinutes:z.number().int().min(0).max(1440).optional(),
  schedule:z.discriminatedUnion("restDay", [
    z.object({restDay:z.literal(true), day:z.string().regex(/^\d{4}-\d{2}-\d{2}$/)}),
    z.object({restDay:z.literal(false), startsAt:z.string().datetime({offset:true}), endsAt:z.string().datetime({offset:true})})
  ]).optional()
});

function trialConfig() {
  if (process.env.ERGANI_TRIAL_CLOCK_ENABLED !== "true") return null;
  try {
    const parsed = configuration.safeParse(JSON.parse(process.env.ERGANI_TRIAL_CLOCK_CONFIG || "{}"));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function isErganiTrialEmployee(user, storeId) {
  const config = trialConfig();
  return Boolean(config && user?.tokenType === "STORE_OPERATOR"
    && user.storeId === storeId && config.storeId === storeId && user.employeeId === config.employeeId);
}

function scopedTrialConfig(req) {
  const config = trialConfig();
  if (!config || req.user?.tokenType !== "STORE_OPERATOR"
    || req.targetStore?.id !== req.params.storeId
    || req.user.storeId !== config.storeId || req.targetStore?.id !== config.storeId
    || req.user.employeeId !== config.employeeId) return null;
  return config;
}

function trialScheduleFor(config, now) {
  const schedule = config.schedule;
  if (!schedule) return null;
  if (schedule.restDay) return schedule.day === greeceDateInput(now) ? {restDay:true} : null;
  const startsAt = new Date(schedule.startsAt);
  const endsAt = new Date(schedule.endsAt);
  if (endsAt <= startsAt || greeceDateInput(startsAt) !== greeceDateInput(now)) return null;
  return {startsAt, endsAt, restDay:false};
}

export async function digitalWorkCardTrialState(req, res, next) {
  try {
    const config = scopedTrialConfig(req);
    if (!config) return res.status(404).json({error:"Η δοκιμαστική Ψηφιακή Κάρτα δεν είναι διαθέσιμη."});
    const session = await prisma.digitalWorkSession.findFirst({
      where:{storeId:config.storeId, employeeId:config.employeeId},
      orderBy:[{entryAt:"desc"}, {id:"desc"}],
      select:{id:true, entryStatus:true, departureStatus:true, departureAt:true, declaredEndAt:true, departureReason:true}
    });
    const departure = session ? digitalWorkCardDeparture({
      declaredEndAt:session.declaredEndAt, departureAt:session.departureAt, reason:session.departureReason
    }) : null;
    res.json({
      session:session ? {id:session.id, entryStatus:session.entryStatus, departureStatus:session.departureStatus, reasonPending:departure.reasonPending} : null,
      restDay:trialScheduleFor(config, new Date())?.restDay === true
    });
  } catch (error) {
    next(error);
  }
}

const requestSchema = z.discriminatedUnion("type", [
  z.object({type:z.literal("IN"), requestId:z.string().uuid()}),
  z.object({type:z.literal("OUT"), requestId:z.string().uuid(), sessionId:z.string().min(1).max(128), reason:z.string().trim().max(500).optional()})
]);

export async function digitalWorkCardTrialClock(req, res, next) {
  try {
    const config = scopedTrialConfig(req);
    if (!config) {
      return res.status(404).json({error:"Η δοκιμαστική Ψηφιακή Κάρτα δεν είναι διαθέσιμη."});
    }

    const parsed = requestSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({error:"Η σήμανση δεν είναι έγκυρη."});
    const {type, requestId} = parsed.data;
    const occurredAt = new Date();
    const scope = {storeId:config.storeId, employeeId:config.employeeId};
    const sendAlert = (sessionId, kind) => {
      void sendDigitalWorkCardAlert({
        db:prisma, companyId:req.user.companyId, storeId:scope.storeId,
        sessionId, kind, audience:"LAB", trialRecipients:process.env.ERGANI_TRIAL_ALERT_RECIPIENTS
      }).catch(() => console.warn("Digital Work Card trial alert could not be recorded."));
    };
    const token = await authenticateErganiTrial(config);
    let event;
    try {
      event = type === "IN"
        ? await recordDigitalWorkCardEntry(prisma, {...scope, requestId, occurredAt, operatorId:req.user.id, companyId:req.user.companyId, schedule:trialScheduleFor(config, occurredAt)})
        : await recordDigitalWorkCardDeparture(prisma, {...scope, ...parsed.data, occurredAt});
    } catch (error) {
      if (error.code === "DIGITAL_WORK_SESSION_OPEN" && error.workSessionId) {
        sendAlert(error.workSessionId, "DUPLICATE_ENTRY");
      }
      throw error;
    }

    const result = await sendRecordedDigitalWorkCard({
      db:prisma, ...scope, token, type, requestId,
      sessionId:event.id, identity:config, referenceDate:greeceDateInput(type === "IN" ? event.entryAt : event.departureAt)
    });
    const status = result.sent ? result.status : type === "IN" ? event.entryStatus : event.departureStatus;
    res.json({sessionId:event.id, status});
    const alerts = digitalWorkCardAlertKinds({...event, type, status, overtimeThresholdMinutes:config.overtimeThresholdMinutes});
    for (const kind of alerts) sendAlert(event.id, kind);
  } catch (error) {
    next(error);
  }
}

export async function digitalWorkCardTrialReason(req, res, next) {
  try {
    const config = scopedTrialConfig(req);
    if (!config) return res.status(404).json({error:"Η δοκιμαστική Ψηφιακή Κάρτα δεν είναι διαθέσιμη."});
    const parsed = z.object({sessionId:z.string().min(1).max(128), reason:z.string().trim().min(1).max(500)}).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({error:"Συμπλήρωσε τον λόγο αποχώρησης."});
    const where = {id:parsed.data.sessionId, storeId:config.storeId, employeeId:config.employeeId, departureReason:null};
    const session = await prisma.digitalWorkSession.findFirst({
      where, select:{declaredEndAt:true, departureAt:true}
    });
    if (!session || !digitalWorkCardDeparture(session).requiresReason) {
      return res.status(409).json({error:"Δεν υπάρχει εκκρεμής αιτιολόγηση για αυτή τη σήμανση."});
    }
    const updated = await prisma.digitalWorkSession.updateMany({where, data:{departureReason:parsed.data.reason}});
    if (!updated.count) return res.status(409).json({error:"Η αιτιολόγηση έχει ήδη καταχωριστεί."});
    res.json({saved:true});
  } catch (error) {
    next(error);
  }
}
