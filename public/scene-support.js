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
