import {reviewedCashSourceArguments} from './assistant-reviewed-cash.js';
import {businessArguments} from './assistant-business-reports.js';
import {z} from "zod";
import {cashToolArguments} from "./assistant-cash-tools.js";
import {salesToolArguments} from "./owner-sales-tools.js";
import {stockToolArguments} from "./owner-stock-tools.js";
import {salesStoresArguments} from "./assistant-sales-stores.js";
import {consumptionArguments} from "./assistant-consumption.js";
export const assistantSourceNames=["cash_review","cash_details","sales_by_product","stock_by_product","sales_by_store","consumption_details","business_records"];
export function parseAssistantSourceRead(value){
 const read=z.object({name:z.enum(assistantSourceNames),args:z.unknown()}).strict().parse(value);
 const schema=read.name==="cash_review"?reviewedCashSourceArguments:read.name==="business_records"?businessArguments:read.name==="cash_details"?cashToolArguments:read.name==="sales_by_product"?salesToolArguments:read.name==="stock_by_product"?stockToolArguments:read.name==="sales_by_store"?salesStoresArguments:consumptionArguments;
 return {name:read.name,args:schema.parse(read.args)};
}
