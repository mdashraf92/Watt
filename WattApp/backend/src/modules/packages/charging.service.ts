import type { Pool, PoolClient } from 'pg';
import { AppError, forbidden, notFound, conflict } from '../../lib/errors';

export interface PackageRun {
  id: string; entitlement_id: string; user_id: string; connector_id: string;
  state: 'starting' | 'active' | 'stopping' | 'completed';
  device_id: string; switch_code: string; energy_code: string; energy_scale: number;
  meter_start: number | null; meter_last: number | null; kwh_limit: number | null;
  started_at: Date | null; deadline: Date; created_at: Date; ended_at: Date | null;
  stop_reason: string | null; flagged_review: boolean; already?: boolean;
}
export interface PackageHardware {
  read(run: PackageRun): Promise<{ on: boolean; energy: number }>;
  switch(run: PackageRun, on: boolean): Promise<void>;
}

// No payment arithmetic or client-provided energy readings enter this service.
// DB state commits before physical commands. An uncertain ON is always followed
// by an OFF attempt, and an uncertain OFF remains pending for the monitor.
export class PackageChargingService {
  constructor(private db: Pool, private hardware: PackageHardware) {}

  private async lock<T>(connector: string, work: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.db.connect();
    let locked = false;
    let destroy = false;
    try {
      const { rows } = await client.query('select pg_try_advisory_lock(hashtextextended($1, 91)) as ok', [connector]);
      if (!rows[0].ok) throw conflict('Charger operation in progress; retry shortly');
      locked = true;
      return await work(client);
    } finally {
      if (locked) {
        try { await client.query('select pg_advisory_unlock(hashtextextended($1, 91))', [connector]); }
        catch { destroy = true; }
      }
      client.release(destroy);
    }
  }

  private async get(client: PoolClient, id: string): Promise<PackageRun> {
    const { rows } = await client.query('select * from package_charging_runs where id=$1', [id]);
    if (!rows[0]) throw notFound('Package session not found');
    return rows[0];
  }

  async start(user: string, entitlement: string, connector: string, key: string): Promise<PackageRun> {
    return this.lock(connector, async client => {
      // A prior request is recoverable even when the monitor is currently stale.
      const prior = (await client.query('select * from package_charging_runs where user_id=$1 and start_key=$2', [user, key])).rows[0] as PackageRun | undefined;
      if (prior) {
        if (prior.entitlement_id !== entitlement || prior.connector_id !== connector) throw conflict('Start key already used');
        if (prior.state === 'starting' || prior.state === 'stopping') return this.stopLocked(client, prior, 'interrupted_start');
        return prior;
      }
      const { rows: monitor } = await client.query("select 1 from package_monitor where checked_at > now() - interval '90 seconds'");
      if (!monitor.length) throw new AppError(503, 'monitor_unavailable', 'Charging monitor is not ready');
      let run: PackageRun;
      await client.query('begin');
      try {
        await client.query("select set_config('request.jwt.claims',$1,true)", [JSON.stringify({ sub: user })]);
        run = (await client.query('select reserve_package_session($1,$2,$3) as result', [entitlement, connector, key])).rows[0].result;
        await client.query('commit');
      } catch (e) { await client.query('rollback'); throw e; }
      try {
        const before = await this.hardware.read(run);
        this.validReading(before.energy);
        if (before.on) throw conflict('Charger is already on; staff review required');
        if (Date.parse(String(run.deadline)) <= Date.now()) throw conflict('Package expired before charging started');
        // Persist baseline and timestamp BEFORE issuing ON, including lost acknowledgements.
        await client.query('update package_charging_runs set meter_start=$2,meter_last=$2,started_at=now() where id=$1', [run.id, before.energy]);
        run = await this.get(client, run.id);
        await this.hardware.switch(run, true);
        const after = await this.hardware.read(run);
        this.validReading(after.energy, before.energy);
        if (!after.on) throw new Error('Charger did not confirm start');
        await client.query("update package_charging_runs set state='active',meter_last=$2 where id=$1", [run.id, after.energy]);
        run = await this.get(client, run.id);
        if (this.exhausted(run)) return this.stopLocked(client, run, 'allowance');
        return run;
      } catch (e) {
        // A failed ON may actually have reached the device. Never free the slot
        // or remove the run until OFF is confirmed.
        await this.stopLocked(client, await this.get(client, run.id), 'start_failed').catch(() => {});
        throw e;
      }
    });
  }

