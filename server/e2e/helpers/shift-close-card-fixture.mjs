import {workCardHash} from "../../src/workforce-card-code.js";

// Existing isolated HTTP suites now supply a registered card for operator close.
export async function withShiftCloseCardFixture(prisma,baseUrl,path,token,body){
  if(!/^\/api\/cash\/sessions\/[^/]+\/close$/.test(path)||!token||!body||body.cardCode!==undefined)return body;
  const user=JSON.parse(Buffer.from(token.split(".")[1],"base64url").toString());
  if(user.tokenType!=="STORE_OPERATOR")return body;
  if(!["127.0.0.1","localhost"].includes(new URL(baseUrl).hostname))throw new Error("Card fixtures require an isolated local E2E server");
  const cardCode=`E2ECLOSE${user.operatorId||user.id}`;
  const hash=workCardHash(cardCode);
  await prisma.$executeRaw`UPDATE "StoreOperatorCredential" SET "cardCodeHash"=${hash} WHERE "id"=${user.operatorId||user.id} AND "companyId"=${user.companyId} AND "storeId"=${user.storeId}`;
  return {...body,cardCode};
}
