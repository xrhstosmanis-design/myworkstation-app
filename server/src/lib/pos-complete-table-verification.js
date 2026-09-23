// A complete-image reread replaces its input array after validating the
// printed rows and footer. Only the single-page learned Leventopoulos layout
// may use the actual candidate array here; other supplier flows retain their
// existing per-page selection behavior.
export function verificationLinesForLeventopoulos({pageCount,ruleKey,completePrintedTable,needsEmptyCompleteTableRead,productLines,unresolved}){
  if(pageCount===1&&ruleKey==="LEVENTOPOULOS_MM_POS1_COLUMNS"&&completePrintedTable)return productLines;
  return needsEmptyCompleteTableRead?productLines:unresolved;
}
