import { AsyncLocalStorage } from 'async_hooks';
import { PrismaClient, Prisma } from '@prisma/client';

export const basePrisma = new PrismaClient();
export const tenantStorage = new AsyncLocalStorage<Prisma.TransactionClient>();

// Extend the prisma client to automatically wrap queries run outside of a tenant context
// in a transaction that sets a dummy tenant ID, ensuring it fails closed without errors.
export const prisma = basePrisma.$extends({
  query: {
    $allModels: {
      async $allOperations(params) {
        const { model, operation, args, query } = params;
        const rest = params as any;

        // If we are already inside a transaction block (like manual transactions),
        // we execute the query directly on that active transaction context.
        if (rest.__internalParams?.transaction) {
          return query(args);
        }

        const tx = tenantStorage.getStore();
        if (tx) {
          // If we already have a transaction from middleware, execute directly on it
          return (tx as any)[model][operation](args);
        }
        
        // Otherwise, wrap in a transaction with a dummy tenant ID to fail closed safely
        return basePrisma.$transaction(async (innerTx) => {
          await innerTx.$executeRawUnsafe(`SET LOCAL app.current_tenant = '00000000-0000-0000-0000-000000000000'`);
          return (innerTx as any)[model][operation](args);
        });
      }
    }
  }
}) as unknown as PrismaClient; // cast to PrismaClient for type compatibility

/**
 * Returns the active transaction client if inside a tenant context transaction,
 * otherwise falls back to the global PrismaClient.
 */
export function getPrisma(): Prisma.TransactionClient | PrismaClient {
  const tx = tenantStorage.getStore();
  return tx || prisma;
}
