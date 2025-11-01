export function ProblemSection() {
    return (
      <section className="py-20">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-4xl mx-auto">
            {/* Section Title */}
            <h2 className="text-4xl font-bold text-white mb-12 text-center">The Problem</h2>
  
            {/* Glassmorphic Card */}
            <div className="relative rounded-2xl border border-red-500/20 bg-white/5 backdrop-blur-xl p-8 sm:p-12">
              {/* Red glow effect */}
              <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-red-500/10 to-transparent pointer-events-none" />
  
              <div className="relative z-10 text-center">
                {/* Large Stat */}
                <div className="mb-6">
                  <span className="text-7xl font-black bg-gradient-to-r from-red-400 to-red-600 bg-clip-text text-transparent">
                    89%
                  </span>
                </div>
  
                {/* Stat Description */}
                <p className="text-2xl text-white font-semibold mb-8">of people fail to achieve their goals</p>
  
                {/* Explanation */}
                <p className="text-xl text-gray-300 leading-relaxed">
                  Traditional goal-tracking apps are free, so there&apos;s no consequence for giving up. Your broken
                  promises cost you nothing.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>
    )
  }
  