// ============================================================================
// ✅ ZONO Website Design System™ — pure self-tests (offline). 38.1.
// Validates the shared navigation/footer model (links, CTA preference, contact).
// ============================================================================
import { buildSiteNav, buildSiteFooter, type SiteBrandingLite } from "./nav";

export interface SUCheck { name: string; pass: boolean; detail: string }
export interface SUSelfCheck { ok: boolean; total: number; passed: number; checks: SUCheck[] }

const b = (o: Partial<SiteBrandingLite> = {}): SiteBrandingLite => ({ officeName: "נדל\"ן זונו", logo: null, phone: "03-1234567", whatsapp: "972500000000", email: "info@zono.co.il", address: "תל אביב", ...o });

export function runSelfCheck(): SUSelfCheck {
  const checks: SUCheck[] = [];
  const add = (n: string, p: boolean, d = "") => checks.push({ name: n, pass: p, detail: d });

  const nav = buildSiteNav("office-x", b(), "ai-site");
  add("brand href to site root", nav.brand.href === "/ai-site/office-x" && nav.brand.name === "נדל\"ן זונו");
  add("5 canonical links incl ask", nav.links.length === 5 && nav.links.some((l) => l.label === "שאל AI" && l.anchor));
  add("office label for ai-site", nav.links.some((l) => l.label === "המשרד"));
  add("cta prefers whatsapp", nav.cta.kind === "whatsapp" && nav.cta.href.includes("wa.me/972500000000"));

  const navPhone = buildSiteNav("x", b({ whatsapp: null }));
  add("cta falls back to phone", navPhone.cta.kind === "phone" && navPhone.cta.href === "tel:03-1234567");
  const navAsk = buildSiteNav("x", b({ whatsapp: null, phone: null }));
  add("cta falls back to ask", navAsk.cta.kind === "ask" && navAsk.cta.href.endsWith("#ask"));

  const agentNav = buildSiteNav("agent-1", b(), "ai-agent");
  add("agent base → about + agent root", agentNav.links.some((l) => l.label === "אודות" && l.href === "/ai-agent/agent-1/about"));

  const footer = buildSiteFooter(nav, [{ name: "לב העיר", href: "/x/n/lev" }, { name: "כרמל", href: "/x/n/carmel" }]);
  add("footer has nav + areas + contact columns", footer.length === 3 && footer.some((c) => c.title === "אזורים") && footer.some((c) => c.title === "יצירת קשר"));
  add("footer contact includes whatsapp + email", footer.find((c) => c.title === "יצירת קשר")!.links.some((l) => l.label === "WhatsApp") && footer.find((c) => c.title === "יצירת קשר")!.links.some((l) => l.href.startsWith("mailto:")));

  const footerNoAreas = buildSiteFooter(buildSiteNav("x", b({ whatsapp: null, email: null })), []);
  add("footer omits empty areas column", !footerNoAreas.some((c) => c.title === "אזורים"));

  const passed = checks.filter((c) => c.pass).length;
  return { ok: passed === checks.length, total: checks.length, passed, checks };
}
