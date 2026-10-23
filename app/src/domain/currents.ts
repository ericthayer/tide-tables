import { SLACK_MS } from './tide-math';
import type { CurrentEvent } from './types';

/** First slack still inside its slack window, and whether that window is now. */
export function nextSlack(events: readonly CurrentEvent[], now: number): { slack: CurrentEvent; then: CurrentEvent | undefined; isNow: boolean } | undefined {
  const i = events.findIndex((e) => e.kind === 'slack' && e.at >= now - SLACK_MS);
  const slack = events[i];
  if (!slack) return undefined;
  return { slack, then: events[i + 1], isNow: Math.abs(slack.at - now) <= SLACK_MS };
}
