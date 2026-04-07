/**
 * Explainability Layer
 *
 * Generates per-region Turkish clinical-style explanations for face analysis results.
 * Premium, calm, non-alarmist tone. Never diagnostic.
 */

import type {
  AnalysisRegionId,
  RegionExplanation,
  RegionScore,
  SeverityLevel,
} from './types'
import { CONFIDENCE_LEVELS } from './constants'

// ─── Internal Helpers ───────────────────────────────────

export function getConfidenceLevel(
  confidence: number
): 'high' | 'medium' | 'low' {
  if (confidence >= CONFIDENCE_LEVELS.high) return 'high'
  if (confidence >= CONFIDENCE_LEVELS.medium) return 'medium'
  return 'low'
}

export function getEvidenceBasis(
  confidence: number
): 'direct' | 'indirect' | 'insufficient' {
  if (confidence >= 0.60) return 'direct'
  if (confidence >= 0.25) return 'indirect'
  return 'insufficient'
}

// ─── Region Templates ───────────────────────────────────

interface RegionTemplate {
  minimal: string
  mild: string
  moderate: string
  notable: string
  lowConfidence: string
}

const REGION_TEMPLATES: Record<AnalysisRegionId, RegionTemplate> = {
  forehead: {
    minimal: 'Alın bölgesi görece pürüzsüz görünmektedir.',
    mild: 'Alın bölgesinde hafif çizgilenme gözlemlenmiştir.',
    moderate: 'Alın bölgesinde orta düzeyde çizgi yoğunluğu tespit edilmiştir.',
    notable: 'Alın bölgesinde belirgin çizgi yapısı gözlemlenmiştir.',
    lowConfidence:
      'Alın bölgesi mevcut görüntü koşullarında yeterince değerlendirilemedi.',
  },
  forehead_left: {
    minimal: 'Sol alın bölgesi görece pürüzsüz görünmektedir.',
    mild: 'Sol alın bölgesinde hafif çizgilenme gözlemlenmiştir.',
    moderate:
      'Sol alın bölgesinde orta düzeyde çizgi yoğunluğu tespit edilmiştir.',
    notable: 'Sol alın bölgesinde belirgin çizgi yapısı gözlemlenmiştir.',
    lowConfidence:
      'Sol alın bölgesi mevcut görüntü koşullarında yeterince değerlendirilemedi.',
  },
  forehead_right: {
    minimal: 'Sağ alın bölgesi görece pürüzsüz görünmektedir.',
    mild: 'Sağ alın bölgesinde hafif çizgilenme gözlemlenmiştir.',
    moderate:
      'Sağ alın bölgesinde orta düzeyde çizgi yoğunluğu tespit edilmiştir.',
    notable: 'Sağ alın bölgesinde belirgin çizgi yapısı gözlemlenmiştir.',
    lowConfidence:
      'Sağ alın bölgesi mevcut görüntü koşullarında yeterince değerlendirilemedi.',
  },
  glabella: {
    minimal: 'Kaş arası bölge düzgün ve sakin görünmektedir.',
    mild: 'Kaş arası bölgede hafif kırışıklık izleri gözlemlenmiştir.',
    moderate:
      'Kaş arası bölgede orta düzeyde kırışıklık yoğunluğu tespit edilmiştir.',
    notable: 'Kaş arası bölgede belirgin kırışıklık yapısı gözlemlenmiştir.',
    lowConfidence:
      'Kaş arası bölge mevcut görüntü koşullarında yeterince değerlendirilemedi.',
  },
  under_eye_left: {
    minimal: 'Sol göz altı bölgesi dinlenmiş ve düzgün görünmektedir.',
    mild: 'Sol göz altı bölgesinde hafif ince çizgilenme gözlemlenmiştir.',
    moderate:
      'Sol göz altı bölgesinde orta düzeyde çizgilenme ve doku değişimi tespit edilmiştir.',
    notable:
      'Sol göz altı bölgesinde belirgin çizgi yapısı ve doku farklılığı gözlemlenmiştir.',
    lowConfidence:
      'Sol göz altı bölgesi mevcut görüntü koşullarında yeterince değerlendirilemedi.',
  },
  under_eye_right: {
    minimal: 'Sağ göz altı bölgesi dinlenmiş ve düzgün görünmektedir.',
    mild: 'Sağ göz altı bölgesinde hafif ince çizgilenme gözlemlenmiştir.',
    moderate:
      'Sağ göz altı bölgesinde orta düzeyde çizgilenme ve doku değişimi tespit edilmiştir.',
    notable:
      'Sağ göz altı bölgesinde belirgin çizgi yapısı ve doku farklılığı gözlemlenmiştir.',
    lowConfidence:
      'Sağ göz altı bölgesi mevcut görüntü koşullarında yeterince değerlendirilemedi.',
  },
  crow_feet_left: {
    minimal: 'Sol göz kenarı bölgesi düzgün görünmektedir.',
    mild: 'Sol göz kenarında hafif ifade çizgileri gözlemlenmiştir.',
    moderate:
      'Sol göz kenarında orta düzeyde ifade çizgisi yoğunluğu tespit edilmiştir.',
    notable:
      'Sol göz kenarında belirgin ifade çizgisi yapısı gözlemlenmiştir.',
    lowConfidence:
      'Sol göz kenarı bölgesi mevcut görüntü koşullarında yeterince değerlendirilemedi.',
  },
  crow_feet_right: {
    minimal: 'Sağ göz kenarı bölgesi düzgün görünmektedir.',
    mild: 'Sağ göz kenarında hafif ifade çizgileri gözlemlenmiştir.',
    moderate:
      'Sağ göz kenarında orta düzeyde ifade çizgisi yoğunluğu tespit edilmiştir.',
    notable:
      'Sağ göz kenarında belirgin ifade çizgisi yapısı gözlemlenmiştir.',
    lowConfidence:
      'Sağ göz kenarı bölgesi mevcut görüntü koşullarında yeterince değerlendirilemedi.',
  },
  nose_surface: {
    minimal:
      'Burun yüzeyi düzgün doku yapısı ve homojen gözenek dağılımı sergilemektedir.',
    mild: 'Burun yüzeyinde hafif doku farklılığı ve gözenek belirginliği gözlemlenmiştir.',
    moderate:
      'Burun yüzeyinde orta düzeyde doku düzensizliği ve gözenek yoğunluğu tespit edilmiştir.',
    notable:
      'Burun yüzeyinde belirgin doku farklılığı ve gözenek yapısı gözlemlenmiştir.',
    lowConfidence:
      'Burun yüzeyi mevcut görüntü koşullarında yeterince değerlendirilemedi.',
  },
  nasolabial_left: {
    minimal: 'Sol nazolabial bölge düzgün ve yumuşak görünmektedir.',
    mild: 'Sol nazolabial bölgede hafif çizgilenme gözlemlenmiştir.',
    moderate:
      'Sol nazolabial bölgede orta düzeyde kıvrım derinliği tespit edilmiştir.',
    notable:
      'Sol nazolabial bölgede belirgin kıvrım yapısı gözlemlenmiştir.',
    lowConfidence:
      'Sol nazolabial bölge mevcut görüntü koşullarında yeterince değerlendirilemedi.',
  },
  nasolabial_right: {
    minimal: 'Sağ nazolabial bölge düzgün ve yumuşak görünmektedir.',
    mild: 'Sağ nazolabial bölgede hafif çizgilenme gözlemlenmiştir.',
    moderate:
      'Sağ nazolabial bölgede orta düzeyde kıvrım derinliği tespit edilmiştir.',
    notable:
      'Sağ nazolabial bölgede belirgin kıvrım yapısı gözlemlenmiştir.',
    lowConfidence:
      'Sağ nazolabial bölge mevcut görüntü koşullarında yeterince değerlendirilemedi.',
  },
  perioral: {
    minimal: 'Dudak çevresi düzgün ve bakımlı görünmektedir.',
    mild: 'Dudak çevresinde hafif ince çizgilenme gözlemlenmiştir.',
    moderate:
      'Dudak çevresinde orta düzeyde çizgi yoğunluğu tespit edilmiştir.',
    notable:
      'Dudak çevresinde belirgin çizgi yapısı ve doku değişimi gözlemlenmiştir.',
    lowConfidence:
      'Dudak çevresi mevcut görüntü koşullarında yeterince değerlendirilemedi.',
  },
  cheek_left: {
    minimal:
      'Sol yanak bölgesi düzgün doku yapısı ve homojen renk tonu sergilemektedir.',
    mild: 'Sol yanak bölgesinde hafif doku farklılığı gözlemlenmiştir.',
    moderate:
      'Sol yanak bölgesinde orta düzeyde doku düzensizliği ve ton değişimi tespit edilmiştir.',
    notable:
      'Sol yanak bölgesinde belirgin doku farklılığı ve renk tonu heterojenliği gözlemlenmiştir.',
    lowConfidence:
      'Sol yanak bölgesi mevcut görüntü koşullarında yeterince değerlendirilemedi.',
  },
  cheek_right: {
    minimal:
      'Sağ yanak bölgesi düzgün doku yapısı ve homojen renk tonu sergilemektedir.',
    mild: 'Sağ yanak bölgesinde hafif doku farklılığı gözlemlenmiştir.',
    moderate:
      'Sağ yanak bölgesinde orta düzeyde doku düzensizliği ve ton değişimi tespit edilmiştir.',
    notable:
      'Sağ yanak bölgesinde belirgin doku farklılığı ve renk tonu heterojenliği gözlemlenmiştir.',
    lowConfidence:
      'Sağ yanak bölgesi mevcut görüntü koşullarında yeterince değerlendirilemedi.',
  },
  chin: {
    minimal: 'Çene bölgesi düzgün ve pürüzsüz görünmektedir.',
    mild: 'Çene bölgesinde hafif doku farklılığı gözlemlenmiştir.',
    moderate:
      'Çene bölgesinde orta düzeyde doku düzensizliği tespit edilmiştir.',
    notable:
      'Çene bölgesinde belirgin doku yapısı ve yüzey farklılığı gözlemlenmiştir.',
    lowConfidence:
      'Çene bölgesi mevcut görüntü koşullarında yeterince değerlendirilemedi.',
  },
  jawline_left: {
    minimal:
      'Sol çene hattı belirgin kontur yapısı ve düzgün geçiş sergilemektedir.',
    mild: 'Sol çene hattında hafif kontur yumuşaması gözlemlenmiştir.',
    moderate:
      'Sol çene hattında orta düzeyde kontur belirsizliği tespit edilmiştir.',
    notable:
      'Sol çene hattında belirgin kontur değişimi ve hat yumuşaması gözlemlenmiştir.',
    lowConfidence:
      'Sol çene hattı mevcut görüntü koşullarında yeterince değerlendirilemedi.',
  },
  jawline_right: {
    minimal:
      'Sağ çene hattı belirgin kontur yapısı ve düzgün geçiş sergilemektedir.',
    mild: 'Sağ çene hattında hafif kontur yumuşaması gözlemlenmiştir.',
    moderate:
      'Sağ çene hattında orta düzeyde kontur belirsizliği tespit edilmiştir.',
    notable:
      'Sağ çene hattında belirgin kontur değişimi ve hat yumuşaması gözlemlenmiştir.',
    lowConfidence:
      'Sağ çene hattı mevcut görüntü koşullarında yeterince değerlendirilemedi.',
  },
  symmetry_zone: {
    minimal: 'Yüz simetrisi genel olarak dengeli görünmektedir.',
    mild: 'Hafif simetri farklılığı gözlemlenmiştir; doğal varyasyon sınırları dahilindedir.',
    moderate:
      'Orta düzeyde simetri farklılığı tespit edilmiştir; sol ve sağ taraf arasında belirgin fark bulunmaktadır.',
    notable:
      'Belirgin simetri farklılığı gözlemlenmiştir; yüzün iki yarısı arasında dikkat çekici fark bulunmaktadır.',
    lowConfidence:
      'Yüz simetrisi mevcut görüntü koşullarında yeterince değerlendirilemedi.',
  },
}

