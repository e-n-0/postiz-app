import { Injectable } from '@nestjs/common';
import { Activity, ActivityMethod } from 'nestjs-temporal-core';
import { sampleSize } from 'lodash';
import { IntegrationService } from '@gitroom/nestjs-libraries/database/prisma/integrations/integration.service';
import { IntegrationManager } from '@gitroom/nestjs-libraries/integrations/integration.manager';
import dayjs from 'dayjs';

const DEFAULT_SLOTS = ['09:00', '16:00', '19:00', '21:00', '23:00'];

@Injectable()
@Activity()
export class RefreshRetweetActivity {
  constructor(
    private _integrationService: IntegrationService,
    private _integrationManager: IntegrationManager
  ) {}

  @ActivityMethod()
  async getRefreshSlots(): Promise<string[]> {
    const plugs = await this._integrationService.getActivePlugsByFunction(
      'refreshRetweet',
      'x'
    );

    const allSlots = plugs.flatMap((plug) =>
      this.parseSchedule(plug.data, DEFAULT_SLOTS)
    );

    return Array.from(new Set(allSlots)).sort();
  }

  @ActivityMethod()
  async runRefreshRetweet() {
    const plugs = await this._integrationService.getActivePlugsByFunction(
      'refreshRetweet',
      'x'
    );

    if (!plugs?.length) {
      console.log('No plugs found');
      return;
    }

    const provider = this._integrationManager.getSocialIntegration('x');
    // Use server local time to match the schedule defined by the user.
    const now = dayjs().format('HH:mm');

    for (const plug of plugs) {
      const schedule = this.parseSchedule(plug.data, DEFAULT_SLOTS);
      console.log('schedule', schedule, now);
      if (!schedule.includes(now)) {
        console.log('Not in schedule', plug.integration.name, now, schedule);
        continue;
      }

      const tweetIds = this.parseTweetIds(plug.data);
      if (!tweetIds.length) {
        console.log('No tweet ids found', plug.integration.name, plug.data);
        continue;
      }

      const pick = sampleSize(tweetIds, Math.min(3, tweetIds.length));

      try {
        // @ts-ignore
        await provider.refreshRetweet(plug.integration, pick);
      } catch (err) {
        // ignore failures for individual integrations to keep the loop running
      }
    }
  }

  private parseTweetIds(data: string) {
    const fields = (JSON.parse(data || '[]') as Array<{
      name: string;
      value: string;
    }>)!;

    const raw = fields.find((f) => f.name === 'tweetIds')?.value || '';
    const ids = raw
      .split(/\r?\n/)
      .map((p) => p.trim())
      .filter((p) => !!p)
      .map((p) => p.match(/(\d{5,})/)?.[1] || '')
      .filter((p) => !!p);

    return Array.from(new Set(ids));
  }

  private parseSchedule(data: string, fallback: string[]) {
    const fields = (JSON.parse(data || '[]') as Array<{
      name: string;
      value: string;
    }>)!;

    const raw = fields.find((f) => f.name === 'schedule')?.value || '';
    const times = raw
      .split(/\r?\n/)
      .map((p) => p.trim())
      .filter((p) => !!p)
      .map((p) => {
        const match = p.match(/^([0-2]?\d:[0-5]\d)$/);
        return match?.[1] || '';
      })
      .filter((p) => !!p);

    if (!times.length) {
      return fallback;
    }

    return Array.from(new Set(times));
  }
}

