"use client"

import { motion } from "framer-motion"
import Image from "next/image"

const techStack = [
  {
    name: "Solana",
    description: "Lightning-fast blockchain",
    logo: "/solana-logo.png",
  },
  {
    name: "Snowflake",
    description: "AI-powered validation",
    logo: "/abstract-geometric-snowflake.png",
  },
  {
    name: "Cloudflare",
    description: "Global CDN & storage",
    logo: "/cloudflare-logo.png",
  },
  {
    name: "Supabase",
    description: "Real-time database",
    logo: "/supabase-logo.png",
  },
]

export function TechStackSection() {
  return (
    <section className="py-20">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="max-w-6xl mx-auto">
          {/* Section Title */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="text-center mb-16"
          >
            <h2 className="text-4xl font-bold text-white mb-4">Built With Industry Leaders</h2>
          </motion.div>

          {/* Tech Stack Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8 relative">
            {techStack.map((tech, index) => (
              <motion.div
                key={tech.name}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.6, delay: index * 0.1 }}
                className="relative"
              >
                {/* Plus Symbol Decoration (between cards on desktop) */}
                {index < techStack.length - 1 && (
                  <div className="hidden lg:block absolute -right-4 top-1/2 -translate-y-1/2 text-purple-500/30 text-2xl font-light z-10">
                    +
                  </div>
                )}

                {/* Card */}
                <motion.div
                  whileHover={{ y: -8, scale: 1.02 }}
                  transition={{ duration: 0.3 }}
                  className="group relative h-full rounded-2xl p-8 backdrop-blur-xl bg-white/5 border border-white/10 hover:border-purple-500/50 hover:bg-white/10 transition-all duration-300"
                  style={{
                    boxShadow: "0 8px 32px rgba(0, 0, 0, 0.3)",
                  }}
                >
                  {/* Hover Glow Effect */}
                  <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-purple-500/0 via-pink-500/0 to-purple-500/0 group-hover:from-purple-500/10 group-hover:via-pink-500/10 group-hover:to-purple-500/10 transition-all duration-300" />

                  {/* Content */}
                  <div className="relative flex flex-col items-center text-center space-y-4">
                    {/* Logo */}
                    <div className="relative w-20 h-20 grayscale group-hover:grayscale-0 transition-all duration-300">
                      <Image
                        src={tech.logo || "/placeholder.svg"}
                        alt={`${tech.name} logo`}
                        width={80}
                        height={80}
                        className="object-contain"
                      />
                    </div>

                    {/* Name */}
                    <h3 className="text-xl font-semibold text-white group-hover:text-transparent group-hover:bg-clip-text group-hover:bg-gradient-to-r group-hover:from-purple-400 group-hover:to-pink-400 transition-all duration-300">
                      {tech.name}
                    </h3>

                    {/* Description */}
                    <p className="text-sm text-gray-400 group-hover:text-gray-300 transition-colors duration-300">
                      {tech.description}
                    </p>
                  </div>
                </motion.div>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
