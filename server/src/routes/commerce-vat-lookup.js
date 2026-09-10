import {Router} from "express";
import {prisma} from "../prisma.js";
import {requireCompanyModule} from "../middleware/module-access.js";
import {decryptStoreIntegrationCredentials,ensureStoreIntegrationSchema} from "./platform-store-integrations.js";

const router=Router();
const clean=value=>String(value||"").toUpperCase().replace(/^EL/,"").replace(/\D/g,"");

export function normalizeViesResult(payload,taxId){
  const valid=payload?.isValid===true||payload?.valid===true;
  return {valid,taxId,name:String(payload?.name||"").trim(),address:String(payload?.address||"").replace(/\s+/g," ").trim(),source:"EU_VIES",requestDate:payload?.requestDate||null};
}

const xmlEscape=value=>String(value||"").replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&apos;"}[char]));
const xmlValue=(xml,name)=>{const match=String(xml||"").match(new RegExp(`<(?:\\w+:)?${name}[^>]*>([\\s\\S]*?)<\\/(?:\\w+:)?${name}>`,"i"));return match?match[1].replace(/<[^>]+>/g,"").replace(/&amp;/g,"&").replace(/&lt;/g,"<").replace(/&gt;/g,">").trim():""};
export function normalizeAadeResult(xml,taxId){
  const error=xmlValue(xml,"error_descr")||xmlValue(xml,"faultstring");
  if(error)return {valid:false,taxId,error,source:"AADE_BASIC_REGISTRY"};
  const name=xmlValue(xml,"onomasia"),city=xmlValue(xml,"postal_area_description"),profession=xmlValue(xml,"firm_act_descr");
  const address=[xmlValue(xml,"postal_address"),xmlValue(xml,"postal_address_no"),xmlValue(xml,"postal_zip_code"),city].filter(Boolean).join(" ");
  return {valid:Boolean(name),taxId,name,address,city,profession,source:"AADE_BASIC_REGISTRY"};
}

router.get("/vat-lookup",requireCompanyModule("DOCUMENTS"),async(req,res,next)=>{try{
  const storeId=String(req.query.storeId||""),taxId=clean(req.query.taxId);
  if(!/^\d{9}$/.test(taxId))return res.status(400).json({error:"Το ελληνικό ΑΦΜ πρέπει να έχει 9 ψηφία."});
  const store=await prisma.store.findFirst({where:{id:storeId,companyId:req.user.companyId},select:{id:true}});
  if(!store)return res.status(404).json({error:"Δεν βρέθηκε το κατάστημα."});
  const existing=await prisma.supplier.findFirst({where:{companyId:req.user.companyId,taxId},select:{id:true,name:true,taxId:true}});
  if(existing)return res.json({valid:true,taxId,name:existing.name,address:"",source:"MYWORKSTATION",existingSupplier:existing,readOnly:true});
  await ensureStoreIntegrationSchema();
  const configured=await prisma.$queryRaw`SELECT "credentialsEnc","enabled" FROM "StoreIntegrationCredential" WHERE "companyId"=${req.user.companyId} AND "storeId"=${store.id} AND "kind"='VAT_LOOKUP' LIMIT 1`;
  if(configured[0]?.enabled){
    const company=await prisma.company.findUnique({where:{id:req.user.companyId},select:{taxId:true}}),credentials=decryptStoreIntegrationCredentials(configured[0].credentialsEnc),calledBy=clean(company?.taxId);
    if(!/^\d{9}$/.test(calledBy))return res.status(409).json({error:"Για αναζήτηση ΑΑΔΕ πρέπει να έχει καταχωριστεί το ΑΦΜ της επιχείρησης στο MyWorkStation."});
    const envelope=`<?xml version="1.0" encoding="UTF-8"?><env:Envelope xmlns:env="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ns1="http://rgwspublic2/RgWsPublic2Service" xmlns:ns2="http://rgwspublic2/RgWsPublic2"><env:Header><ns2:AuthenticationHeader><ns2:username>${xmlEscape(credentials.accountId)}</ns2:username><ns2:password>${xmlEscape(credentials.secret)}</ns2:password></ns2:AuthenticationHeader></env:Header><env:Body><ns1:rgWsPublic2AfmMethod><ns1:INPUT_REC><ns2:afm_called_by>${calledBy}</ns2:afm_called_by><ns2:afm_called_for>${taxId}</ns2:afm_called_for></ns1:INPUT_REC></ns1:rgWsPublic2AfmMethod></env:Body></env:Envelope>`;
    const aade=await fetch("https://www1.gsis.gr/wsaade/RgWsPublic2/RgWsPublic2",{method:"POST",headers:{"Content-Type":"text/xml; charset=utf-8","SOAPAction":"rgWsPublic2AfmMethod"},body:envelope,signal:AbortSignal.timeout(15000)});
    const result=normalizeAadeResult(await aade.text(),taxId);
    if(!aade.ok||!result.valid)return res.status(404).json({error:result.error||"Το ΑΦΜ δεν βρέθηκε στο βασικό μητρώο ΑΑΔΕ. Δεν άλλαξαν στοιχεία.",taxId,source:result.source});
    return res.json({...result,existingSupplier:null,readOnly:true});
  }
  const response=await fetch("https://ec.europa.eu/taxation_customs/vies/rest-api/check-vat-number",{method:"POST",headers:{"Content-Type":"application/json","Accept":"application/json"},body:JSON.stringify({countryCode:"EL",vatNumber:taxId}),signal:AbortSignal.timeout(15000)});
  if(!response.ok)throw Object.assign(new Error(`Η επίσημη υπηρεσία VIES δεν απάντησε (${response.status}). Δοκίμασε ξανά.`),{status:502});
  const result=normalizeViesResult(await response.json(),taxId);
  if(!result.valid)return res.status(404).json({error:"Το ΑΦΜ δεν επιβεβαιώθηκε στο VIES. Δεν άλλαξαν τα στοιχεία του προμηθευτή.",taxId,source:"EU_VIES"});
  res.json({...result,existingSupplier:null,readOnly:true});
}catch(error){next(error)}});

export default router;
