// ============================================================================
// ✉️ Draft Studio — message composition (pure). 30.3. Parts 2 + 4 + 5.
// Composes greeting + body + CTA + signature from the normalized context, shaped
// by purpose, tone, channel and language. Pure text — no business logic; no send.
// ============================================================================
import type { CommContext, Channel, Purpose, Tone, Language } from "./types";

const he = (l: Language) => l === "he";
const fmtPrice = (n: number | null) => (n == null ? null : `₪${n.toLocaleString("he-IL")}`);

// ── Greeting (tone × language) ──────────────────────────────────────────────
function greeting(ctx: CommContext, tone: Tone, l: Language): string {
  const n = ctx.firstName || ctx.name;
  if (he(l)) {
    switch (tone) {
      case "luxury": return `${n} שלום רב,`;
      case "formal": return `לכבוד ${ctx.name},`;
      case "friendly": return `היי ${n}! 😊`;
      case "urgent": return `${n}, שלום —`;
      case "empathetic": return `${n} היקר/ה, שלום`;
      default: return `שלום ${n},`;
    }
  }
  switch (tone) {
    case "luxury": return `Dear ${n},`;
    case "formal": return `Dear ${ctx.name},`;
    case "friendly": return `Hi ${n}! 😊`;
    case "urgent": return `${n} —`;
    case "empathetic": return `Dear ${n},`;
    default: return `Hello ${n},`;
  }
}

// ── Body (purpose, personalized with context facts) ─────────────────────────
function body(ctx: CommContext, purpose: Purpose, tone: Tone, l: Language): string[] {
  const lines: string[] = [];
  const prop = ctx.propertyTitle;
  const price = fmtPrice(ctx.price);
  const broker = ctx.brokerName ? (he(l) ? `אני ${ctx.brokerName}` : `This is ${ctx.brokerName}`) : (he(l) ? "אני" : "I");

  const H = he(l);
  switch (purpose) {
    case "first_contact":
      lines.push(H ? `${broker}${ctx.officeName ? ` מ${ctx.officeName}` : ""}. פניתי אליך בעקבות התעניינותך.` : `${broker}${ctx.officeName ? ` from ${ctx.officeName}` : ""}. I'm reaching out following your interest.`);
      if (ctx.preferences.length) lines.push(H ? `הבנתי שאתה מחפש: ${ctx.preferences.slice(0, 3).join(", ")}.` : `I understand you're looking for: ${ctx.preferences.slice(0, 3).join(", ")}.`);
      break;
    case "follow_up":
      lines.push(H ? `רציתי לעשות סדר ולבדוק איפה הדברים עומדים מבחינתך.` : `I wanted to follow up and see where things stand for you.`);
      if (ctx.lastActivity) lines.push(H ? `מאז ${ctx.lastActivity} לא דיברנו — אשמח לעדכן.` : `We haven't spoken since ${ctx.lastActivity} — happy to update you.`);
      break;
    case "reminder":
      lines.push(H ? `תזכורת קצרה בנוגע ${prop ? `לנכס ${prop}` : "לנושא שלנו"}.` : `A quick reminder regarding ${prop ? `the property ${prop}` : "our matter"}.`);
      break;
    case "negotiation":
      lines.push(H ? `רציתי להתקדם יחד לקראת סגירה ולמצוא את נקודת האיזון הנכונה${price ? ` סביב ${price}` : ""}.` : `I'd like to move us toward a close and find the right balance${price ? ` around ${price}` : ""}.`);
      if (ctx.facts[0]) lines.push(H ? `לתמיכה: ${ctx.facts[0]}.` : `Supporting point: ${ctx.facts[0]}.`);
      break;
    case "thank_you":
      lines.push(H ? `רק רציתי להודות לך על הזמן והאמון.` : `I just wanted to thank you for your time and trust.`);
      break;
    case "document_request":
      lines.push(H ? `כדי להתקדם, אשמח לקבל את המסמכים הרלוונטיים (תעודת זהות, אישור עקרוני, נסח טאבו לפי העניין).` : `To proceed, I'd appreciate the relevant documents (ID, pre-approval, title extract as applicable).`);
      break;
    case "appointment_confirmation":
      lines.push(H ? `מאשר/ת את הפגישה שלנו${prop ? ` בנוגע ל${prop}` : ""}. אנא אשר/י שהמועד נוח.` : `Confirming our meeting${prop ? ` regarding ${prop}` : ""}. Please confirm the time works.`);
      break;
    case "listing_update":
      lines.push(H ? `עדכון בנוגע ${prop ? `לנכס ${prop}` : "לנכס"}${price ? ` (${price})` : ""}.` : `An update regarding ${prop ? `the property ${prop}` : "the listing"}${price ? ` (${price})` : ""}.`);
      if (ctx.facts[0]) lines.push(H ? ctx.facts[0] : ctx.facts[0]);
      break;
    case "price_discussion":
      lines.push(H ? `רציתי לדבר איתך על התמחור${price ? ` (${price})` : ""} לאור נתוני השוק העדכניים.` : `I'd like to discuss pricing${price ? ` (${price})` : ""} in light of current market data.`);
      if (ctx.facts[0]) lines.push(H ? `לפי הנתונים: ${ctx.facts[0]}.` : `Per the data: ${ctx.facts[0]}.`);
      break;
    case "meeting_summary":
      lines.push(H ? `סיכום קצר מהפגישה שלנו והצעדים הבאים:` : `A short summary of our meeting and next steps:`);
      for (const f of ctx.facts.slice(0, 3)) lines.push(`• ${f}`);
      break;
    default:
      lines.push(H ? `רציתי ליצור קשר בנוגע להתקדמות שלנו.` : `I wanted to reach out regarding our progress.`);
  }

  if (tone === "empathetic") lines.push(H ? `חשוב לי שתרגיש/י בנוח לאורך כל הדרך.` : `It's important to me that you feel comfortable throughout.`);
  if (tone === "urgent") lines.push(H ? `הנושא רגיש לזמן — אשמח למענה מהיר.` : `This is time-sensitive — a quick reply would help.`);
  if (tone === "luxury") lines.push(H ? `אני כאן כדי להעניק לך ליווי אישי ודיסקרטי.` : `I'm here to provide discreet, white-glove guidance.`);
  return lines;
}

