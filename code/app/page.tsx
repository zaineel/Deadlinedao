import { Header } from "@/components/header"
import { HeroSection } from "@/components/hero-section"
import { ProblemSection } from "@/components/problem-section"
import { HowItWorksSection } from "@/components/how-it-works-section"
import { FeaturesSection } from "@/components/features-section"
import { TechStackSection } from "@/components/tech-stack-section"
import { CTASection } from "@/components/cta-section"
import { Footer } from "@/components/footer" // Added Footer import

export default function Home() {
  return (
    <div className="min-h-screen" style={{ backgroundColor: "#0a0a0f" }}>
      <Header />

      <main className="pt-16">
        <HeroSection />

        <ProblemSection />

        <HowItWorksSection />

        <FeaturesSection />

        <TechStackSection />

        <CTASection />

        {/* Demo sections for anchor links */}
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="space-y-32 py-16">
            <section id="features" className="py-16">
              <h2 className="text-4xl font-bold text-white mb-4 text-center">Features</h2>
              <p className="text-gray-400 text-center">Discover the powerful features that make DeadlineDAO unique.</p>
            </section>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  )
}
