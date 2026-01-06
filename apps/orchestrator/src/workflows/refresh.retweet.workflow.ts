import { proxyActivities, sleep } from '@temporalio/workflow';
import dayjs from 'dayjs';
import { RefreshRetweetActivity } from '@gitroom/orchestrator/activities/refresh.retweet.activity';

const { runRefreshRetweet } = proxyActivities<RefreshRetweetActivity>({
  startToCloseTimeout: '20 minutes',
  taskQueue: 'main',
  retry: {
    maximumAttempts: 3,
    backoffCoefficient: 1,
    initialInterval: '1 minute',
  },
});

const SLOTS = [9, 16, 19, 21, 23];

const nextDelay = () => {
  const now = dayjs();
  const todayTarget = SLOTS.map((hour) =>
    now.hour(hour).minute(0).second(0).millisecond(0)
  ).find((slot) => slot.isAfter(now));

  const target =
    todayTarget ||
    now
      .add(1, 'day')
      .hour(SLOTS[0])
      .minute(0)
      .second(0)
      .millisecond(0);

  return Math.max(target.diff(now, 'millisecond'), 0);
};

export async function refreshRetweetWorkflow() {
  while (true) {
    await sleep(nextDelay());
    try {
      await runRefreshRetweet();
    } catch (err) {
      // ignore errors to keep the workflow alive
    }
  }
}
