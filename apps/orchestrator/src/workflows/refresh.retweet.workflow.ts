import { defineSignal, setHandler, proxyActivities, sleep } from '@temporalio/workflow';
import dayjs from 'dayjs';
import { RefreshRetweetActivity } from '@gitroom/orchestrator/activities/refresh.retweet.activity';

const { runRefreshRetweet, getRefreshSlots } =
  proxyActivities<RefreshRetweetActivity>({
    startToCloseTimeout: '45 minutes',
    taskQueue: 'main',
    retry: {
      maximumAttempts: 3,
      backoffCoefficient: 1,
      initialInterval: '1 minute',
    },
  });

const parseNextDelay = (slots: string[]) => {
  const now = dayjs();
  const slotDates = slots
    .map((slot) => {
      const [h, m] = slot.split(':').map((n) => +n);
      if (Number.isNaN(h) || Number.isNaN(m)) return null;
      return now.hour(h).minute(m).second(0).millisecond(0);
    })
    .filter(Boolean) as dayjs.Dayjs[];

  const todayTarget = slotDates.find((slot) => slot.isAfter(now));

  const target =
    todayTarget ||
    (slotDates.length
      ? slotDates[0].add(1, 'day')
      : now.add(15, 'minute')); // fallback if no slots

  return Math.max(target.diff(now, 'millisecond'), 0);
};

export async function refreshRetweetWorkflow() {
  let poked = false;
  const poke = defineSignal('poke');
  setHandler(poke, () => {
    poked = true;
  });

  while (true) {
    const slots = await getRefreshSlots();
    const delay = parseNextDelay(slots);
    let remaining = delay;
    const step = 60_000; // check every minute for a poke
    while (remaining > 0 && !poked) {
      const slice = Math.min(step, remaining);
      await sleep(slice);
      remaining -= slice;
    }
    poked = false;
    try {
      await runRefreshRetweet();
    } catch (err) {
      // ignore errors to keep the workflow alive
    }
  }
}
