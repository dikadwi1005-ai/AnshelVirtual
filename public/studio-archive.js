const day=86400_000;
export const retention=7*day;
const maxChunks=180;

export function studioArchive() {
  let opening;
  async function database() {
    opening ??= new Promise((resolve,reject)=>{
      const request=indexedDB.open('anshel-studio',2);
      let blocked=false;
      request.onblocked=()=>{
        blocked=true;
        reject(new Error('Tutup tab Studio lain agar penyimpanan draf dapat diperbarui.'));
      };
      request.onupgradeneeded=event=>{
        if (event.oldVersion<1) request.result.createObjectStore('replay',{keyPath:'start'});
        if (event.oldVersion<2) request.result.createObjectStore('draft');
      };
      request.onsuccess=()=>{
        if (blocked) { request.result.close(); return; }
        request.result.onversionchange=()=>{request.result.close();opening=null;};
        resolve(request.result);
      };
      request.onerror=()=>reject(request.error);
    }).catch(error=>{
      opening=null;
      throw error;
    });
    return opening;
  }
  async function run(mode,operation,collection='replay') {
    const db=await database();
    return new Promise((resolve,reject)=>{
      const transaction=db.transaction(collection,mode);
      let result;
      transaction.oncomplete=()=>resolve(result);
      transaction.onabort=()=>reject(transaction.error);
      operation(transaction.objectStore(collection),value=>{result=value;});
    });
  }
  function trim(store,keys,now) {
    for (const key of keys) if (key<now-retention) store.delete(key);
    for (const key of keys.filter(key=>key>=now-retention).slice(0,-maxChunks)) store.delete(key);
  }
  return {
    saveDraft(draft) { return run('readwrite',store=>store.put(draft,'episode'),'draft'); },
    draft() {
      return run('readonly',(store,done)=>{
        const request=store.get('episode');
        request.onsuccess=()=>done(request.result);
      },'draft');
    },
    discardDraft() { return run('readwrite',store=>store.delete('episode'),'draft'); },
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
