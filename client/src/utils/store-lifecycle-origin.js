const origins=new Map();
export function rememberLifecycleOrigin(storeId,generation){if(!origins.has(storeId))origins.set(storeId,generation)}
export const capturedLifecycleGeneration=storeId=>origins.get(storeId)??'0';
export const originalLifecycleHeaders=(storeId,generation='0')=>({'x-mws-store-generations':JSON.stringify({[storeId]:generation})});