// ─── Visual Drivers ─────────────────────────────────────

function describeVisualDrivers(score: RegionScore): string[] {
  const drivers: string[] = []
  const f = score.features

  if (f.wrinkleDensity > 0.3) drivers.push('kenar yoğunluğu analizi')
  if (f.textureRoughness > 0.4) drivers.push('doku analizi')
  if (f.contrastIrregularity > 0.3) drivers.push('kontrast değerlendirmesi')
  if (f.toneUniformity < 0.6) drivers.push('renk tonu homojenlik analizi')
  if (
    f.asymmetryEstimate !== null &&
    f.asymmetryEstimate > 0.15
  ) {
    drivers.push('sol-sağ karşılaştırma')
  }

  return drivers.length > 0 ? drivers : ['genel görsel değerlendirme']
}

// ─── Main Export ────────────────────────────────────────

export function generateExplanations(
  regionScores: RegionScore[]
): RegionExplanation[] {
  return regionScores.map((score) => {
    const template = REGION_TEMPLATES[score.regionId]
    const confidenceLevel = getConfidenceLevel(score.confidence)
    const evidenceBasis = getEvidenceBasis(score.confidence)
    const visualDrivers = describeVisualDrivers(score)

    let explanation: string

    if (confidenceLevel === 'low' || evidenceBasis === 'insufficient') {
      explanation = template.lowConfidence
    } else {
      explanation = template[score.severity as SeverityLevel]

      if (confidenceLevel === 'medium') {
        explanation += ' (mevcut görüntü koşulları altında)'
      }
    }

    return {
      regionId: score.regionId,
      label: score.label,
      explanation,
      visualDrivers,
      confidenceLevel,
      evidenceBasis,
    }
  })
}
