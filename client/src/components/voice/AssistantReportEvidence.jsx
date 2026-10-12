import React from "react";
import CashAssistantEvidence from "./CashAssistantEvidence.jsx";
import SalesAssistantEvidence from "./SalesAssistantEvidence.jsx";
import StockAssistantEvidence from "./StockAssistantEvidence.jsx";
import SalesStoresEvidence from "./SalesStoresEvidence.jsx";
import ConsumptionAssistantEvidence from "./ConsumptionAssistantEvidence.jsx";
export default function AssistantReportEvidence({result}){
 const evidence=result?.evidence||[];
 return <>{result?.sourceOnly&&<p className="mws-chat-source-notice" role="status">Η αναφορά παραδόθηκε από πραγματικά δεδομένα. Η σύνοψη του AI δεν ολοκληρώθηκε.</p>}<CashAssistantEvidence evidence={evidence.filter(r=>!r.kind&&r.closedShiftsOnly)}/><SalesAssistantEvidence evidence={evidence}/><StockAssistantEvidence evidence={evidence}/><SalesStoresEvidence evidence={evidence}/><ConsumptionAssistantEvidence evidence={evidence}/></>;
}
