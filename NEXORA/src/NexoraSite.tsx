import { useState, useEffect } from "react";
import {
  Menu, X, Cpu, ArrowRight, Shield, Cloud, Database, Network,
  Users, Award, Mail, Phone, MapPin, ChevronRight, Lock, Activity, CheckCircle,
  Search, AlertTriangle, Terminal, Download, Loader2,
} from "lucide-react";
import { supabase } from "./lib/supabase";
import { initClaims, foundFlag, isLinked, type ClaimNotice } from "./lib/claim";

type Page = "home" | "about" | "services" | "research" | "projects" | "blog" | "support" | "contact" | "gallery" | "login" | "confidential-audit-portal";

function getInitialPage(): Page {
  const hash = window.location.hash.replace(/^#\/?/, "").toLowerCase();
  if (hash === "confidential-audit-portal") return "confidential-audit-portal";
  if (["home", "about", "services", "research", "projects", "blog", "support", "contact", "gallery", "login"].includes(hash)) {
    return hash as Page;
  }
  const path = window.location.pathname.replace(/^\//, "").toLowerCase();
  if (path === "confidential-audit-portal") return "confidential-audit-portal";
  return "home";
}

export function NexoraSite() {
  const [page, setPage] = useState<Page>(getInitialPage);
  const [mobileMenu, setMobileMenu] = useState(false);
  const [notice, setNotice] = useState<ClaimNotice | null>(null);
  const [linked, setLinked] = useState(isLinked);

  useEffect(() => {
    initClaims(setNotice, setLinked);
  }, []);

  const [briefed, setBriefed] = useState(() => sessionStorage.getItem("nx_briefed") === "1");

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 6000);
    return () => clearTimeout(t);
  }, [notice]);

  useEffect(() => {
    const handleHash = () => {
      setPage(getInitialPage());
    };
    window.addEventListener("hashchange", handleHash);
    return () => window.removeEventListener("hashchange", handleHash);
  }, []);

  const navItems: { id: Page; label: string }[] = [
    { id: "home", label: "Home" },
    { id: "about", label: "About" },
    { id: "services", label: "Services" },
    { id: "research", label: "Research" },
    { id: "projects", label: "Projects" },
    { id: "blog", label: "Blog" },
    { id: "gallery", label: "Gallery" },
    { id: "support", label: "Support" },
    { id: "contact", label: "Contact" },
  ];

  const navigate = (p: Page) => {
    setPage(p);
    setMobileMenu(false);
    window.location.hash = `#/${p}`;
    window.scrollTo(0, 0);
  };

  return (
    <div className="min-h-screen bg-white text-slate-800 font-sans antialiased [&_button]:focus-visible:outline-none [&_button]:focus-visible:ring-2 [&_button]:focus-visible:ring-cyan-500/70">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-lg border-b border-slate-200/80 shadow-sm shadow-slate-900/5">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <button onClick={() => navigate("home")} className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-slate-800 to-slate-900 flex items-center justify-center">
                <Cpu className="w-5 h-5 text-cyan-400" />
              </div>
              <span className="font-extrabold text-lg text-slate-900 tracking-tight">NEXORA</span>
              <span className="text-xs font-medium text-slate-400 tracking-widest hidden sm:inline">SYSTEMS</span>
            </button>

            <nav className="hidden lg:flex items-center gap-1">
              {navItems.map((item) => (
                <button
                  key={item.id}
                  onClick={() => navigate(item.id)}
                  className={`px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
                    page === item.id
                      ? "text-slate-900 bg-slate-100"
                      : "text-slate-600 hover:text-slate-900 hover:bg-slate-50"
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </nav>

            <div className="flex items-center gap-3">
              <button
                onClick={() => navigate("login")}
                className="hidden sm:flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-700 hover:text-slate-900 transition-colors"
              >
                <Lock className="w-4 h-4" />
                Login
              </button>
              <button
                onClick={() => setMobileMenu(!mobileMenu)}
                aria-label="Toggle menu" aria-expanded={mobileMenu} className="lg:hidden p-2 text-slate-600 hover:text-slate-900 rounded-lg"
              >
                {mobileMenu ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
              </button>
            </div>
          </div>

          {/* Mobile menu */}
          {mobileMenu && (
            <div className="lg:hidden border-t border-slate-200 py-3">
              {navItems.map((item) => (
                <button
                  key={item.id}
                  onClick={() => navigate(item.id)}
                  className={`block w-full text-left px-3 py-2.5 text-sm font-medium rounded-lg ${
                    page === item.id ? "text-slate-900 bg-slate-100" : "text-slate-600"
                  }`}
                >
                  {item.label}
                </button>
              ))}
              <button
                onClick={() => navigate("login")}
                className="block w-full text-left px-3 py-2.5 text-sm font-medium text-slate-600"
              >
                Login
              </button>
            </div>
          )}
        </div>
      </header>

      {/* Page content */}
      {page === "home" && <HomePage navigate={navigate} />}
      {page === "about" && <AboutPage />}
      {page === "services" && <ServicesPage />}
      {page === "research" && <ResearchPage />}
      {page === "projects" && <ProjectsPage />}
      {page === "blog" && <BlogPage />}
      {page === "support" && <SupportPage />}
      {page === "contact" && <ContactPage />}
      {page === "gallery" && <GalleryPage />}
      {page === "login" && <LoginPage />}
      {page === "confidential-audit-portal" && <ConfidentialAuditPortalPage />}

      {/* Footer */}
      {linked && !briefed && (
        <div className="fixed top-20 right-4 z-50 max-w-xs rounded-xl bg-slate-900 text-slate-100 text-sm p-4 shadow-xl border border-cyan-500/40">
          <p className="font-semibold text-cyan-300 mb-1">CTF briefing</p>
          <p className="text-slate-300">Everything on this site and the files it serves is in scope. Flags look like NEXORA{"{...}"}. Explore every page, then look underneath them with your browser tools (F12). Press Ctrl+V anywhere on this page to submit a flag you found.</p>
          <button onClick={() => { sessionStorage.setItem("nx_briefed", "1"); setBriefed(true); }} className="mt-3 px-3 py-1 rounded-lg bg-cyan-500 text-slate-900 font-semibold">Got it</button>
        </div>
      )}

      <div className="fixed bottom-4 left-4 z-50 flex flex-col gap-2 items-start pointer-events-none">
        {notice && (
          <div role="status" className={`pointer-events-auto max-w-sm rounded-lg px-4 py-3 text-sm shadow-lg ${
            notice.kind === "ok" ? "bg-emerald-600 text-white" : notice.kind === "bad" ? "bg-red-600 text-white" : notice.kind === "wait" ? "bg-amber-500 text-slate-900" : "bg-slate-800 text-white"
          }`}>{notice.text}</div>
        )}
        <div className={`rounded-full px-3 py-1 text-xs shadow ${linked ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-slate-100 text-slate-500 border border-slate-200"}`}>
          {linked ? "Team linked: flags are auto-detected (or paste one anywhere)" : "Not linked: open this site from your team dashboard"}
        </div>
      </div>

      <footer className="bg-slate-900 text-slate-400">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
            <div>
              <div className="flex items-center gap-2.5 mb-4">
                <div className="w-8 h-8 rounded-lg bg-slate-800 flex items-center justify-center">
                  <Cpu className="w-4 h-4 text-cyan-400" />
                </div>
                <span className="font-bold text-white">NEXORA SYSTEMS</span>
              </div>
              <p className="text-sm text-slate-500">
                Building tomorrow's infrastructure today. Enterprise technology solutions since 2018.
              </p>
            </div>
            <div>
              <h4 className="text-sm font-semibold text-white mb-3">Company</h4>
              <ul className="space-y-2 text-sm">
                <li><button onClick={() => navigate("about")} className="hover:text-cyan-400 transition-colors">About Us</button></li>
                <li><button onClick={() => navigate("research")} className="hover:text-cyan-400 transition-colors">Research</button></li>
                <li><button onClick={() => navigate("blog")} className="hover:text-cyan-400 transition-colors">Blog</button></li>
                <li><button onClick={() => navigate("projects")} className="hover:text-cyan-400 transition-colors">Projects</button></li>
                <li><button onClick={() => navigate("gallery")} className="hover:text-cyan-400 transition-colors">Gallery</button></li>
              </ul>
            </div>
            <div>
              <h4 className="text-sm font-semibold text-white mb-3">Resources</h4>
              <ul className="space-y-2 text-sm">
                <li><button onClick={() => navigate("services")} className="hover:text-cyan-400 transition-colors">Services</button></li>
                <li><button onClick={() => navigate("support")} className="hover:text-cyan-400 transition-colors">Support</button></li>
                <li><button onClick={() => navigate("contact")} className="hover:text-cyan-400 transition-colors">Contact</button></li>
              </ul>
            </div>
            <div>
              <h4 className="text-sm font-semibold text-white mb-3">Connect</h4>
              <ul className="space-y-2 text-sm">
                <li className="flex items-center gap-2"><Mail className="w-4 h-4" /> info@nexorasys.com</li>
                <li className="flex items-center gap-2"><Phone className="w-4 h-4" /> +1 (555) 012-3456</li>
                <li className="flex items-center gap-2"><MapPin className="w-4 h-4" /> 4200 Innovation Dr, San Jose, CA</li>
              </ul>
            </div>
          </div>
          <div className="mt-10 pt-8 border-t border-slate-800 text-center text-sm">
            <p>&copy; 2026 Nexora Systems, Inc. All rights reserved.</p>
            {import.meta.env.VITE_CONTROL_SITE_URL && (
              <a href={import.meta.env.VITE_CONTROL_SITE_URL} className="text-slate-500 hover:text-cyan-400 text-xs mt-2 inline-block">Competition Portal</a>
            )}
          </div>
        </div>
      </footer>
    </div>
  );
}

function HomePage({ navigate }: { navigate: (p: Page) => void }) {
  return (
    <>
      <section className="relative bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white overflow-hidden">
        <div className="absolute inset-0 opacity-10" style={{
          backgroundImage: "radial-gradient(circle at 20% 50%, rgba(34, 211, 238, 0.3) 0%, transparent 50%), radial-gradient(circle at 80% 50%, rgba(59, 130, 246, 0.3) 0%, transparent 50%)"
        }} />
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 lg:py-28">
          <div className="max-w-3xl nx-fade-up">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-cyan-500/10 border border-cyan-500/20 rounded-full text-sm text-cyan-300 mb-6">
              <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
              Now deploying AI-native infrastructure
            </div>
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight mb-6">
              Engineering the systems that power <span className="text-cyan-400">tomorrow's enterprise</span>
            </h1>
            <p className="text-lg text-slate-300 mb-8 max-w-2xl">
              We design, build, and operate resilient cloud platforms, zero-trust security architectures, and distributed systems for organizations that cannot afford downtime.
            </p>
            <div className="flex flex-wrap gap-4">
              <button
                onClick={() => navigate("services")}
                className="flex items-center gap-2 px-6 py-3.5 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold rounded-xl transition-all shadow-lg shadow-cyan-500/20"
              >
                Explore Services
                <ArrowRight className="w-4 h-4" />
              </button>
              <button
                onClick={() => navigate("contact")}
                className="px-6 py-3.5 border border-slate-600 hover:border-slate-400 text-white font-medium rounded-xl transition-colors"
              >
                Schedule Consultation
              </button>
            </div>
          </div>
        </div>
      </section>

      <section className="bg-slate-900/50 border-y border-slate-800 text-white py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
            <div>
              <p className="text-3xl sm:text-4xl font-bold text-cyan-400">99.999%</p>
              <p className="text-sm text-slate-400 mt-1">Platform Uptime</p>
            </div>
            <div>
              <p className="text-3xl sm:text-4xl font-bold text-cyan-400">500+</p>
              <p className="text-sm text-slate-400 mt-1">Enterprise Deployments</p>
            </div>
            <div>
              <p className="text-3xl sm:text-4xl font-bold text-cyan-400">14ms</p>
              <p className="text-sm text-slate-400 mt-1">Median Edge Latency</p>
            </div>
            <div>
              <p className="text-3xl sm:text-4xl font-bold text-cyan-400">24/7</p>
              <p className="text-sm text-slate-400 mt-1">Operations Center</p>
            </div>
          </div>
        </div>
      </section>

      <section className="py-20 bg-slate-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto mb-16">
            <h2 className="text-3xl font-bold text-slate-900 mb-4">Core Capabilities</h2>
            <p className="text-slate-600">Architected for resilience, scaled for modern workloads.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              {
                icon: Cloud,
                title: "Cloud Infrastructure",
                desc: "Multi-cloud architecture, automated Kubernetes orchestration, and immutable infrastructure pipelines.",
              },
              {
                icon: Shield,
                title: "Zero-Trust Security",
                desc: "End-to-end identity federation, micro-segmentation, and continuous compliance monitoring.",
              },
              {
                icon: Database,
                title: "Distributed Data",
                desc: "High-throughput streaming, globally replicated databases, and event-driven data fabrics.",
              },
            ].map((s) => (
              <div key={s.title} className="bg-white rounded-2xl p-8 border border-slate-200/80 hover:shadow-xl hover:-translate-y-1 transition-all duration-200">
                <div className="w-12 h-12 rounded-xl bg-cyan-500/10 flex items-center justify-center mb-6">
                  <s.icon className="w-6 h-6 text-cyan-600" />
                </div>
                <h3 className="text-xl font-bold text-slate-900 mb-3">{s.title}</h3>
                <p className="text-slate-600 text-sm leading-relaxed">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-16 bg-white">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="rounded-3xl bg-gradient-to-br from-slate-900 to-slate-800 p-10 sm:p-14 text-center text-white shadow-xl">
            <h2 className="text-2xl sm:text-3xl font-bold mb-3">Ready to harden your platform?</h2>
            <p className="text-slate-300 mb-8 max-w-xl mx-auto">Talk to our engineers about zero-trust, edge and data modernization for your organization.</p>
            <button onClick={() => navigate("contact")} className="inline-flex items-center gap-2 px-6 py-3.5 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold rounded-xl transition-colors">
              Talk to an engineer <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </section>
    </>
  );
}

function AboutPage() {
  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
      {/* Flag 1: HTML Source Inspection Clue */}
      <div
        dangerouslySetInnerHTML={{
          __html:
            "<!-- [STAGING DEPLOYMENT NOTE]: QA verification token for Flag 1: NEXORA{v13w_50urc3_d1sc0v3r_8824} -->",
        }}
      />
      <div data-qa-verification-token="NEXORA{v13w_50urc3_d1sc0v3r_8824}" className="hidden" />

      <h1 className="text-4xl font-bold text-slate-900 mb-6">About Nexora Systems</h1>
      <div className="prose prose-slate max-w-none">
        <p className="text-lg text-slate-600 mb-6">
          Founded in 2018 in San Jose, California, Nexora Systems began with a simple mission: make enterprise-grade infrastructure accessible to organizations of every size.
        </p>
        <p className="text-slate-600 mb-6">
          Our team of 240+ engineers, architects, and security specialists has delivered over 500 enterprise projects across cloud migration, security operations, and data platform engineering. We believe that great infrastructure should be invisible — reliable enough that you forget it's there, until you need to scale.
        </p>
        <h2 className="text-2xl font-bold text-slate-900 mt-10 mb-4">Our Values</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 my-6">
          {[
            { icon: Shield, title: "Security First", desc: "Every system we build assumes adversarial conditions. Zero-trust is the baseline, not the upgrade." },
            { icon: Users, title: "Client Partnership", desc: "We embed with your team, not above it. Your engineers learn alongside ours." },
            { icon: Award, title: "Engineering Excellence", desc: "We hold ourselves to the standards of the best platform teams in the industry." },
          ].map((v) => (
            <div key={v.title} className="bg-slate-50 border border-slate-200 rounded-xl p-5">
              <v.icon className="w-8 h-8 text-cyan-500 mb-3" />
              <h3 className="font-semibold text-slate-900 mb-1">{v.title}</h3>
              <p className="text-sm text-slate-500">{v.desc}</p>
            </div>
          ))}
        </div>
        <h2 className="text-2xl font-bold text-slate-900 mt-10 mb-4">Leadership</h2>
        <p className="text-slate-600 mb-4">
          Our leadership team brings combined experience from Cisco, VMware, HashiCorp, and Palo Alto Networks. We've built infrastructure for startups and Fortune 100 companies alike.
        </p>
        <ul className="space-y-2 text-slate-600">
          <li className="flex items-center gap-2"><ChevronRight className="w-4 h-4 text-cyan-500" /> Dr. Elena Vasquez — CEO & Co-Founder</li>
          <li className="flex items-center gap-2"><ChevronRight className="w-4 h-4 text-cyan-500" /> Marcus Chen — CTO & Co-Founder</li>
          <li className="flex items-center gap-2"><ChevronRight className="w-4 h-4 text-cyan-500" /> Sarah Kim — VP of Security Operations</li>
          <li className="flex items-center gap-2"><ChevronRight className="w-4 h-4 text-cyan-500" /> James O'Brien — VP of Cloud Engineering</li>
        </ul>
      </div>
    </div>
  );
}

function ServicesPage() {
  const services = [
    { icon: Cloud, title: "Cloud Platform Engineering", desc: "Designing multi-cloud foundations on AWS, Azure, and GCP with automated governance, cost controls, and Kubernetes.", details: ["Multi-region architecture", "GitOps continuous delivery", "Terraform & OpenTofu modules", "Cost optimization & FinOps"] },
    { icon: Shield, title: "Zero-Trust Architecture", desc: "Modern security posture for perimeter-less organizations. Identity-aware proxies, micro-segmentation, and SPIFFE/SPIRE.", details: ["Identity-based access control", "Service-to-service mTLS", "Automated secret rotation", "Continuous compliance auditing"] },
    { icon: Network, title: "Edge & Distributed Systems", desc: "Low-latency applications deployed across hybrid cloud and global edge nodes with automated traffic routing.", details: ["Anycast edge routing", "WebAssembly edge compute", "Global server load balancing", "Offline-first sync protocols"] },
    { icon: Database, title: "Data Platform Modernization", desc: "Real-time streaming pipelines, lakehouse architectures, and distributed analytical engines at petabyte scale.", details: ["Kafka & Flink streaming", "Iceberg lakehouse design", "Data mesh organizational model", "Automated data quality monitoring"] },
  ];
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
      <h1 className="text-4xl font-bold text-slate-900 mb-4">Enterprise Services</h1>
      <p className="text-lg text-slate-500 mb-12 max-w-2xl">
        Comprehensive platform engineering and security capabilities designed for mission-critical operations.
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {services.map((s) => (
          <div key={s.title} className="bg-white border border-slate-200 rounded-2xl p-8 hover:shadow-lg transition-shadow">
            <s.icon className="w-10 h-10 text-cyan-500 mb-4" />
            <h3 className="text-xl font-bold text-slate-900 mb-2">{s.title}</h3>
            <p className="text-slate-600 text-sm mb-6">{s.desc}</p>
            <ul className="space-y-2">
              {s.details.map((d) => (
                <li key={d} className="flex items-center gap-2 text-sm text-slate-500">
                  <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
                  {d}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}

function ResearchPage() {
  const papers = [
    {
      title: "Zero-Trust Architecture in Multi-Cloud Environments",
      date: "March 2026",
      authors: "Dr. Elena Vasquez, Marcus Chen",
      securityNote: "Integrity Policy: Document metadata header [x-nexora-vault-alpha] verified.",
    },
    { title: "Edge-Native Computing: Latency Patterns at Scale", date: "January 2026", authors: "James O'Brien, Sarah Kim" },
    { title: "Adversarial ML in Security Operations: A Practitioner's Guide", date: "November 2025", authors: "Sarah Kim, Dr. Elena Vasquez" },
    { title: "The Economics of Cloud Repatriation: When to Move Back On-Prem", date: "September 2025", authors: "Marcus Chen, James O'Brien" },
  ];
  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
      <h1 className="text-4xl font-bold text-slate-900 mb-4">Research & Publications</h1>
      <p className="text-lg text-slate-500 mb-10">
        Our engineering team publishes original research on infrastructure, security, and distributed systems.
      </p>
      <div className="space-y-4">
        {papers.map((p) => (
          <div key={p.title} className="bg-slate-50 border border-slate-200 rounded-xl p-5 hover:border-slate-300 transition-colors">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="font-semibold text-slate-900 mb-1">{p.title}</h3>
                <p className="text-sm text-slate-500">{p.authors}</p>
                {p.securityNote && (
                  <div className="mt-3 inline-block text-xs font-mono text-cyan-800 bg-cyan-50 border border-cyan-200 px-2.5 py-1 rounded">
                    {p.securityNote}
                  </div>
                )}
              </div>
              <span className="text-sm text-slate-400 whitespace-nowrap">{p.date}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ProjectsPage() {
  const projects = [
    { name: "Project Helios", client: "Global Financial Services", desc: "Multi-region Kubernetes platform serving 12M daily transactions.", tags: ["Kubernetes", "Multi-cloud", "Financial"] },
    {
      name: "Project Sentinel",
      client: "Healthcare Provider",
      desc: "Zero-trust network architecture across 40+ facilities with automated access attestation.",
      tags: ["Security", "Zero-trust", "Healthcare"],
      securityNote: "Architecture Token: Client theme variable [--nexora-vault-beta] active in stylesheet.",
      rule: "Notice: Multi-layer tokens must be assembled in order: [Meta Tag Alpha] + [Theme Token Beta] + [Session Token Gamma].",
    },
    { name: "Project Atlas", client: "E-commerce Platform", desc: "Real-time data pipeline processing 2TB/day of event data.", tags: ["Data", "Streaming", "E-commerce"] },
    { name: "Project Mercury", client: "Telecommunications", desc: "Edge computing infrastructure across 200 regional sites.", tags: ["Edge", "Networking", "Telecom"] },
    { name: "Project Vanguard", client: "Government Agency", desc: "FedRAMP-compliant cloud migration with full audit trail.", tags: ["Cloud", "Compliance", "Government"] },
    { name: "Project Phoenix", client: "Manufacturing", desc: "OT/IT convergence platform for smart factory operations.", tags: ["IoT", "Manufacturing", "Security"] },
  ];
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
      <h1 className="text-4xl font-bold text-slate-900 mb-4">Selected Projects</h1>
      <p className="text-lg text-slate-500 mb-10 max-w-2xl">
        A selection of infrastructure and security projects we've delivered for enterprise clients.
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {projects.map((p) => (
          <div key={p.name} className="bg-white border border-slate-200 rounded-2xl p-6 hover:shadow-lg transition-shadow">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-semibold text-slate-900">{p.name}</h3>
              <span className="text-xs text-slate-400">{p.client}</span>
            </div>
            <p className="text-sm text-slate-500 mb-4">{p.desc}</p>
            {p.securityNote && (
              <div className="mb-4 text-xs font-mono bg-cyan-50 border border-cyan-200 text-cyan-800 p-2.5 rounded-lg">
                <span className="font-semibold block">{p.securityNote}</span>
                <span className="text-slate-500 text-[11px] mt-1 block">{p.rule}</span>
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              {p.tags.map((t) => (
                <span key={t} className="text-xs px-2 py-1 bg-slate-100 text-slate-600 rounded-full">{t}</span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function BlogPage() {
  useEffect(() => {
    try {
      sessionStorage.setItem("nexora_vault_gamma", "Y2g0MW5fNTkyM30=");
    } catch {}
  }, []);
  const posts = [
    { title: "Why We Migrated from Terraform to OpenTofu", excerpt: "Our journey transitioning 200+ infrastructure modules to the open-source fork.", date: "March 12, 2026", author: "Marcus Chen" },
    {
      title: "Building a Zero-Trust Network Without Disrupting Operations",
      excerpt: "Practical strategies for phased zero-trust adoption in brownfield environments.",
      date: "February 28, 2026",
      author: "Sarah Kim",
      securityNote: "Session Storage Hook: Active audit token cached in sessionStorage key [nexora_vault_gamma].",
    },
    { title: "The Hidden Cost of Over-Provisioned Cloud Infrastructure", excerpt: "How we saved a client $2.4M annually through systematic right-sizing.", date: "February 10, 2026", author: "James O'Brien" },
    { title: "Edge Computing Patterns for Latency-Sensitive Applications", excerpt: "Five architectural patterns we've validated in production edge deployments.", date: "January 22, 2026", author: "Dr. Elena Vasquez" },
  ];
  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
      <h1 className="text-4xl font-bold text-slate-900 mb-10">Engineering Blog</h1>
      <div className="space-y-6">
        {posts.map((post) => (
          <article key={post.title} className="border-b border-slate-200 pb-6">
            <h2 className="text-xl font-semibold text-slate-900 mb-2 hover:text-cyan-600 cursor-pointer">{post.title}</h2>
            <p className="text-slate-500 mb-3">{post.excerpt}</p>
            {post.securityNote && (
              <div className="mb-3 inline-block text-xs font-mono text-cyan-800 bg-cyan-50 border border-cyan-200 px-2.5 py-1 rounded">
                {post.securityNote}
              </div>
            )}
            <div className="flex items-center gap-3 text-sm text-slate-400">
              <span>{post.author}</span>
              <span>·</span>
              <span>{post.date}</span>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

interface AdvisoryItem {
  id: number;
  advisory_id: string;
  title: string;
  severity: string;
}

const DEFAULT_ADVISORIES: AdvisoryItem[] = [
  { id: 1, advisory_id: "CVE-2026-1048", title: "Edge Gateway Memory Buffer Boundary Overflow", severity: "HIGH" },
  { id: 2, advisory_id: "CVE-2026-0812", title: "TLS Session Resumption Key Invalidation Notice", severity: "MEDIUM" },
  { id: 3, advisory_id: "CVE-2025-4491", title: "DNSSEC Resolver Verification Failure in Staging", severity: "LOW" },
  { id: 4, advisory_id: "CVE-2025-3920", title: "Kubernetes Ingress Controller Header Normalization", severity: "MEDIUM" },
];

function SupportPage() {
  const [telemetry, setTelemetry] = useState<{ status: string; nodes: number; latency: number } | null>(null);

  // SQL Injection challenge state
  const [queryTerm, setQueryTerm] = useState("");
  const [advisoryResults, setAdvisoryResults] = useState<AdvisoryItem[]>(DEFAULT_ADVISORIES);
  // Flag 6: a successful UNION dump renders the vault row; claim whatever flag it shows.
  useEffect(() => {
    advisoryResults.forEach((a) => foundFlag(a.title));
  }, [advisoryResults]);
  const [sqlError, setSqlError] = useState<string | null>(null);

  useEffect(() => {
    supabase
      ?.from("nexora_advisories")
      .select("id, advisory_id, title, severity")
      .order("id")
      .then(({ data }) => {
        if (data?.length) setAdvisoryResults(data as AdvisoryItem[]);
      });
  }, []);

  useEffect(() => {
    fetch("/api/v1/system-status.json")
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load");
        return res.json();
      })
      .then((data) => {
        setTelemetry({
          status: data.status || "operational",
          nodes: data.active_nodes || 48,
          latency: data.latency_ms || 14,
        });
      })
      .catch(() => {
        setTelemetry({ status: "operational", nodes: 48, latency: 14 });
      });
  }, []);

  const handleSqlSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setSqlError(null);
    const input = queryTerm.trim();

    if (!input) {
      setAdvisoryResults(DEFAULT_ADVISORIES);
      return;
    }

    const lower = input.toLowerCase();

    // 1. Check for ORDER BY clause analysis
    const orderMatch = lower.match(/order\s+by\s+(\d+)/);
    if (orderMatch) {
      const colNum = parseInt(orderMatch[1], 10);
      if (colNum > 4) {
        setSqlError(`SQL Error (1054): Unknown column '${colNum}' in 'order clause'. Active projection has 4 columns (id, advisory_id, title, severity).`);
        setAdvisoryResults([]);
        return;
      }
      setAdvisoryResults(DEFAULT_ADVISORIES);
      return;
    }

    // 2. Check for UNION SELECT injections
    if (lower.includes("union") && lower.includes("select")) {
      const selectPart = lower.split("select")[1] || "";
      const beforeFrom = selectPart.split("from")[0] || selectPart.split("--")[0] || selectPart.split("#")[0] || selectPart;
      const columns = beforeFrom.split(",").map((s) => s.trim()).filter(Boolean);

      // Verify column matching (expected 4 columns)
      if (columns.length !== 4) {
        setSqlError(`SQL Error (1222): The used SELECT statements have a different number of columns. Received ${columns.length} columns, expected 4.`);
        setAdvisoryResults([]);
        return;
      }

      // Check schema or table discovery
      if (lower.includes("information_schema") || lower.includes("sqlite_master")) {
        setAdvisoryResults([
          {
            id: 0,
            advisory_id: "SCHEMA_INFO",
            title: "Disclosed Table: 'nexora_vault' (columns: id, advisory_id, flag_data, severity)",
            severity: "INTERNAL",
          },
        ]);
        return;
      }

      // Check for vault exfiltration
      if (lower.includes("nexora_vault") || lower.includes("flag")) {
        setAdvisoryResults([
          ...DEFAULT_ADVISORIES.slice(0, 2),
          {
            id: 99,
            advisory_id: "AUDIT-FLAG-VAULT",
            title: (function() {
              const c = [0x3c, 0x37, 0x2a, 0x3d, 0x20, 0x33, 0x09, 0x07, 0x1c, 0x43, 0x42, 0x1c, 0x2d, 0x47, 0x03, 0x1e, 0x43, 0x2d, 0x47, 0x11, 0x1a, 0x41, 0x1f, 0x46, 0x2d, 0x41, 0x0a, 0x14, 0x43, 0x1e, 0x06, 0x00, 0x46, 0x06, 0x43, 0x42, 0x1c, 0x2d, 0x4b, 0x46, 0x43, 0x40, 0x0f];
              return c.map(b => String.fromCharCode(b ^ 0x72)).join('');
            })(),
            severity: "CRITICAL",
          },
        ]);
        return;
      }

      // Generic valid 4-column union test (e.g. ' UNION SELECT 1, 2, 3, 4 --)
      setAdvisoryResults([
        ...DEFAULT_ADVISORIES,
        {
          id: 999,
          advisory_id: columns[1] || "TEST_2",
          title: columns[2] || "TEST_3",
          severity: (columns[3] || "TEST_4").toUpperCase().slice(0, 10),
        },
      ]);
      return;
    }

    // 3. Syntax error trigger on unbalanced quote
    const quoteCount = (input.match(/'/g) || []).length;
    if (quoteCount % 2 !== 0 && !lower.includes("--") && !lower.includes("#")) {
      setSqlError(`Database Error 1064 (42000): You have an error in your SQL syntax near '${input.slice(-6)}' at line 1.\nGenerated Query: SELECT id, advisory_id, title, severity FROM security_advisories WHERE advisory_id LIKE '%${input}%' OR title LIKE '%${input}%'`);
      setAdvisoryResults([]);
      return;
    }

    // 4. Boolean bypass (e.g. ' OR '1'='1)
    if (lower.includes("or '1'='1") || lower.includes("or 1=1")) {
      // Returns all public rows, teaching participants that simple bypass does not dump vault
      setAdvisoryResults(DEFAULT_ADVISORIES);
      return;
    }

    // 5. Normal search
    const filtered = DEFAULT_ADVISORIES.filter(
      (a) => a.advisory_id.toLowerCase().includes(lower) || a.title.toLowerCase().includes(lower)
    );
    setAdvisoryResults(filtered);
  };

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
      <h1 className="text-4xl font-bold text-slate-900 mb-4">Support Center</h1>
      <p className="text-lg text-slate-500 mb-8">Get help with Nexora Systems products and services.</p>

      {/* Flag 4 Live Telemetry Widget */}
      <div className="mb-10 bg-gradient-to-r from-slate-900 to-slate-800 rounded-2xl p-6 text-white border border-slate-700 shadow-md">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-cyan-500/20 border border-cyan-500/30 flex items-center justify-center">
              <Activity className="w-5 h-5 text-cyan-400 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping" />
                <h3 className="font-semibold text-white text-sm sm:text-base">Global Mesh Network Telemetry</h3>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">Live telemetry & diagnostic cluster feed (inspect network activity)</p>
            </div>
          </div>
          <div className="flex items-center gap-4 text-xs font-mono">
            <div className="bg-slate-800/80 px-3 py-1.5 rounded-lg border border-slate-700">
              <span className="text-slate-400">Status: </span>
              <span className="text-emerald-400 font-bold uppercase">{telemetry?.status || "Connecting..."}</span>
            </div>
            <div className="bg-slate-800/80 px-3 py-1.5 rounded-lg border border-slate-700">
              <span className="text-slate-400">Latency: </span>
              <span className="text-cyan-400 font-bold">{telemetry?.latency || 14}ms</span>
            </div>
          </div>
        </div>
      </div>

      {/* Flag 6: Difficult SQL Injection Advisory Search Tool */}
      <div className="mb-12 bg-slate-900 border border-slate-800 rounded-2xl p-6 text-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-800 pb-4 mb-5">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-cyan-500/20 flex items-center justify-center">
              <Terminal className="w-5 h-5 text-cyan-400" />
            </div>
            <div>
              <h3 className="font-bold text-white text-base">Security Advisory & Incident Query Database</h3>
              <p className="text-xs text-slate-400 font-mono">advisory-db.nexorasys.internal:3306 [MySQL 8.0 Direct Pass-Through]</p>
            </div>
          </div>
          <span className="text-xs font-mono px-2.5 py-1 bg-slate-800 rounded text-slate-400 border border-slate-700">Audit Subsystem</span>
        </div>

        <form onSubmit={handleSqlSearch} className="mb-4">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-3.5" />
              <input
                type="text"
                value={queryTerm}
                onChange={(e) => setQueryTerm(e.target.value)}
                placeholder="Query CVE id or topic (e.g., CVE-2026-1048, buffer, zero-trust)..."
                className="w-full bg-slate-950 border border-slate-700 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 font-mono"
              />
            </div>
            <button
              type="submit"
              className="px-5 py-2.5 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold rounded-xl text-sm transition-colors"
            >
              Execute Query
            </button>
            {queryTerm && (
              <button
                type="button"
                onClick={() => {
                  setQueryTerm("");
                  setSqlError(null);
                  setAdvisoryResults(DEFAULT_ADVISORIES);
                }}
                className="px-3 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-sm transition-colors font-mono"
              >
                Reset
              </button>
            )}
          </div>
        </form>

        {/* SQL Error Box */}
        {sqlError && (
          <div className="mb-5 bg-red-950/40 border border-red-500/50 rounded-xl p-4 font-mono text-xs text-red-300">
            <div className="flex items-center gap-2 mb-1.5 font-bold text-red-400">
              <AlertTriangle className="w-4 h-4" />
              <span>DATABASE EXECUTION EXCEPTION</span>
            </div>
            <pre className="whitespace-pre-wrap text-[11px] leading-relaxed text-red-200">{sqlError}</pre>
          </div>
        )}

        {/* Results Table */}
        <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-950/60">
          <table className="w-full text-left text-xs font-mono">
            <thead className="bg-slate-800/80 text-slate-400 border-b border-slate-800">
              <tr>
                <th className="py-2.5 px-3 w-16">ID</th>
                <th className="py-2.5 px-3 w-40">Advisory ID</th>
                <th className="py-2.5 px-3">Summary / Assessment Details</th>
                <th className="py-2.5 px-3 w-28">Severity</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {advisoryResults.length === 0 && !sqlError ? (
                <tr>
                  <td colSpan={4} className="py-4 text-center text-slate-500">
                    No matching records found in active dataset.
                  </td>
                </tr>
              ) : (
                advisoryResults.map((item, idx) => (
                  <tr key={idx} className="hover:bg-slate-900/60 transition-colors">
                    <td className="py-2.5 px-3 text-slate-500">{item.id}</td>
                    <td className="py-2.5 px-3 font-semibold text-cyan-400">{item.advisory_id}</td>
                    <td className="py-2.5 px-3 text-slate-200 select-all">{item.title}</td>
                    <td className="py-2.5 px-3">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          item.severity === "CRITICAL"
                            ? "bg-red-500/20 text-red-400 border border-red-500/40"
                            : item.severity === "HIGH"
                            ? "bg-amber-500/20 text-amber-400 border border-amber-500/40"
                            : item.severity === "MEDIUM"
                            ? "bg-blue-500/20 text-blue-400 border border-blue-500/40"
                            : item.severity === "INTERNAL"
                            ? "bg-purple-500/20 text-purple-400 border border-purple-500/40"
                            : "bg-slate-700 text-slate-300"
                        }`}
                      >
                        {item.severity}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {[
          { icon: Mail, title: "Email Support", desc: "support@nexorasys.com", note: "Response within 4 hours" },
          { icon: Phone, title: "Phone Support", desc: "+1 (555) 012-3456", note: "24/7 for enterprise clients" },
          { icon: Users, title: "Community Forum", desc: "Join our developer community", note: "forum.nexorasys.com" },
          { icon: Shield, title: "Security Incidents", desc: "security@nexorasys.com", note: "Immediate response" },
        ].map((s) => (
          <div key={s.title} className="bg-slate-50 border border-slate-200 rounded-2xl p-6">
            <s.icon className="w-8 h-8 text-cyan-500 mb-3" />
            <h3 className="font-semibold text-slate-900 mb-1">{s.title}</h3>
            <p className="text-sm text-slate-600">{s.desc}</p>
            <p className="text-xs text-slate-400 mt-1">{s.note}</p>
          </div>
        ))}
      </div>
      <div className="mt-10 bg-slate-900 text-white rounded-2xl p-8">
        <h2 className="text-xl font-bold mb-2">Knowledge Base</h2>
        <p className="text-slate-400 text-sm mb-4">Browse our documentation, guides, and API references.</p>
        <div className="flex flex-wrap gap-3">
          {["Getting Started", "API Reference", "Security Guides", "Cloud Migration", "Troubleshooting"].map((t) => (
            <span key={t} className="text-sm px-3 py-1.5 bg-slate-800 rounded-lg text-slate-300 hover:text-cyan-400 cursor-pointer">{t}</span>
          ))}
        </div>
      </div>
    </div>
  );
}

function ContactPage() {
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const field = "w-full border border-slate-300 rounded-lg px-4 py-2.5 focus:outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20 transition";

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    setState("sending");
    const { error } = supabase
      ? await supabase.from("nexora_contact_messages").insert({
          first_name: String(f.get("first_name")),
          last_name: String(f.get("last_name")),
          email: String(f.get("email")),
          company: String(f.get("company") || ""),
          message: String(f.get("message")),
        })
      : { error: null }; // no backend configured: accept silently
    if (error) return setState("error");
    form.reset();
    setState("sent");
  };

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
      <h1 className="text-4xl font-bold text-slate-900 mb-4">Get in Touch</h1>
      <p className="text-lg text-slate-500 mb-10">Tell us about your project and we'll get back to you within one business day.</p>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        <div className="space-y-4">
          <div className="flex items-start gap-3">
            <MapPin className="w-5 h-5 text-cyan-500 mt-0.5" />
            <div>
              <p className="font-medium text-slate-900">Headquarters</p>
              <p className="text-sm text-slate-500">4200 Innovation Dr<br />San Jose, CA 95134</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <Mail className="w-5 h-5 text-cyan-500 mt-0.5" />
            <div>
              <p className="font-medium text-slate-900">Email</p>
              <p className="text-sm text-slate-500">info@nexorasys.com</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <Phone className="w-5 h-5 text-cyan-500 mt-0.5" />
            <div>
              <p className="font-medium text-slate-900">Phone</p>
              <p className="text-sm text-slate-500">+1 (555) 012-3456</p>
            </div>
          </div>
        </div>
        <div className="md:col-span-2">
          {state === "sent" && (
            <div role="status" className="mb-4 flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
              <CheckCircle className="w-4 h-4" /> Message sent. We'll reply within one business day.
            </div>
          )}
          {state === "error" && (
            <div role="alert" className="mb-4 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
              <AlertTriangle className="w-4 h-4" /> Could not send your message. Please try again.
            </div>
          )}
          <form className="space-y-4" onSubmit={submit}>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <input name="first_name" required maxLength={80} aria-label="First name" placeholder="First Name" className={field} />
              <input name="last_name" required maxLength={80} aria-label="Last name" placeholder="Last Name" className={field} />
            </div>
            <input name="email" type="email" required maxLength={200} aria-label="Work email" placeholder="Work Email" className={field} />
            <input name="company" maxLength={120} aria-label="Company" placeholder="Company" className={field} />
            <textarea name="message" required maxLength={2000} aria-label="Message" placeholder="How can we help?" rows={5} className={field} />
            <button disabled={state === "sending"} className="inline-flex items-center gap-2 px-6 py-3 bg-slate-900 hover:bg-slate-800 disabled:opacity-60 text-white font-semibold rounded-lg transition-colors">
              {state === "sending" && <Loader2 className="w-4 h-4 animate-spin" />} Send Message
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

function GalleryPage() {
  const shots = [
    { file: "office.png", title: "Operations Floor", caption: "Our San Jose network operations center, 24/7." },
    { file: "network.png", title: "Mesh Topology", caption: "A snapshot of the global edge mesh." },
    { file: "lake.png", title: "Retreat at the Lake", caption: "Annual engineering offsite, Lake Tahoe." },
    { file: "workspace.jpg", title: "Workspace", caption: "Where our platform engineers build." },
  ];
  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
      <h1 className="text-4xl font-bold text-slate-900 mb-4">Gallery</h1>
      <p className="text-lg text-slate-500 mb-10 max-w-2xl">Life at Nexora Systems. Full-resolution press images are available for download.</p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {shots.map((s) => (
          <figure key={s.file} className="bg-white border border-slate-200 rounded-2xl overflow-hidden hover:shadow-xl transition-shadow">
            <img src={`/gallery/${s.file}`} alt={s.title} loading="lazy" className="w-full aspect-[3/2] object-cover" />
            <figcaption className="flex items-center justify-between gap-4 p-5">
              <div>
                <p className="font-semibold text-slate-900">{s.title}</p>
                <p className="text-sm text-slate-500">{s.caption}</p>
              </div>
              <a href={`/gallery/${s.file}`} download className="shrink-0 p-2.5 rounded-lg text-slate-500 hover:text-cyan-600 hover:bg-cyan-50 focus-visible:ring-2 focus-visible:ring-cyan-500" aria-label={`Download ${s.title}`}>
                <Download className="w-5 h-5" />
              </a>
            </figcaption>
          </figure>
        ))}
      </div>
    </div>
  );
}

function LoginPage() {
  const [denied, setDenied] = useState(false);
  return (
    <div className="max-w-md mx-auto px-4 sm:px-6 py-16">
      <div className="bg-white border border-slate-200 rounded-2xl p-8 shadow-lg">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-xl bg-slate-900 mb-4">
            <Lock className="w-7 h-7 text-cyan-400" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900">Employee Portal</h1>
          <p className="text-sm text-slate-500 mt-1">Sign in to your Nexora Systems account</p>
        </div>
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); setDenied(true); }}>
          {denied && (
            <p role="alert" className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">Invalid credentials. Contact IT if you are locked out.</p>
          )}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Username</label>
            <input placeholder="username@nexorasys.com" className="w-full border border-slate-300 rounded-lg px-4 py-2.5 focus:outline-none focus:border-cyan-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Password</label>
            <input type="password" placeholder="Enter password" className="w-full border border-slate-300 rounded-lg px-4 py-2.5 focus:outline-none focus:border-cyan-500" />
          </div>
          <button className="w-full bg-slate-900 hover:bg-slate-800 text-white font-semibold py-3 rounded-lg transition-colors">
            Sign In
          </button>
        </form>
        <div className="mt-6 text-center">
          <a href="#" className="text-sm text-slate-500 hover:text-cyan-600">Forgot your password?</a>
        </div>
      </div>
    </div>
  );
}

function ConfidentialAuditPortalPage() {
  const [clearanceCode, setClearanceCode] = useState("");
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [authError, setAuthError] = useState(false);

  const handleClearanceSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (clearanceCode.trim() === "NX-SEC-AUTH-2026") {
      setIsUnlocked(true);
      foundFlag("NEXORA{r0b0ts_s1t3m4p_3xp0s3d_4190}");
      setAuthError(false);
    } else {
      setAuthError(true);
      setIsUnlocked(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
      <div className="bg-red-500/10 border border-red-500/30 rounded-2xl p-6 mb-8 text-red-800">
        <div className="flex items-center gap-3">
          <Shield className="w-6 h-6 text-red-600 flex-shrink-0" />
          <h2 className="text-lg font-bold">CONFIDENTIAL AUDIT PORTAL — RESTRICTED ACCESS</h2>
        </div>
        <p className="text-sm mt-2 text-red-700">
          Internal staging resource. Access requires emergency incident security clearance (check system crawler policy).
        </p>
      </div>

      <div className="bg-slate-900 text-white rounded-2xl p-8 font-mono shadow-2xl border border-slate-800">
        <div className="flex items-center justify-between border-b border-slate-800 pb-4 mb-6">
          <div className="flex items-center gap-2">
            <CheckCircle className="w-5 h-5 text-emerald-400" />
            <span className="text-cyan-400 text-sm font-semibold">NEXORA SECURITY AUDIT #4029</span>
          </div>
          <span className="text-slate-500 text-xs uppercase tracking-wider">Classification: INTERNAL-ONLY</span>
        </div>

        {!isUnlocked ? (
          <div className="bg-slate-950 border border-slate-800 rounded-xl p-6 mb-6">
            <h3 className="text-sm font-semibold text-slate-300 mb-2">Emergency Access Clearance Verification</h3>
            <p className="text-xs text-slate-400 mb-4 leading-relaxed">
              This internal portal is locked under SOC-2 policy. Provide the emergency incident clearance token documented in administrative crawl policies:
            </p>
            <form onSubmit={handleClearanceSubmit} className="flex gap-2">
              <input
                type="text"
                value={clearanceCode}
                onChange={(e) => setClearanceCode(e.target.value)}
                placeholder="Enter Clearance Code (e.g. NX-SEC-...)"
                className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 font-mono"
              />
              <button
                type="submit"
                className="px-5 py-2 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold rounded-lg text-sm transition-colors"
              >
                Unlock Records
              </button>
            </form>
            {authError && (
              <p className="text-xs text-red-400 mt-3 font-mono">
                Access Denied: Invalid clearance token. Please refer to system crawl policy directives.
              </p>
            )}
          </div>
        ) : (
          <div>
            <p className="text-slate-300 text-sm leading-relaxed mb-6">
              Clearance Verified [NX-SEC-AUTH-2026]. Crawler exclusions and discovery boundaries have been validated for public staging. The verification token is below:
            </p>
            <div className="bg-slate-950 border border-cyan-500/40 rounded-xl p-6 text-center my-6 shadow-lg shadow-cyan-500/10">
              <p className="text-xs text-slate-400 tracking-widest uppercase mb-2">CHALLENGE VERIFICATION KEY (FLAG 2)</p>
              <p className="text-2xl sm:text-3xl font-bold text-cyan-400 tracking-wider select-all">
                {"NEXORA{r0b0ts_s1t3m4p_3xp0s3d_4190}"}
              </p>
            </div>
          </div>
        )}

        <div className="mt-8 pt-6 border-t border-slate-800 flex items-center justify-between text-xs text-slate-500">
          <span>Target Host: nexorasys.internal</span>
          <span>Status: AUDIT_COMPLETE</span>
        </div>
      </div>
    </div>
  );
}
