import Link from "next/link"
import { Github, Mail, Twitter } from "lucide-react"

export function Footer() {
  return (
    <footer className="border-t border-white/5" style={{ backgroundColor: "#0f0f14" }}>
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 pt-16 pb-8">
        {/* Main Footer Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-12 mb-12">
          {/* Column 1 - Brand */}
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <span className="text-2xl">🎯</span>
              <span className="text-2xl font-bold bg-gradient-to-r from-purple-400 via-pink-400 to-purple-400 bg-clip-text text-transparent">
                DeadlineDAO
              </span>
            </div>
            <p className="text-sm font-semibold text-gray-300">Where accountability meets innovation</p>
            <p className="text-sm text-gray-500">
              AI-powered accountability on Solana. Lock SOL, achieve goals, get rewarded.
            </p>
            <div className="flex items-center gap-3 pt-2">
              <Link
                href="https://github.com"
                target="_blank"
                rel="noopener noreferrer"
                className="w-9 h-9 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center text-gray-400 hover:text-purple-400 transition-all"
              >
                <Github className="w-4 h-4" />
              </Link>
              <Link
                href="https://twitter.com"
                target="_blank"
                rel="noopener noreferrer"
                className="w-9 h-9 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center text-gray-400 hover:text-purple-400 transition-all"
              >
                <Twitter className="w-4 h-4" />
              </Link>
              <Link
                href="mailto:hello@deadlinedao.com"
                className="w-9 h-9 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center text-gray-400 hover:text-purple-400 transition-all"
              >
                <Mail className="w-4 h-4" />
              </Link>
            </div>
          </div>

          {/* Column 2 - Product */}
          <div>
            <h3 className="text-xs uppercase tracking-wider text-gray-400 font-semibold mb-4">Product</h3>
            <ul className="space-y-3">
              <li>
                <Link href="/browse" className="text-sm text-gray-500 hover:text-purple-400 transition-colors">
                  Browse Goals
                </Link>
              </li>
              <li>
                <Link href="/create" className="text-sm text-gray-500 hover:text-purple-400 transition-colors">
                  Create Goal
                </Link>
              </li>
              <li>
                <Link href="/dashboard" className="text-sm text-gray-500 hover:text-purple-400 transition-colors">
                  Dashboard
                </Link>
              </li>
            </ul>
          </div>

          {/* Column 3 - Resources */}
          <div>
            <h3 className="text-xs uppercase tracking-wider text-gray-400 font-semibold mb-4">Resources</h3>
            <ul className="space-y-3">
              <li>
                <Link href="/docs" className="text-sm text-gray-500 hover:text-purple-400 transition-colors">
                  Documentation
                </Link>
              </li>
              <li>
                <Link href="/faq" className="text-sm text-gray-500 hover:text-purple-400 transition-colors">
                  FAQ
                </Link>
              </li>
              <li>
                <Link href="/blog" className="text-sm text-gray-500 hover:text-purple-400 transition-colors">
                  Blog
                </Link>
              </li>
            </ul>
          </div>

          {/* Column 4 - Legal */}
          <div>
            <h3 className="text-xs uppercase tracking-wider text-gray-400 font-semibold mb-4">Legal</h3>
            <ul className="space-y-3">
              <li>
                <Link href="/privacy" className="text-sm text-gray-500 hover:text-purple-400 transition-colors">
                  Privacy Policy
                </Link>
              </li>
              <li>
                <Link href="/terms" className="text-sm text-gray-500 hover:text-purple-400 transition-colors">
                  Terms of Service
                </Link>
              </li>
              <li>
                <Link href="/contact" className="text-sm text-gray-500 hover:text-purple-400 transition-colors">
                  Contact
                </Link>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="border-t border-white/5 pt-8 mt-12">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4 text-sm text-gray-500">
            <div>© 2025 DeadlineDAO. All rights reserved.</div>
            <div className="text-center">Built for OSU Hackathon 2025 by Zaine Elmithani</div>
            <div className="flex items-center gap-1">
              Built with <span className="text-red-400">❤️</span> using Solana, Snowflake, and Cloudflare
            </div>
          </div>
        </div>
      </div>
    </footer>
  )
}
