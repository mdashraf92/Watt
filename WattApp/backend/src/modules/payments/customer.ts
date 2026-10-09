import { pool } from '../../db/pool';
import * as thawani from '../../integrations/thawani';

/** The user's Thawani customer id, creating it on first use. */
export async function ensureCustomer(userId: string): Promise<string> {
  const { rows } = await pool.query(
    `select thawani_customer_id from public.payment_customers where user_id = $1`, [userId],
  );
  if (rows[0]?.thawani_customer_id) return rows[0].thawani_customer_id as string;

  const customerId = await thawani.createCustomer(userId);
  await pool.query(
    `insert into public.payment_customers (user_id, thawani_customer_id) values ($1,$2)
     on conflict (user_id) do update set thawani_customer_id = excluded.thawani_customer_id`,
    [userId, customerId],
  );
  return customerId;
}