  private validReading(energy: number, minimum = 0) {
    if (!Number.isFinite(energy) || energy < minimum) throw new Error('Invalid or reset cumulative energy meter');
  }

  private exhausted(run: PackageRun): boolean {
    return new Date(run.deadline).getTime() <= Date.now() ||
      (run.kwh_limit !== null && Number(run.meter_last) - Number(run.meter_start) >= Number(run.kwh_limit));
  }

  private async stopLocked(client: PoolClient, run: PackageRun, reason: string): Promise<PackageRun> {
    if (run.state === 'completed') return run;
    await client.query("update package_charging_runs set state='stopping',stop_reason=coalesce(stop_reason,$2) where id=$1", [run.id, reason]);
    await this.hardware.switch(run, false);
    const reading = await this.hardware.read(run);
    if (reading.on) throw new AppError(503, 'stop_pending', 'Stop not confirmed; the monitor will retry');
    let meter: number | null = reading.energy;
    let uncertain = run.meter_start === null || reason === 'start_failed' || reason === 'interrupted_start';
    try { this.validReading(reading.energy, Number(run.meter_last ?? run.meter_start ?? 0)); }
    catch { meter = null; uncertain = true; }
    const { rows } = await client.query('select finish_package_session($1,$2,$3,$4) as result', [run.id, meter, reason, uncertain]);
    return rows[0].result;
  }

  async stop(id: string, actor: string | null, admin = false, reason = 'customer'): Promise<PackageRun> {
    const { rows } = await this.db.query('select * from package_charging_runs where id=$1', [id]);
    if (!rows[0]) throw notFound('Package session not found');
    if (!admin && rows[0].user_id !== actor) throw forbidden();
    return this.lock(rows[0].connector_id, async client => this.stopLocked(client, await this.get(client, id), reason));
  }

  async poll(): Promise<{ id: string; state: string }[]> {
    const { rows } = await this.db.query("select * from package_charging_runs where state<>'completed' order by created_at");
    const results: { id: string; state: string }[] = [];
    for (const candidate of rows as PackageRun[]) {
      try {
        const state = await this.lock(candidate.connector_id, async client => {
          let run = await this.get(client, candidate.id);
          if (run.state === 'completed') return run.state;
          if (run.state !== 'active') return (await this.stopLocked(client, run, run.stop_reason ?? 'interrupted_start')).state;
          try {
            const reading = await this.hardware.read(run);
            this.validReading(reading.energy, Number(run.meter_last ?? run.meter_start));
            await client.query('update package_charging_runs set meter_last=$2 where id=$1', [run.id, reading.energy]);
            run = await this.get(client, run.id);
            if (!reading.on || this.exhausted(run)) return (await this.stopLocked(client, run, reading.on ? 'allowance' : 'device_off')).state;
            return run.state;
          } catch {
            return (await this.stopLocked(client, run, 'meter_unavailable')).state;
          }
        });
        results.push({ id: candidate.id, state });
      } catch {
        // Persisted active/stopping state is retained, keeping both resources
        // reserved. Operations can see the failure, and the next tick retries.
        results.push({ id: candidate.id, state: 'retry_required' });
      }
    }
    // Do not admit new sessions when any charger is unreachable.
    if (!results.some(r => r.state === 'retry_required')) {
      await this.db.query('insert into package_monitor(id,checked_at) values(true,now()) on conflict(id) do update set checked_at=excluded.checked_at');
    } else {
      await this.db.query('delete from package_monitor');
    }
    return results;
  }
}

// Explicit projection: never expose device IDs, meter configuration or user IDs.
export function publicPackageRun(run: PackageRun) {
  return {
    id: run.id, entitlement_id: run.entitlement_id, connector_id: run.connector_id,
    state: run.state, started_at: run.started_at, deadline: run.deadline,
    ended_at: run.ended_at, kwh_delivered: Math.max(0, Number(run.meter_last ?? 0) - Number(run.meter_start ?? 0)),
    cost: 0, flagged_review: run.flagged_review, stop_reason: run.stop_reason,
  };
}
