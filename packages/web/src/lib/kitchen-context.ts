import { useSearchParams } from 'react-router-dom';
import { isWeekKey, weekStartOf } from '@potluck/core';

export function useWeek(): [string, (week: string) => void] {
  const [params, setParams] = useSearchParams();
  const raw = params.get('week');
  const week = raw && isWeekKey(raw) ? raw : weekStartOf();
  return [
    week,
    (next) =>
      setParams((previous) => {
        const p = new URLSearchParams(previous);
        p.set('week', next);
        return p;
      }),
  ];
}
export function kitchenPath(path: string, kitchenId: string, week?: string) {
  const params = new URLSearchParams({ kitchen: kitchenId });
  if (week) params.set('week', week);
  return `${path}?${params}`;
}
