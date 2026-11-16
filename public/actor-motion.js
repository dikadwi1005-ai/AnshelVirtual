import * as THREE from 'three';

const animatedGestures=new Set([
  'speak','speak-soft','speak-explain','seated-speak','seated-speak-explain',
  'phone','read','drink','snack','brew','game-play','game-react','take-parcel',
  'desk-work','desk-review','desk-cheer','stretch','emote-yes',
]);

// Keep actions with moving hands and lip/voice gestures smooth even when the
// camera focuses on the room rather than the character. Throttle slow idle
// poses on wide views to protect the 12-avatar rendering budget.
export function avatarAnimationInterval(stage,clip,focused=false) {
  if(focused || ['walking','sitting','departing','aligning'].includes(stage))return 1/30;
  if(animatedGestures.has(clip))return 1/24;
  return 1/15;
}

// Motion-matched local position of carried props. Snap on the first frame
// after a prop becomes visible, then gently filter tiny rig/clip transitions.
// It is intentionally NOT part of navigation, snapshots, or stored world state.
export function settleCarriedProp(prop,target,delta,{snap=false}={}) {
  if(!Number.isFinite(target.x)||!Number.isFinite(target.y)||!Number.isFinite(target.z))
    return false;
  const initialized=prop.userData.gripSettled===true;
  if(!initialized || snap || !(delta>0)) prop.position.copy(target);
  else prop.position.lerp(target,THREE.MathUtils.clamp(1-Math.exp(-delta*28),0,1));
  prop.userData.gripSettled=true;
  return true;
}

export function releaseCarriedProp(prop) {
  prop.userData.gripSettled=false;
}

// Stable per-employee variety without adding randomness to replay or presence.
export function speechGesture(index,seated) {
  if(seated)return index%2===0?'seated-speak':'seated-speak-explain';
  return ['speak','speak-soft','speak-explain'][index%3];
}
export function deskGesture(index,working) {
  return working || index%3!==1?'desk-work':'desk-review';
}
