import { HeroSection } from '@/components/public/HeroSection'
import { ClinicApproachSection } from '@/components/public/ClinicApproachSection'
import { TreatmentsSection } from '@/components/public/TreatmentsSection'
import { HowItWorksSection } from '@/components/public/HowItWorksSection'
import { AIAnalysisPreview } from '@/components/public/AIAnalysisPreview'
import { TrustSection } from '@/components/public/TrustSection'
import { FAQSection } from '@/components/public/FAQSection'
import { CTASection } from '@/components/public/CTASection'

export default function HomePage() {
  return (
    <>
      <div className="theme-dark">
        <HeroSection />
      </div>
      <div className="theme-light">
        <ClinicApproachSection />
        <TreatmentsSection />
        <HowItWorksSection />
        <AIAnalysisPreview />
        <TrustSection />
        <FAQSection />
        <CTASection />
      </div>
    </>
  )
}
