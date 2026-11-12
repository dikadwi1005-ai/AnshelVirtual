// The private Telegram owner may have long conversations and many tasks.
// Keep a generous daily budget and a short burst guard to prevent accidental floods.
export const ownerMessageDailyLimit=1000;
export const ownerMessageMinimumGapMs=2000;
export const ownerUpdateHistorySize=1200;

export function evaluateOwnerGroupUpdate(snapshot,updateId,now,today) {
  const earlier=Array.isArray(snapshot?.seen)?snapshot.seen:[];
  const cutoff=now-24*3600_000;
  const seen=earlier.filter(item=>item && typeof item.id==='string' &&
    Number.isFinite(item.at) && item.at>cutoff).slice(-ownerUpdateHistorySize);
  // Duplicate delivery is idempotent even when user has reached a quota.
  if(seen.some(item=>item.id===updateId)) return {duplicate:true};
  const used=snapshot?.date===today && Number.isSafeInteger(snapshot?.used) &&
    snapshot.used>=0?snapshot.used:0;
  if(used>=ownerMessageDailyLimit) return {reason:'daily-limit'};
  if(Number.isFinite(snapshot?.at) && now-snapshot.at<ownerMessageMinimumGapMs)
    return {reason:'too-fast'};
  seen.push({id:updateId,at:now});
  return {checkpoint:{seen,at:now,date:today,used:used+1}};
}
