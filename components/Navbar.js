import { useState } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import Image from 'next/image';


export default function Navbar() {
  const [menuOpen, setMenuOpen] = useState(false);
  const router = useRouter();

  const navLinks = [
    { href: '/', label: 'Home' },
    { href: '/trendanalyzer', label: 'Trend Detector' },
    { href: '/btcreversalpanel', label: 'ATH/ATL vs EMA' },
    { href: '/signalchecker', label: 'Signal Checker' },
    { href: '/rewards', label: 'Rewards' },
    { href: '/about', label: 'About' },
  ];

  const linkClass = (path) =>
    `transition hover:text-yellow-400 ${
      router.pathname === path ? 'text-yellow-400' : ''
    }`;

  return (
    <nav className="bg-gradient-to-r from-gray-900 via-black to-gray-900 text-white shadow-md sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
        {/* Logo / Title */}
        <Link href="/" className="flex items-center gap-2 text-2xl font-extrabold tracking-wide hover:text-yellow-400 transition">
          {/* Optional Logo */}
          <Image src="/logo.png" alt="Logo" width={40} height={40} />
          Bitcoin Signal Analyzer
        </Link>

        {/* Mobile Menu Toggle */}
        <button
          aria-label="Toggle menu"
          className="md:hidden text-3xl focus:outline-none"
          onClick={() => setMenuOpen(!menuOpen)}
        >
          {menuOpen ? '×' : '☰'}
        </button>

        {/* Desktop Menu */}
        <ul className="hidden md:flex gap-8 text-sm font-medium">
          {navLinks.map(({ href, label }) => (
            <li key={href}>
              <Link href={href} className={linkClass(href)}>
                {label}
              </Link>
            </li>
          ))}
        </ul>
      </div>

      {/* Mobile Menu */}
      <div
        className={`md:hidden overflow-hidden transition-all duration-300 ease-in-out ${
          menuOpen ? 'max-h-60 opacity-100' : 'max-h-0 opacity-0'
        }`}
      >
        <ul className="flex flex-col gap-4 text-sm font-medium px-4 pb-4 pt-2">
          {navLinks.map(({ href, label }) => (
            <li key={href}>
              <Link
                href={href}
                className={linkClass(href)}
                onClick={() => setMenuOpen(false)}
              >
                {label}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </nav>
  );
          }
