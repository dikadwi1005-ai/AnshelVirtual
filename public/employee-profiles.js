const approvedAssets = Object.freeze({
  'female-b': {presentation:'perempuan', hair:'Dua ikat', face:'Senyum', accessories:[], fabricTile:[2,2]},
  'female-c': {presentation:'perempuan', hair:'Sanggul dengan pita', face:'Senyum', accessories:['Kalung'], fabricTile:[5,2]},
  'female-e': {presentation:'perempuan', hair:'Ekor kuda hitam', face:'Senyum', accessories:[], fabricTile:[4,3]},
  'female-f': {presentation:'perempuan', hair:'Bob cokelat', face:'Senyum', accessories:[], fabricTile:[0,3]},
  'male-a': {presentation:'laki-laki', hair:'Pendek hitam', face:'Senyum', accessories:['Kacamata'], fabricTile:[1,2]},
  'male-b': {presentation:'laki-laki', hair:'Gundul', face:'Janggut cokelat', accessories:['Alat bantu dengar'], fabricTile:[3,2]},
  'male-f': {presentation:'laki-laki', hair:'Pendek hitam', face:'Alis tebal', accessories:[], fabricTile:[1,2]},
});

// Division keys match task routing. Employee IDs do not depend on roster order.
export const employeeProfiles = Object.freeze({
  management: {id:'avt-001', asset:'female-f', presentation:'perempuan', stature:1.64, outfit:'Atasan burgundi dan jeans', dye:'#ac4460'},
  operations: {id:'avt-002', asset:'male-b', presentation:'laki-laki', stature:1.68, outfit:'Kaos jingga dan celana biru'},
  administration: {id:'avt-003', asset:'female-c', presentation:'perempuan', stature:1.59, outfit:'Atasan biru dan rok merah'},
  hr: {id:'avt-004', asset:'female-b', presentation:'perempuan', stature:1.63, outfit:'Atasan koral dan rok ungu', dye:'#e77979'},
  development: {id:'avt-005', asset:'male-a', presentation:'laki-laki', stature:1.66, outfit:'Polo hijau dan jeans'},
  creative: {id:'avt-006', asset:'female-e', presentation:'perempuan', stature:1.58, outfit:'Blus putih dan celana gelap'},
  video: {id:'avt-007', asset:'male-f', presentation:'laki-laki', stature:1.71, outfit:'Kaos hijau dan overall cokelat'},
  social: {id:'avt-008', asset:'female-f', presentation:'perempuan', stature:1.57, outfit:'Atasan gelap dan jeans'},
  research: {id:'avt-009', asset:'male-a', presentation:'laki-laki', stature:1.74, outfit:'Polo biru dan jeans', dye:'#526eaf'},
  marketing: {id:'avt-010', asset:'female-b', presentation:'perempuan', stature:1.56, outfit:'Atasan kuning dan rok ungu'},
  qa: {id:'avt-011', asset:'female-c', presentation:'perempuan', stature:1.67, outfit:'Atasan ungu dan rok merah', dye:'#9c6ad0'},
  finance: {id:'avt-012', asset:'female-e', presentation:'perempuan', stature:1.65, outfit:'Blus mint dan celana gelap', dye:'#66baa5'},
});

export function employeeProfile(division) {
  const profile=employeeProfiles[division];
  const asset=profile && approvedAssets[profile.asset];
  if (!asset || profile.presentation!==asset.presentation ||
      !Number.isFinite(profile.stature) || profile.stature<1.45 || profile.stature>1.90 ||
      (profile.dye && !/^#[0-9a-f]{6}$/i.test(profile.dye))) {
    throw new Error('Profil karyawan tidak valid: '+division);
  }
  return {...asset,...profile,rig:'kenney-mini'};
}
