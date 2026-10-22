import {prisma} from '../prisma.js';
import {createAiOwnerWalletRepository} from './ai-owner-wallet-repository.js';
import {createWalletProvider} from './ai-owner-wallet-provider.js';
export const aiOwnerWalletRepository=createAiOwnerWalletRepository(prisma);
export const meterOwnerProvider=createWalletProvider({repository:aiOwnerWalletRepository});
