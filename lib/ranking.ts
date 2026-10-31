import type { Group, ParseResult, Ranking } from './model';

export function parseRanking(input: string, group: Pick<Group, 'laws'>): ParseResult {
  const fail = (error: string): ParseResult => ({ tiers: [], error, valid: false, count: 0 });
  let text = input.normalize('NFKC').trim().replace(/[＞→]/g, '>').replace(/[、,，;；\s]+/g, '>').replace(/＝/g, '=');
  if (!text) return { tiers: [], error: null, valid: false, count: 0 };
  if (/^\d+$/.test(text) && group.laws.length <= 9) text = text.split('').join('>');
  if (!/^\d+(?:[>=]\d+)*$/.test(text)) return fail('请用数字排序，例如 3>1>2；并列用 =。');
  const numbers = text.split('>').map(tier => tier.split('=').map(Number));
  const seen = new Set<number>();
  for (const n of numbers.flat()) {
    if (!Number.isSafeInteger(n) || n < 1 || n > group.laws.length) return fail(`编号须在 1～${group.laws.length} 之间。`);
    if (seen.has(n)) return fail(`编号 ${n} 重复了，每条法律只能出现一次。`);
    seen.add(n);
  }
  return { tiers: numbers.map(tier => tier.map(n => group.laws[n-1].id)), error: null, valid: seen.size >= 2, count: seen.size };
}

export function formatRanking(tiers: Ranking, group: Pick<Group, 'laws'>): string {
  return tiers.filter(t=>t.length).map(tier => tier.map(id => group.laws.findIndex(l=>l.id===id)+1).join('=')).join('>');
}

export function rankPairs(tiers: Ranking) {
  const flat = tiers.flatMap((tier, rank) => tier.map(id => ({id, rank})));
  const pairs: {first: string; second: string; preference: number}[] = [];
  for (let i=0; i<flat.length; i++) for (let j=i+1; j<flat.length; j++) {
    pairs.push({ first: flat[i].id, second: flat[j].id, preference: Math.sign(flat[j].rank-flat[i].rank) });
  }
  return pairs;
}
