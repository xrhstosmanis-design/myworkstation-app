export async function assertPosShiftOwner(db,{companyId,storeId,operatorId,terminalPos},status=409){
 const terminal=String(terminalPos||"MAIN").trim().toUpperCase()||"MAIN";
 const rows=await db.$queryRaw`
  SELECT "id" FROM "CashShiftSession"
  WHERE "companyId"=${companyId} AND "storeId"=${storeId} AND "status"='OPEN'
    AND UPPER(COALESCE(NULLIF(TRIM("terminalPos"),''),'MAIN'))=${terminal}
    AND "openedBy" IS DISTINCT FROM ${operatorId}
  LIMIT 1
 `;
 if(rows[0]){
  const error=new Error("Το ταμείο έχει ανοιχτή βάρδια άλλου χειριστή. Συνδέσου με τον χειριστή της βάρδιας. Αλλαγή χειριστή επιτρέπεται αφού κλείσει και παραδοθεί η προηγούμενη βάρδια.");
  error.status=status;error.code="POS_SHIFT_OTHER_OPERATOR";throw error;
 }
}
