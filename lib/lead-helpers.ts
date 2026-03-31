import {
  concernAreaLabels,
  type ConcernArea,
  type Lead,
  type PatientSummary,
} from '@/types/lead'

const focusAreasByConcern: Partial<Record<ConcernArea, string[]>> = {
  // New group values
  yuz_hatlari: ['Dudak', 'Çene hattı', 'Yanak'],
  cizgiler_kirisiklik: ['Alın', 'Kaş arası', 'Kaz ayağı', 'Nazolabial'],
  cilt: ['Cilt kalitesi', 'Cilt görünümü'],
  // Legacy values
  goz_cevresi: ['Göz çevresi', 'Orta yüz'],
  dudak: ['Dudak', 'Alt yüz'],
  alt_yuz_jawline: ['Alt yüz', 'Jawline'],
  cilt_gorunumu: ['Cilt görünümü', 'Yüz tonu'],
  genel_yuz_dengesi: ['Yüz dengesi', 'Orta yüz'],
}

export function buildPatientSummary(lead: Pick<Partial<Lead>, 'concern_area' | 'patient_photo_url'>): PatientSummary {
  const concernArea = lead.concern_area ?? 'genel_yuz_dengesi'
  const photoQuality = lead.patient_photo_url ? 'good' : 'poor'

  return {
    status: 'ready',
    photo_quality: photoQuality,
    focus_areas: focusAreasByConcern[concernArea] ?? ['Yüz dengesi', 'Orta yüz'],
    consultation_recommended: true,
    summary_text: `${concernAreaLabels[concernArea]} odağında ön değerlendirme tamamlandı. Kesin plan, doktor muayenesi ve klinik fotoğraf seti ile netleştirilir.`,
    feature_schema_version: '1.0.0',
    model_version: 'mock-v1',
  }
}
