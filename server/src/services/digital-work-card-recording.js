const conflict = (message, code) => Object.assign(new Error(message), {status:409, code});

export async function recordDigitalWorkCardEntry(db, {
  storeId, employeeId, requestId, occurredAt, schedule, operatorId, companyId
}) {
  return db.$transaction(async tx => {
    const employees = await tx.$queryRaw`
      SELECT "id" FROM "Employee"
      WHERE "id" = ${employeeId} AND "storeId" = ${storeId} AND "active" = true
      FOR UPDATE
    `;
    if (!employees.length) {
      throw Object.assign(new Error("Δεν βρέθηκε ενεργός εργαζόμενος στο κατάστημα."), {status:404});
    }
    const scope = {storeId, employeeId};
    const existing = await tx.digitalWorkSession.findFirst({where:{...scope, entryRequestId:requestId}});
    if (existing) return existing;
    const open = await tx.digitalWorkSession.findFirst({where:{
      ...scope,
      entryStatus:{in:["PENDING", "ACCEPTED", "UNKNOWN"]},
      OR:[{departureStatus:null}, {departureStatus:{not:"ACCEPTED"}}]
    }});
    if (open) {
      throw Object.assign(conflict("Υπάρχει ήδη προσέλευση που χρειάζεται έλεγχο ή αποχώρηση.", "DIGITAL_WORK_SESSION_OPEN"), {
        workSessionId:open.id
      });
    }

    const cashShifts = operatorId && companyId ? await tx.$queryRaw`
      SELECT "id" FROM "CashShiftSession"
      WHERE "storeId" = ${storeId} AND "companyId" = ${companyId}
        AND "openedBy" = ${operatorId} AND "status" = 'OPEN'
      ORDER BY "openedAt" DESC LIMIT 2
    ` : [];

    return tx.digitalWorkSession.create({data:{
      ...scope, entryRequestId:requestId, entryAt:occurredAt,
      cashShiftId:cashShifts.length === 1 ? cashShifts[0].id : null,
      declaredStartAt:schedule?.startsAt ?? null,
      declaredEndAt:schedule?.endsAt ?? null,
      declaredRestDay:schedule?.restDay ?? null
    }});
  });
}

export async function recordDigitalWorkCardDeparture(db, {
  storeId, employeeId, sessionId, requestId, occurredAt, reason
}) {
  const where = {id:sessionId, storeId, employeeId, entryStatus:"ACCEPTED"};
  const updated = await db.digitalWorkSession.updateMany({
    where:{...where, entryAt:{lte:occurredAt}, departureRequestId:null},
    data:{
      departureRequestId:requestId, departureAt:occurredAt,
      departureStatus:"PENDING", departureReason:reason?.trim() || null
    }
  });
  const record = await db.digitalWorkSession.findFirst({where:{...where, departureRequestId:requestId}});
  if (updated.count === 1 || record) return record;
  throw conflict("Η αποχώρηση δεν αντιστοιχεί σε επιβεβαιωμένη προσέλευση ή έχει ήδη καταγραφεί.", "DIGITAL_WORK_DEPARTURE_CONFLICT");
}

export async function openCashShiftWithWorkCard(tx, {storeId, employeeId, cashShiftId}, insert) {
  const employees = await tx.$queryRaw`
    SELECT "id" FROM "Employee"
    WHERE "id" = ${employeeId} AND "storeId" = ${storeId} AND "active" = true
    FOR UPDATE
  `;
  const rows = await insert(tx);
  if (!rows[0] || !employees.length) return rows;

  const session = await tx.digitalWorkSession.findFirst({
    where:{
      storeId, employeeId, cashShiftId:null,
      entryAt:{lte:rows[0].openedAt},
      entryStatus:{in:["PENDING", "ACCEPTED", "UNKNOWN"]},
      OR:[{departureStatus:null}, {departureStatus:{not:"ACCEPTED"}}]
    },
    orderBy:[{entryAt:"desc"}, {id:"desc"}],
    select:{id:true}
  });
  if (session) {
    await tx.digitalWorkSession.updateMany({
      where:{id:session.id, storeId, employeeId, cashShiftId:null},
      data:{cashShiftId}
    });
  }
  return rows;
}
