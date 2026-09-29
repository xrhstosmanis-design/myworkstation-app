import "dotenv/config";
import {prisma} from "./prisma.js";
import {ensureStoreIntegrationSchema} from "./store-integration-bootstrap.js";
import {ensureEfoodIntegrationSchema} from "./efood-integration-bootstrap.js";

// The public efood webhook depends on additive columns in
// StoreIntegrationCredential and on the isolated efood evidence tables.
// Apply both bootstraps before the HTTP server starts so the first real
// Partner callback cannot reach a route backed by an older database schema.
try{
  await ensureStoreIntegrationSchema();
  await ensureEfoodIntegrationSchema();
  console.log("efood / Pelican startup schema bootstrap completed.");
}catch(error){
  console.error("efood / Pelican startup schema bootstrap failed.",error);
  process.exitCode=1;
}finally{
  await prisma.$disconnect();
}
