const day=86400_000;
export const retention=7*day;
const maxChunks=180;

export function studioArchive() {
  let opening;
  async function database() {
    opening ??= new Promise((resolve,reject)=>{
      const request=indexedDB.open('anshel-studio',1);
      request.onupgradeneeded=()=>request.result.createObjectStore('replay',{keyPath:'start'});
      request.onsuccess=()=>resolve(request.result);
      request.onerror=()=>reject(request.error);
    });
    return opening;
  }
  async function run(mode,operation) {
    const db=await database();
    return new Promise((resolve,reject)=>{
      const transaction=db.transaction('replay',mode);
      let result;
      transaction.oncomplete=()=>resolve(result);
      transaction.onabort=()=>reject(transaction.error);
      operation(transaction.objectStore('replay'),value=>{result=value;});
    });
  }
  function trim(store,keys,now) {
    for (const key of keys) if (key<now-retention) store.delete(key);
    for (const key of keys.filter(key=>key>=now-retention).slice(0,-maxChunks)) store.delete(key);
  }
  return {
    save(chunk) {
      return run('readwrite',store=>{
        store.put(chunk);
        const keys=store.getAllKeys();
        keys.onsuccess=()=>trim(store,keys.result,Date.now());
      });
    },
    list() {
      return run('readwrite',(store,done)=>{
        const keys=store.getAllKeys();
        keys.onsuccess=()=>{
          const now=Date.now();
          trim(store,keys.result,now);
          done(keys.result.filter(key=>key>=now-retention).slice(-maxChunks).reverse());
        };
      });
    },
    get(start) {
      return run('readonly',(store,done)=>{
        const request=store.get(start);
        request.onsuccess=()=>done(request.result);
      });
    },
    events() {
      return run('readonly',(store,done)=>{
        const request=store.openCursor(null,'prev');
        const found=[];
        request.onsuccess=()=>{
          const cursor=request.result;
          if (!cursor || cursor.key<Date.now()-retention || found.length>=240) {
            done(found.slice(0,240).reverse());
            return;
          }
          for (const event of (cursor.value.events ?? []).slice().reverse()) found.push(event);
          cursor.continue();
        };
      });
    },
    clear() { return run('readwrite',store=>store.clear()); },
  };
}
