import { Header } from "@/components/header"
import { HeroSection } from "@/components/hero-section"
import { HowItWorksSection } from "@/components/how-it-works-section"
import { ActivityFeedSection } from "@/components/activity-feed/ActivityFeedSection"
import { ProblemSection } from "@/components/problem-section"
import { CTASection } from "@/components/cta-section"
import { Footer } from "@/components/footer"

export default function Home() {
  return (
    <div className="min-h-screen" style={{ backgroundColor: "#0a0a0f" }}>
      <Header />

      <main className="pt-16">
        <HeroSection />

        <HowItWorksSection />

        <ActivityFeedSection />

        <ProblemSection />

        <CTASection />
      </main>

      <Footer />
    </div>
  )
}
