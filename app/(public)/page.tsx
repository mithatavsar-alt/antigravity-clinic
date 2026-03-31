import { HeroSection } from '@/components/public/HeroSection'
import { ClinicApproachSection } from '@/components/public/ClinicApproachSection'
import { TreatmentsSection } from '@/components/public/TreatmentsSection'
import { AIAnalysisPreview } from '@/components/public/AIAnalysisPreview'
import { TrustSection } from '@/components/public/TrustSection'
import { FAQSection } from '@/components/public/FAQSection'
import { CTASection } from '@/components/public/CTASection'

export default function HomePage() {
  return (
    <div className="theme-light">
      <HeroSection />
      <ClinicApproachSection />
      <TreatmentsSection />
      <AIAnalysisPreview />
      <TrustSection />
      <FAQSection />
      <CTASection />
    </div>
  )
}
