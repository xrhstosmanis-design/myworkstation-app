import {z} from 'zod';

export const extraWalletRecipientMarker='wallet-extra:';
const emailAddress=z.string().trim().max(254).email().refine(value=>!/[\r\n,;]/.test(value));

export const extraWalletEmailSchema=z.array(emailAddress).max(10).transform(addresses=>
  [...new Set(addresses.map(address=>address.toLowerCase()))]
);

export async function readExtraWalletEmails(db,companyId){
  const [saved]=await db.$queryRaw`
    SELECT "detail"->'extraNotificationEmails' AS "emails" FROM "AiOwnerWalletAudit"
    WHERE "companyId"=${companyId} AND "event"='CONFIGURED' AND "detail" ? 'extraNotificationEmails'
    ORDER BY ("detail"->>'version')::bigint DESC LIMIT 1`;
  return saved?extraWalletEmailSchema.parse(saved.emails):[];
}
