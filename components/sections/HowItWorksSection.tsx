"use client"

import { motion } from "framer-motion"
import { Lock, Camera, Cpu, TrendingUp, ArrowRightLeft } from "lucide-react"

const steps = [
  {
    number: 1,
    title: "Stake SOL",
    description: "Set a deadline and lock your stake",
    icon: Lock,
    color: "purple",
    borderColor: "border-purple-500",
    bgColor: "bg-purple-500/15",
    iconColor: "text-purple-400",
    badge: null,
    example: null,
  },
  {
    number: 2,
    title: "Submit Proof",
    description: "Upload text + image proof",
    icon: Camera,
    color: "blue",
    borderColor: "border-blue-500",
    bgColor: "bg-blue-500/15",
    iconColor: "text-blue-400",
    badge: null,
    example: null,
  },
  {
    number: 3,
    title: "AI Validates",
    description: "Snowflake Cortex runs 5-layer validation",
    icon: Cpu,
    color: "cyan",
    borderColor: "border-cyan-500",
    bgColor: "bg-cyan-500/15",
    iconColor: "text-cyan-400",
    badge: "⭐ Core",
    example: null,
  },
  {
    number: 4,
    title: "Get Paid",
    description: "Your stake + share of failed stakes",
    icon: TrendingUp,
    color: "green",
    borderColor: "border-green-500",
    bgColor: "bg-green-500/15",
    iconColor: "text-green-400",
    badge: null,
    example: "Example: 0.5 SOL → 0.83 SOL",
  },
  {
    number: 5,
    title: "Redistribution",
    description: "Your money goes to winners",
    icon: ArrowRightLeft,
    color: "orange",
    borderColor: "border-orange-500",
    bgColor: "bg-orange-500/15",
    iconColor: "text-orange-400",
    badge: null,
    example: null,
  },
]

export function HowItWorksSection() {
  return (
    <section id="how-it-works" className="py-20">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-7xl">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <h2 className="text-4xl font-bold text-white mb-4">How It Works</h2>
          <p className="text-gray-400 text-lg">
            Five simple steps from goal to reward. Real accountability powered by blockchain and AI.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-6">
          {steps.map((step, index) => (
            <motion.div
              key={step.number}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: index * 0.1 }}
              whileHover={{ y: -8, transition: { duration: 0.2 } }}
              className={`relative min-h-[280px] max-h-[320px] p-6 rounded-xl backdrop-blur-sm bg-white/5 border border-white/10 ${step.borderColor} border-l-4 hover:shadow-2xl hover:shadow-${step.color}-500/20 transition-all duration-300`}
            >
              {/* Step number badge */}
              <div className="absolute top-4 left-4 w-6 h-6 rounded-full bg-white/10 flex items-center justify-center">
                <span className="text-xs font-bold text-white">{step.number}</span>
              </div>

              {/* Icon */}
              <div className="flex justify-center mb-6 mt-8">
                <div className={`w-20 h-20 rounded-full ${step.bgColor} flex items-center justify-center`}>
                  <step.icon className={`w-10 h-10 ${step.iconColor}`} />
                </div>
              </div>

              {/* Title */}
              <h3 className="text-xl font-semibold text-white mb-3 text-center">{step.title}</h3>

              {/* Description */}
              <p className="text-sm text-gray-400 text-center mb-3">{step.description}</p>

              {/* Badge */}
              {step.badge && (
                <div className="flex justify-center mb-2">
                  <span className="inline-block px-3 py-1 text-xs font-semibold bg-yellow-500/20 text-yellow-300 rounded-full border border-yellow-500/30">
                    {step.badge}
                  </span>
                </div>
              )}

              {/* Example */}
              {step.example && (
                <div className="mt-auto pt-3">
                  <p className="text-xs text-gray-500 text-center italic">{step.example}</p>
                </div>
              )}
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}
