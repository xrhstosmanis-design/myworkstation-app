import { PrismaClient } from "@prisma/client";
import {withLifecyclePrisma} from "./services/store-lifecycle-context.js";
const rawPrisma = globalThis.prisma || new PrismaClient();
export const prisma = withLifecyclePrisma(rawPrisma);
if (process.env.NODE_ENV !== "production") globalThis.prisma = rawPrisma;
