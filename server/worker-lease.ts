// Keep worker lease renewals sequential. Overlapping requests can arrive out
// of order and let a stale worker continue after ownership has been revoked.
// The server remains the authority for deciding whether finish is allowed.
export async function runWithLeaseHeartbeat(work,{
  heartbeat, intervalMs=10_000, schedule=setInterval, unschedule=clearInterval,
}={}) {
  if(typeof work!=='function'||typeof heartbeat!=='function')
    throw new TypeError('Worker and heartbeat callbacks are required.');
  const controller=new AbortController();
  let inFlight=null,stopped=false;
  const renew=()=>{
    if(stopped||controller.signal.aborted||inFlight)return;
    inFlight=Promise.resolve().then(()=>heartbeat()).catch(error=>{
      // A lost lease, missing task, or invalid credential must not allow the
      // current worker to publish a result as though it still owned the task.
      if([401,403,404,409].includes(error?.status))controller.abort();
      // Network and 5xx failures remain uncertain. The server independently
      // rejects an expired lease at finish; avoid claiming the job succeeded.
    }).finally(()=>{inFlight=null;});
  };
  const timer=schedule(renew,intervalMs);
  let result,workError;
  try { result=await work(controller.signal); }
  catch(error){workError=error;}
  finally {
    stopped=true;
    unschedule(timer);
    if(inFlight)await inFlight;
  }
  if(workError)throw workError;
  return {result,leaseLost:controller.signal.aborted};
}
