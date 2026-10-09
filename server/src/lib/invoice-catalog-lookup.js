import {catalogPatterns,rankCatalogMatches} from '../../../shared/invoice-catalog-match.mjs';

export function createInvoiceCatalogLookup(db){return async(req,res,next)=>{try{
 const companyId=req.user?.companyId;
 if(!companyId)return res.status(403).json({error:'Δεν υπάρχει έγκυρη εταιρεία.'});
 const lines=await db.$queryRaw`SELECT o."storeId" FROM "PurchaseOrderLine" l JOIN "PurchaseOrder" o ON o."id"=l."orderId" JOIN "Store" s ON s."id"=o."storeId" AND s."companyId"=o."companyId" WHERE l."id"=${req.params.lineId} AND l."orderId"=${req.params.orderId} AND o."companyId"=${companyId} LIMIT 1`;
 const storeId=lines[0]?.storeId;
 if(!storeId||req.query.storeId&&req.query.storeId!==storeId||req.user.tokenType==='STORE_OPERATOR'&&req.user.storeId!==storeId)return res.status(404).json({error:'Δεν βρέθηκε η γραμμή στο επιλεγμένο κατάστημα.'});
 const query=String(req.query.q||'').trim().slice(0,250),barcode=String(req.query.barcode||(/^\d{6,18}$/.test(query)?query:'')).trim();
 if(barcode&&!/^\d{6,18}$/.test(barcode))return res.status(400).json({error:'Το barcode πρέπει να έχει 6–18 ψηφία.'});
 if(!barcode&&query.length<2)return res.status(400).json({error:'Γράψε τουλάχιστον 2 χαρακτήρες.'});
 let rows;
 if(barcode){
  rows=await db.$queryRaw`SELECT p."id",p."name",p."sku",p."vatRate",COALESCE(sp."salePrice",p."salePrice") AS "salePrice",p."costPrice",COALESCE((SELECT json_agg(b."barcode") FROM "ProductBarcode" b WHERE b."productId"=p."id"),'[]') AS "barcodes" FROM "Product" p JOIN "StoreProduct" sp ON sp."productId"=p."id" AND sp."storeId"=${storeId} AND sp."active"=true WHERE p."companyId"=${companyId} AND p."active"=true AND EXISTS(SELECT 1 FROM "ProductBarcode" b WHERE b."productId"=p."id" AND b."barcode"=${barcode}) ORDER BY p."name",p."id" LIMIT 100`;
  return res.json({storeId,barcode,rows,offset:0,exact:true,total:rows.length,hasMore:false});
 }
 const patterns=catalogPatterns(query);if(!patterns.length)patterns.push(`%${query.replace(/[%_\\]/g,'\\$&')}%`);
 // Bound candidate work, rank semantic tokens before paging, and expose truncation.
 rows=await db.$queryRaw`SELECT p."id",p."name",p."sku",p."vatRate",COALESCE(sp."salePrice",p."salePrice") AS "salePrice",p."costPrice",COALESCE((SELECT json_agg(b."barcode") FROM "ProductBarcode" b WHERE b."productId"=p."id"),'[]') AS "barcodes" FROM "Product" p JOIN "StoreProduct" sp ON sp."productId"=p."id" AND sp."storeId"=${storeId} AND sp."active"=true WHERE p."companyId"=${companyId} AND p."active"=true AND (translate(upper(p."name"),'ΆΈΉΊΌΎΏΪΫ','ΑΕΗΙΟΥΩΙΥ') ILIKE ANY(${patterns}::text[]) OR p."sku" ILIKE ${`%${query.replace(/[%_\\]/g,'\\$&')}%`}) ORDER BY (SELECT COUNT(*) FROM unnest(${patterns}::text[]) term WHERE translate(upper(p."name"),'ΆΈΉΊΌΎΏΪΫ','ΑΕΗΙΟΥΩΙΥ') ILIKE term) DESC,p."name",p."id" LIMIT 1001`;
 const truncated=rows.length>1000,ranked=rankCatalogMatches(rows.slice(0,1000),query),offset=Math.max(0,Math.min(975,Number(req.query.offset)||0));
 res.json({storeId,query,rows:ranked.slice(offset,offset+25),total:ranked.length,offset,hasMore:offset+25<ranked.length,truncated,exact:false});
 }catch(error){next(error)}}}
