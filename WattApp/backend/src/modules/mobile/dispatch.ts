import { query } from '../../db/pool';
import { notify } from '../../integrations/notify';
import { emitToUser } from '../../realtime/socket';

// Dispatch = deciding which van gets offered which job.
//
// The decision itself lives in SQL (public.mobile_dispatch_tick), because it
// mutates request state under row locks and must not interleave with a driver
// tapping Accept. This module is the side-effect half: the database hands back
// a list of "these people need telling", and we tell them.
//
// Two callers:
//   - runDispatch() right after a request is created, so the first offer goes
//     out immediately rather than up to a tick later.
//   - the /api/jobs/mobile-dispatch cron, which re-offers timed-out offers and
//     gives up on requests nobody took.

type Offer = {
  request_id: string;
  van_id: string;
  operator_id: string;
  expires_in_s: number;
  distance_km: number;
};
type Expired = { request_id: string; user_id: string };

export async function runDispatch(): Promise<{ offers: number; expired: number }> {
  const { rows } = await query<{ result: { offers: Offer[]; expired: Expired[] } }>(
    'select public.mobile_dispatch_tick() as result',
  );
  const offers  = rows[0]?.result?.offers  ?? [];
  const expired = rows[0]?.result?.expired ?? [];

  for (const o of offers) {
    // The driver has a countdown, so the socket event matters more than the
    // push — but send both: the app may be backgrounded at the roadside.
    emitToUser(o.operator_id, 'mobile_job_offer', {
      request_id: o.request_id,
      expires_in_s: o.expires_in_s,
      distance_km: o.distance_km,
    });
    await notify({
      userIds: [o.operator_id],
      category: 'charging',
      kind: 'mobile_job_offer',
      title: 'New mobile charge job',
      body: `A customer ${o.distance_km} km away needs a charge. Tap to accept.`,
      data: { request_id: o.request_id },
      // One notification per offer, not per tick — a re-offer to the same van
      // after a timeout is a genuinely new event and gets its own key.
      dedupeKey: `mobile_offer:${o.request_id}:${o.van_id}`,
    }).catch(() => {});
  }

  for (const e of expired) {
    emitToUser(e.user_id, 'mobile_job_update', { request_id: e.request_id, status: 'no_van' });
    await notify({
      userIds: [e.user_id],
      category: 'charging',
      kind: 'mobile_no_van',
      title: 'No van available',
      body: 'We could not find a van for your request. You have not been charged.',
      data: { request_id: e.request_id },
      dedupeKey: `mobile_no_van:${e.request_id}`,
    }).catch(() => {});
  }

  return { offers: offers.length, expired: expired.length };
}
