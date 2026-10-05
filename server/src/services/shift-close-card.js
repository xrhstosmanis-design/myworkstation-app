import {timingSafeEqual} from "node:crypto";
import {normalizeWorkCard,workCardHash} from "../workforce-card-code.js";

const denied=()=>Object.assign(new Error("Σκάναρε την ενεργή προσωπική κάρτα του χειριστή που άνοιξε τη βάρδια. Το κλείσιμο δεν έγινε."),{status:403,code:"SHIFT_CLOSE_CARD_REQUIRED"});

export async function verifyShiftCloseCard(tx,user,session,cardCode){
  // Privileged BackOffice closure retains its existing authorization path.
  if(user?.tokenType!=="STORE_OPERATOR")return;
  const operatorId=user.operatorId||user.id;
  if(!operatorId||session.openedBy!==operatorId||session.companyId!==user.companyId||session.storeId!==user.storeId||normalizeWorkCard(cardCode).length<3)throw denied();
  const rows=await tx.$queryRaw`SELECT "cardCodeHash" FROM "StoreOperatorCredential"
    WHERE "id"=${operatorId} AND "employeeId"=${user.employeeId} AND "companyId"=${session.companyId}
      AND "storeId"=${session.storeId} AND "active"=TRUE FOR SHARE`;
  const expected=String(rows[0]?.cardCodeHash||"");
  if(!/^[a-f0-9]{64}$/i.test(expected)||!timingSafeEqual(Buffer.from(expected,"hex"),Buffer.from(workCardHash(cardCode),"hex")))throw denied();
}
