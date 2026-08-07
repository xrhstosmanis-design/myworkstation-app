import {prisma} from "../prisma.js";

async function rawExists(table,companyId,rowId,companyColumn="companyId"){
  if(!rowId)return true;
  const allowed=new Set(["ProductCategory","Product","Supplier","Customer"]);
  if(!allowed.has(table))throw new Error("Unsupported commerce tenant table.");
  const rows=await prisma.$queryRawUnsafe(`SELECT 1 FROM "${table}" WHERE "id"=$1 AND "${companyColumn}"=$2 LIMIT 1`,String(rowId),String(companyId));
  return rows.length>0;
}

async function employeeExists(companyId,employeeId){
  if(!employeeId)return true;
  const employee=await prisma.employee.findFirst({where:{id:String(employeeId),store:{companyId:String(companyId)}},select:{id:true}});
  return Boolean(employee);
}

async function barcodeExistsInCompany(companyId,barcode){
  const rows=await prisma.$queryRaw`
    SELECT 1
    FROM "ProductBarcode" b
    JOIN "Product" p ON p."id"=b."productId"
    WHERE p."companyId"=${String(companyId)} AND b."barcode"=${String(barcode)}
    LIMIT 1
  `;
  return rows.length>0;
}

function bad(res,label){
  return res.status(404).json({error:`Δεν βρέθηκε ${label} για τη συγκεκριμένη εταιρεία.`,code:"TENANT_REFERENCE_REJECTED"});
}

export async function commerceTenantGuard(req,res,next){
  try{
    const companyId=req.user?.companyId;
    if(!companyId)return res.status(401).json({error:"Απαιτείται σύνδεση."});
    const body=req.body||{};
    const path=String(req.path||"");

    if(path==="/products"&&req.method==="POST"){
      if(body.categoryId&&!await rawExists("ProductCategory",companyId,body.categoryId))return bad(res,"η κατηγορία προϊόντος");
      for(const barcode of [...new Set(Array.isArray(body.barcodes)?body.barcodes:[])]){
        if(await barcodeExistsInCompany(companyId,barcode)){
          return res.status(409).json({error:`Το barcode ${barcode} υπάρχει ήδη στον κατάλογο της εταιρείας.`,code:"DUPLICATE_COMPANY_BARCODE"});
        }
      }
    }

    if(path==="/purchases"&&req.method==="POST"){
      if(body.supplierId&&!await rawExists("Supplier",companyId,body.supplierId))return bad(res,"ο προμηθευτής");
      for(const line of Array.isArray(body.lines)?body.lines:[]){
        if(line?.productId&&!await rawExists("Product",companyId,line.productId))return bad(res,"το προϊόν παραστατικού");
      }
    }

    if(path==="/sales"&&req.method==="POST"){
      if(body.customerId&&!await rawExists("Customer",companyId,body.customerId))return bad(res,"ο πελάτης");
      if(body.operatorEmployeeId&&!await employeeExists(companyId,body.operatorEmployeeId))return bad(res,"ο εργαζόμενος πώλησης");
      for(const line of Array.isArray(body.lines)?body.lines:[]){
        if(line?.productId&&!await rawExists("Product",companyId,line.productId))return bad(res,"το προϊόν πώλησης");
      }
    }

    if(path==="/handover"&&req.method==="POST"){
      if(body.fromEmployeeId&&!await employeeExists(companyId,body.fromEmployeeId))return bad(res,"ο εργαζόμενος παράδοσης");
      if(body.toEmployeeId&&!await employeeExists(companyId,body.toEmployeeId))return bad(res,"ο εργαζόμενος παραλαβής");
    }

    if(path==="/documents/inbox"&&req.method==="POST"){
      if(body.supplierId&&!await rawExists("Supplier",companyId,body.supplierId))return bad(res,"ο προμηθευτής παραστατικού");
    }

    next();
  }catch(error){next(error)}
}
