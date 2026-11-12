export function lowGraphics(preference, {compact=false,coarse=false,memory}={}) {
  if (preference==='low') return true;
  if (preference==='normal') return false;
  return (compact && coarse) || (Number.isFinite(memory) && memory<=4);
}

export function sceneFailureMessage(error) {
  const detail=String(error?.message || error || 'Penyebab tidak diketahui').replace(/\s+/g,' ').slice(0,150);
  if (/webgl.*context|context.*webgl/i.test(detail)) {
    return 'Konteks grafis 3D gagal dibuat. Coba grafis Ringan atau tutup tab lain. Panel tugas tetap tersedia.';
  }
  return 'Kantor 3D gagal dimuat: '+detail+'. Panel tugas tetap tersedia.';
}

export class SceneModuleError extends Error {
  constructor(cause) {
    super('Paket 3D gagal dimuat. '+(cause?.message ?? String(cause)),{cause});
  }
}

export async function loadSceneModule(importer) {
  try {
    const module=await importer();
    if (typeof module?.officeScene!=='function') throw new Error('Versi modul tidak cocok dengan aplikasi.');
    return module.officeScene;
  } catch (error) {
    throw new SceneModuleError(error);
  }
}

// Cached app.js from older releases still imports this named export.
export async function importSceneWithRetry(importer,now=()=>Date.now()) {
  try { return await importer('./scene.bundle.js'); }
  catch(error) {
    console.warn('Modul kantor 3D gagal diunduh, mencoba ulang',error);
    return importer('./scene.bundle.js?retry='+now());
  }
}
