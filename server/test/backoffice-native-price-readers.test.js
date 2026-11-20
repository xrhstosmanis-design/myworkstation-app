import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {Prisma} from '@prisma/client';
import {readPriceCatalogProducts} from '../src/routes/price-catalog-normalized.js';
import {readCustomerWholesalePrices} from '../src/routes/price-catalog.js';
const forbidden=()=>assert.fail('native pure price read attempted bootstrap/write');
test('actual normalized reader retains native VAT net/margin/markup, zero, paging and own-store validation',async()=>{
 const queries=[],db={$executeRaw:forbidden,$executeRawUnsafe:forbidden,store:{findFirst:async options=>{assert.deepEqual(options,{where:{id:'own',companyId:'company',active:true},select:{id:true}});return{id:'own'}}},$queryRaw:async(parts,...values)=>{const sql=parts.join('?');queries.push({sql,values});assert.doesNotMatch(sql,/\b(?:INSERT|UPDATE|DELETE|CREATE|ALTER)\b/i);return sql.includes('COUNT(*)')?[{count:2}]:[{id:'priced',salePrice:new Prisma.Decimal(24),vatRate:new Prisma.Decimal(20),lastCost:new Prisma.Decimal(10)},{id:'zero',salePrice:0,vatRate:0,lastCost:0}]}};
 const result=await readPriceCatalogProducts('company',{storeId:'own',q:'Named item',page:'2',pageSize:'25'},{db});
 assert.equal(result.items[0].saleNet,20);assert.equal(result.items[0].margin,50);assert.equal(result.items[0].markup,100);assert.equal(result.items[1].saleNet,0);assert.equal(result.items[1].margin,0);assert.equal(result.items[1].markup,0);assert.deepEqual({total:result.total,page:result.page,pageSize:result.pageSize,pages:result.pages,storeId:result.storeId},{total:2,page:2,pageSize:25,pages:1,storeId:'own'});assert.equal(queries.length,2);assert.ok(queries[1].values.includes('%Named item%'));assert.deepEqual(queries[1].values.slice(-2),[25,25]);
 await assert.rejects(readPriceCatalogProducts('company',{storeId:'foreign'},{db:{...db,store:{findFirst:async()=>null},$queryRaw:forbidden}}),{status:404});
});
test('actual retail-customer wholesale reader retains independent wholesale/retail net margins and native zero handling',async()=>{
 let query;const db={$executeRaw:forbidden,$executeRawUnsafe:forbidden,$queryRaw:async(parts,...values)=>{query={sql:parts.join('?'),values};return[{id:'row',wholesalePrice:new Prisma.Decimal(12),salePrice:new Prisma.Decimal(24),vatRate:new Prisma.Decimal(20),lastCost:new Prisma.Decimal(4)},{id:'zero',wholesalePrice:0,salePrice:0,vatRate:0,lastCost:0}]}};
 const result=await readCustomerWholesalePrices('company',{q:'Named customer',customerId:'own-customer'},{db});const row=result.items[0];assert.equal(row.wholesaleNet,10);assert.equal(row.retailNet,20);assert.equal(row.customerMargin,60);assert.equal(row.productMargin,80);assert.equal(result.items[1].customerMargin,0);assert.equal(result.items[1].productMargin,0);assert.match(query.sql,/FROM "CustomerWholesalePrice"/);assert.doesNotMatch(query.sql,/WholesaleCustomer|WHOLESALE_B2B/);assert.ok(query.values.includes('own-customer'));assert.ok(query.values.includes('%Named customer%'));
});
test('native pure price reader bodies preserve independently frozen original SQL, calculations and defaults',async()=>{
 const cases=[['price-catalog-normalized.js','readPriceCatalogProducts','966200be7aa248dcdcf873a24b06dea77a51fb8f16ce2a2de7b16868a28dacef'],['price-catalog.js','readCustomerWholesalePrices','0ce2264158b7ffddf4c2fd5883043b197afcd39d5630c1f7af4f4f0897c2b5b6']];
 for(const[file,name,expected]of cases){const source=await readFile(new URL('../src/routes/'+file,import.meta.url),'utf8'),start=source.indexOf('export async function '+name+'('),bodyStart=source.indexOf('{const prisma=db;',start)+'{const prisma=db;'.length,end=source.indexOf('}\nrouter.get(',bodyStart),body=source.slice(bodyStart,end);assert.ok(start>=0&&end>bodyStart);assert.equal(createHash('sha256').update(body.replace(/\s/g,'')).digest('hex'),expected)}
});
