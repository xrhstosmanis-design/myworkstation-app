import jwt from "jsonwebtoken";
import crypto from "node:crypto";
import {prisma} from "./prisma.js";
import {ensureChatMobileSchema,chatEnabled} from "./chat-mobile.mjs";
import {assertCustomerDemoRuntimeClosed} from "./customer-demo-runtime.js";
export function chatCredentialStamp(row,secret=process.env.JWT_SECRET){
 return crypto.createHmac("sha256",secret).update(JSON.stringify([row.id,row.pinHash||"",row.cardCodeHash||"",row.role])).digest("hex");
}
export async function issueChatOperatorSession(row,req){
 assertCustomerDemoRuntimeClosed(row);
 if(!await chatEnabled({id:row.storeId,companyId:row.companyId}))throw Object.assign(new Error("Το Chat δεν είναι ενεργό σε αυτό το κατάστημα."),{status:403});
 await ensureChatMobileSchema();
 const id=crypto.randomUUID(),expiresAt=new Date(Date.now()+12*3600000);
 await prisma.$executeRawUnsafe('INSERT INTO "StoreChatMobileSession" ("id","operatorId","companyId","storeId","expiresAt") VALUES ($1,$2,$3,$4,$5)',id,row.id,row.companyId,row.storeId,expiresAt);
 return jwt.sign({id:row.id,employeeId:row.employeeId,companyId:row.companyId,storeId:row.storeId,role:row.role,fullName:row.displayName,tokenType:"STORE_CHAT_OPERATOR",chatSessionId:id,credentialStamp:chatCredentialStamp(row)},process.env.JWT_SECRET,{expiresIn:"12h",issuer:"myworkstation-chat",audience:"store-chat-only"});
}
export async function authorizeChatOperator(req,payload,{db=prisma,secret=process.env.JWT_SECRET}={}){
 const path=String(req.originalUrl||"").split("?")[0],match=path.match(/^\/api\/store-chat\/stores\/([^/]+)\/[^/]+/);
 let requestedStore;try{requestedStore=match?decodeURIComponent(match[1]):null}catch{return null}
 if(payload.iss!=="myworkstation-chat"||payload.aud!=="store-chat-only"||!match||requestedStore!==payload.storeId||!payload.chatSessionId)return null;
 const rows=await db.$queryRawUnsafe('SELECT c."id",c."employeeId",c."companyId",c."storeId",c."role",c."displayName",c."pinHash",c."cardCodeHash" FROM "StoreChatMobileSession" sm JOIN "StoreOperatorCredential" c ON c."id"=sm."operatorId" AND c."companyId"=sm."companyId" AND c."storeId"=sm."storeId" JOIN "Employee" e ON e."id"=c."employeeId" AND e."active"=TRUE JOIN "Store" s ON s."id"=c."storeId" AND s."companyId"=c."companyId" AND s."active"=TRUE JOIN "Company" co ON co."id"=c."companyId" AND co."active"=TRUE WHERE sm."id"=$1 AND sm."operatorId"=$2 AND sm."storeId"=$3 AND sm."companyId"=$4 AND sm."revokedAt" IS NULL AND sm."expiresAt">NOW() AND c."active"=TRUE LIMIT 1',payload.chatSessionId,payload.id,payload.storeId,payload.companyId);
 const row=rows[0];if(!row||row.role!==payload.role||row.employeeId!==payload.employeeId||row.companyId!==payload.companyId||row.storeId!==payload.storeId||row.id!==payload.id||chatCredentialStamp(row,secret)!==payload.credentialStamp)return null;
 return {id:row.id,operatorId:row.id,employeeId:row.employeeId,companyId:row.companyId,storeId:row.storeId,fullName:row.displayName,role:row.role,tokenType:"STORE_OPERATOR",chatSessionId:payload.chatSessionId,chatCredentialStamp:payload.credentialStamp,permissions:["STORE_CHAT"]};
}
