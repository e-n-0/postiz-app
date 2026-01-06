import { Injectable } from '@nestjs/common';
import { Activity, ActivityMethod } from 'nestjs-temporal-core';
import { sampleSize } from 'lodash';
import { IntegrationService } from '@gitroom/nestjs-libraries/database/prisma/integrations/integration.service';
import { IntegrationManager } from '@gitroom/nestjs-libraries/integrations/integration.manager';

@Injectable()
@Activity()
export class RefreshRetweetActivity {
  constructor(
    private _integrationService: IntegrationService,
    private _integrationManager: IntegrationManager
  ) {}

  @ActivityMethod()
  async runRefreshRetweet() {
    const plugs = await this._integrationService.getActivePlugsByFunction(
      'refreshRetweet',
      'x'
    );

    if (!plugs?.length) {
      return;
    }

    const provider = this._integrationManager.getSocialIntegration('x');

    for (const plug of plugs) {
      const tweetIds = this.parseTweetIds(plug.data);
      if (!tweetIds.length) {
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
}