// ── CTA (purpose) ───────────────────────────────────────────────────────────
function cta(purpose: Purpose, l: Language): string {
  const H = he(l);
  switch (purpose) {
    case "appointment_confirmation": return H ? "אשמח לאישור קצר. 🙏" : "A quick confirmation would be great. 🙏";
    case "document_request": return H ? "אפשר לשלוח לי כאן ישירות." : "You can send them right here.";
    case "negotiation": case "price_discussion": return H ? "מתי נוח לך לשיחה קצרה היום/מחר?" : "When's a good time for a short call today/tomorrow?";
    case "thank_you": return H ? "תמיד לרשותך." : "Always at your service.";
    case "reminder": return H ? "אשמח לתיאום המשך." : "Happy to coordinate next steps.";
    default: return H ? "אשמח לשמוע ממך. 📲" : "Looking forward to hearing from you. 📲";
  }
}

function signature(ctx: CommContext, l: Language): string {
  const b = ctx.brokerName ?? (he(l) ? "צוות ZONO" : "ZONO Team");
  return he(l) ? `בברכה,\n${b}${ctx.officeName ? ` · ${ctx.officeName}` : ""}` : `Best regards,\n${b}${ctx.officeName ? ` · ${ctx.officeName}` : ""}`;
}

// ── Assemble a body for a channel + tone (length-aware) ─────────────────────
export function composeBody(ctx: CommContext, channel: Channel, purpose: Purpose, tone: Tone, l: Language): string {
  const g = greeting(ctx, tone, l);
  let lines = body(ctx, purpose, tone, l);
  const call = cta(purpose, l);
  const sig = signature(ctx, l);

  // Length shaping: sms/short → 1 core line + short CTA, no signature block.
  const shortMode = tone === "short" || channel === "sms";
  const longMode = tone === "long" || channel === "email";

  if (shortMode) {
    const core = lines[0] ?? "";
    return `${g} ${core} ${call}`.replace(/\s+/g, " ").trim();
  }

  if (channel === "call") {
    // Phone-call script: bullet structure (opening / message / objection / close).
    const H = he(l);
    return [
      `${H ? "פתיחה" : "Opening"}: ${g}`,
      `${H ? "מסר" : "Message"}: ${lines.join(" ")}`,
      `${H ? "התנגדות צפויה" : "Likely objection"}: ${H ? "\"אני עוד חושב/ת\" → הצע ערך וזמן קצר." : "\"I'm still thinking\" → offer value + a short slot."}`,
      `${H ? "סגירה" : "Close"}: ${call}`,
    ].join("\n");
  }

  if (longMode && ctx.facts.length && purpose !== "meeting_summary") {
    lines = [...lines, (he(l) ? "כמה נקודות רלוונטיות:" : "A few relevant points:"), ...ctx.facts.slice(0, 3).map((f) => `• ${f}`)];
  }

  return `${g}\n\n${lines.join("\n")}\n\n${call}\n\n${sig}`;
}

export function subjectLine(ctx: CommContext, purpose: Purpose, l: Language): string {
  const H = he(l);
  const p = ctx.propertyTitle ? ` · ${ctx.propertyTitle}` : "";
  const map: Record<string, string> = H
    ? { first_contact: "נעים להכיר", follow_up: "המשך טיפול", reminder: "תזכורת", negotiation: "לקראת סגירה", thank_you: "תודה", document_request: "מסמכים להמשך", appointment_confirmation: "אישור פגישה", listing_update: "עדכון נכס", price_discussion: "עדכון תמחור", meeting_summary: "סיכום פגישה", general: "עדכון" }
    : { first_contact: "Nice to connect", follow_up: "Following up", reminder: "Reminder", negotiation: "Toward a close", thank_you: "Thank you", document_request: "Documents to proceed", appointment_confirmation: "Meeting confirmation", listing_update: "Listing update", price_discussion: "Pricing update", meeting_summary: "Meeting summary", general: "Update" };
  return `${map[purpose] ?? map.general}${p}`;
}
