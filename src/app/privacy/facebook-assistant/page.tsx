import type { Metadata } from "next";

// Public, no-auth privacy policy for the "ZONO Facebook Assistant" Chrome
// extension (item id gifkcocklaemmhjceeiajikdmmpbgjpn). Required by the Chrome
// Web Store because the extension accesses data on facebook.com. Lives at
// /privacy/facebook-assistant so it is a stable, linkable URL.
export const metadata: Metadata = {
  title: "מדיניות פרטיות — ZONO Facebook Assistant | Privacy Policy",
  description:
    "מדיניות הפרטיות של תוסף ZONO Facebook Assistant: אילו נתונים התוסף ניגש אליהם, כיצד הם נמצאים בשימוש, ומהן זכויות המשתמש. Privacy policy for the ZONO Facebook Assistant browser extension.",
  robots: { index: true, follow: true },
};

export const dynamic = "force-static";

const EFFECTIVE_DATE = "9 באוגוסט 2026";
const EFFECTIVE_DATE_EN = "August 9, 2026";
const CONTACT_EMAIL = "tal.pixeld@gmail.com";
const EXTENSION_ID = "gifkcocklaemmhjceeiajikdmmpbgjpn";

function H2({ children }: { children: React.ReactNode }) {
  return <h2 className="text-ink mt-8 mb-2 text-lg font-black">{children}</h2>;
}
function P({ children }: { children: React.ReactNode }) {
  return <p className="text-ink/80 mt-2 text-[15px] leading-relaxed">{children}</p>;
}
function LI({ children }: { children: React.ReactNode }) {
  return <li className="text-ink/80 text-[15px] leading-relaxed">{children}</li>;
}

export default function FacebookAssistantPrivacyPage() {
  return (
    <main className="bg-surface min-h-screen">
      <div className="mx-auto max-w-3xl px-5 py-12 sm:py-16">
        <div className="border-line bg-card rounded-3xl border p-6 sm:p-10">
          <p className="text-brand text-xs font-bold tracking-wide">ZONO</p>
          <h1 className="text-ink mt-1 text-2xl font-black sm:text-3xl">מדיניות פרטיות — ZONO Facebook Assistant</h1>
          <p className="text-muted mt-2 text-sm">בתוקף מיום {EFFECTIVE_DATE} · מזהה תוסף: <span dir="ltr" className="font-mono">{EXTENSION_ID}</span></p>
          <p className="text-muted mt-1 text-xs">גלילה מטה לגרסה האנגלית · Scroll down for the English version</p>

          {/* ───────────────────────── Hebrew ───────────────────────── */}
          <section dir="rtl">
            <H2>מי אנחנו</H2>
            <P>
              תוסף הדפדפן «ZONO Facebook Assistant» (להלן: «התוסף») מופעל על ידי ZONO — מערכת הפעלה מבוססת בינה
              מלאכותית לסוכני נדל&quot;ן. התוסף מהווה כלי עזר המסייע למשתמש לפרסם באופן ידני תכני שיווק שהוכנו מראש
              במערכת ZONO אל קבוצות ו-Marketplace בפייסבוק. מדיניות זו מסבירה אילו נתונים התוסף ניגש אליהם, כיצד הם
              נמצאים בשימוש, וכיצד אנו שומרים על פרטיותך.
            </P>

            <H2>מה התוסף עושה</H2>
            <P>
              התוסף מציג למשתמש תוכן פרסום שהוכן מראש בחשבון ה-ZONO שלו, ומסייע להדביק/להציג אותו בעת גלישה בפייסבוק כדי
              שהמשתמש יפרסם אותו בעצמו. <strong>אין פרסום אוטומטי</strong>, והתוסף <strong>אינו ניגש לסיסמאות או
              לפרטי ההתחברות של פייסבוק</strong>. הפרסום מבוצע תמיד ידנית על ידי המשתמש ובאישורו.
            </P>

            <H2>אילו נתונים התוסף ניגש אליהם</H2>
            <ul className="mt-2 list-disc space-y-2 pr-5">
              <LI>
                <strong>הקשר דף הפייסבוק (facebook.com):</strong> התוסף פועל בדפי facebook.com כדי להציג את התוכן המוכן
                בהקשר הנכון ולסייע לפרסום ידני, ולזהות האם קיים חיבור פעיל לפייסבוק. התוסף <strong>אינו</strong> אוסף
                סיסמאות, פרטי התחברות, הודעות פרטיות, רשימות חברים או נתוני פרופיל אישיים.
              </LI>
              <LI>
                <strong>אחסון מקומי במכשיר (Chrome storage):</strong> מזהה שיוך (pairing) המקשר את התוסף לחשבון ה-ZONO שלך
                והגדרות התוסף. נתונים אלו נשמרים באופן מקומי בדפדפן.
              </LI>
              <LI>
                <strong>נתוני חיבור וסטטוס:</strong> התוסף שולח למערכת ZONO מידע תפעולי מינימלי — סטטוס התוסף, גרסה, וחתימת
                זמן «נראה לאחרונה» — המשויך לחשבון/הארגון שלך ב-ZONO, כדי לתחזק את החיבור ולהציג את תקינותו.
              </LI>
              <LI>
                <strong>תוכן הפרסום עצמו</strong> נוצר על ידך במערכת ZONO ומועבר לתוסף לצורך הצגתו — הוא אינו נאסף מפייסבוק.
              </LI>
            </ul>

            <H2>כיצד אנו משתמשים בנתונים</H2>
            <ul className="mt-2 list-disc space-y-2 pr-5">
              <LI>לספק את פונקציית הסיוע לפרסום — הצגת התוכן המוכן וסיוע בהדבקתו לפרסום ידני.</LI>
              <LI>לתחזק את החיבור בין התוסף לחשבון ה-ZONO שלך ולהציג את תקינות החיבור.</LI>
              <LI>לתמיכה, אבחון תקלות ושיפור אמינות השירות.</LI>
            </ul>

            <H2>מה איננו עושים</H2>
            <ul className="mt-2 list-disc space-y-2 pr-5">
              <LI>איננו מוכרים או משכירים את נתוניך לצדדים שלישיים.</LI>
              <LI>איננו אוספים סיסמאות, פרטי התחברות לפייסבוק, הודעות פרטיות או היסטוריית גלישה מחוץ ל-facebook.com.</LI>
              <LI>איננו מבצעים פרסום אוטומטי ואיננו פועלים בשם המשתמש ללא אישורו.</LI>
              <LI>איננו משתמשים בנתונים לצרכי פרסום ממומן (ads) או לבניית פרופיל שיווקי.</LI>
            </ul>

            <H2>נימוק ההרשאות</H2>
            <ul className="mt-2 list-disc space-y-2 pr-5">
              <LI><strong>storage</strong> — שמירה מקומית של מזהה השיוך והגדרות התוסף.</LI>
              <LI><strong>alarms</strong> — תזמון בדיקות חיבור/פעימת-לב תקופתיות.</LI>
              <LI><strong>גישה ל-https://*.facebook.com/*</strong> — הצגת התוכן המוכן וסיוע בפרסום ידני בדפי פייסבוק.</LI>
            </ul>

            <H2>שיתוף נתונים</H2>
            <P>
              איננו משתפים את נתוניך עם צדדים שלישיים, למעט ספקי תשתית (אירוח וב-סיס נתונים) הפועלים בשמנו אך ורק לצורך
              הפעלת השירות, ובכפוף למחויבויות סודיות ואבטחה. נתוני התוסף משויכים אך ורק לחשבון/הארגון שלך ב-ZONO.
            </P>

            <H2>אחסון ושמירת נתונים</H2>
            <P>
              נתונים מקומיים נשמרים במכשירך עד להסרת התוסף. רשומת החיבור בצד השרת נשמרת כל עוד התוסף מחובר, ונמחקת בעת ניתוק
              התוסף או לפי בקשתך. מזהי שיוך/סודות נשמרים בצד השרת בצורה מוצפנת/מגובבת (hashed).
            </P>

            <H2>אבטחה</H2>
            <P>
              כל התקשורת מבוצעת באמצעות חיבור מוצפן (HTTPS). איננו חושפים מפתחות או אסימונים בממשק, ומיישמים בקרות גישה
              והרשאות בצד השרת.
            </P>

            <H2>זכויותיך ושליטה</H2>
            <ul className="mt-2 list-disc space-y-2 pr-5">
              <LI>ניתן לנתק את התוסף מחשבון ה-ZONO שלך בכל עת.</LI>
              <LI>הסרת התוסף מהדפדפן מוחקת את הנתונים המקומיים.</LI>
              <LI>ניתן לבקש מחיקת נתונים בפנייה לכתובת התמיכה למטה.</LI>
            </ul>

            <H2>קטינים</H2>
            <P>השירות מיועד למשתמשים מקצועיים (סוכני נדל&quot;ן) ואינו מכוון לילדים מתחת לגיל 16.</P>

            <H2>שינויים במדיניות</H2>
            <P>נעדכן מדיניות זו במידת הצורך ונפרסם את מועד העדכון בראש העמוד.</P>

            <H2>יצירת קשר</H2>
            <P>
              לשאלות או בקשות בנוגע לפרטיות ניתן לפנות לכתובת:{" "}
              <a href={`mailto:${CONTACT_EMAIL}`} className="text-brand-strong font-bold underline" dir="ltr">{CONTACT_EMAIL}</a>.
            </P>
          </section>

          <hr className="border-line my-10" />

          {/* ───────────────────────── English ───────────────────────── */}
          <section dir="ltr">
            <h1 className="text-ink text-2xl font-black">Privacy Policy — ZONO Facebook Assistant</h1>
            <p className="text-muted mt-2 text-sm">Effective {EFFECTIVE_DATE_EN} · Extension ID: <span className="font-mono">{EXTENSION_ID}</span></p>

            <H2>Who we are</H2>
            <P>
              The «ZONO Facebook Assistant» browser extension (the “Extension”) is operated by ZONO, an AI-powered
              operating system for real-estate agents. The Extension is a helper that assists the user in manually
              publishing marketing content prepared in advance inside ZONO to Facebook Groups and Marketplace. This
              policy explains what data the Extension accesses, how it is used, and how we protect your privacy.
            </P>

            <H2>What the Extension does</H2>
            <P>
              The Extension displays post content that you prepared in your ZONO account and helps you place/show it while
              you browse Facebook so that you publish it yourself. <strong>There is no auto-posting</strong>, and the
              Extension <strong>never accesses your Facebook password or login credentials</strong>. Publishing is always
              performed manually by the user and with the user’s confirmation.
            </P>

            <H2>Data the Extension accesses</H2>
            <ul className="mt-2 list-disc space-y-2 pl-5">
              <LI>
                <strong>Facebook page context (facebook.com):</strong> the Extension runs on facebook.com pages to show
                the prepared content in the right context, to assist manual publishing, and to detect whether an active
                Facebook session exists. It does <strong>not</strong> collect passwords, login credentials, private
                messages, friend lists, or personal profile data.
              </LI>
              <LI>
                <strong>Local device storage (Chrome storage):</strong> a pairing identifier linking the Extension to your
                ZONO account, plus Extension settings — stored locally in your browser.
              </LI>
              <LI>
                <strong>Connection & status data:</strong> the Extension sends ZONO minimal operational data — Extension
                status, version, and a “last seen” heartbeat — associated with your ZONO account/organization, to maintain
                the connection and display its health.
              </LI>
              <LI>
                <strong>The post content itself</strong> is created by you inside ZONO and delivered to the Extension for
                display — it is not collected from Facebook.
              </LI>
            </ul>

            <H2>How we use the data</H2>
            <ul className="mt-2 list-disc space-y-2 pl-5">
              <LI>To provide the publishing-assistant functionality (show prepared content and help place it for manual publishing).</LI>
              <LI>To maintain the connection between the Extension and your ZONO account and show connection health.</LI>
              <LI>For support, troubleshooting, and reliability of the service.</LI>
            </ul>

            <H2>What we do not do</H2>
            <ul className="mt-2 list-disc space-y-2 pl-5">
              <LI>We do not sell or rent your data to third parties.</LI>
              <LI>We do not collect passwords, Facebook login details, private messages, or browsing history outside facebook.com.</LI>
              <LI>We do not auto-post or act on your behalf without your confirmation.</LI>
              <LI>We do not use data for advertising or marketing-profile building.</LI>
            </ul>

            <H2>Permissions justification</H2>
            <ul className="mt-2 list-disc space-y-2 pl-5">
              <LI><strong>storage</strong> — store the pairing identifier and settings locally.</LI>
              <LI><strong>alarms</strong> — schedule periodic connection/heartbeat checks.</LI>
              <LI><strong>host access to https://*.facebook.com/*</strong> — show prepared content and assist manual publishing on Facebook pages.</LI>
            </ul>

            <H2>Data sharing</H2>
            <P>
              We do not share your data with third parties except infrastructure processors (hosting and database) acting
              on our behalf solely to operate the service, under confidentiality and security obligations. Extension data
              is associated only with your own ZONO account/organization.
            </P>

            <H2>Storage & retention</H2>
            <P>
              Local data remains on your device until you remove the Extension. The server-side connection record is
              retained while the Extension is connected and is deleted when you disconnect the Extension or upon request.
              Pairing identifiers/secrets are stored server-side in encrypted/hashed form.
            </P>

            <H2>Security</H2>
            <P>All communication uses encrypted connections (HTTPS). We never expose keys or tokens in the interface and enforce server-side access controls.</P>

            <H2>Your rights & control</H2>
            <ul className="mt-2 list-disc space-y-2 pl-5">
              <LI>You can disconnect the Extension from your ZONO account at any time.</LI>
              <LI>Removing the Extension from your browser deletes local data.</LI>
              <LI>You can request data deletion by contacting the support address below.</LI>
            </ul>

            <H2>Children</H2>
            <P>The service is intended for professional users (real-estate agents) and is not directed to children under 16.</P>

            <H2>Changes to this policy</H2>
            <P>We will update this policy as needed and post the update date at the top of this page.</P>

            <H2>Contact</H2>
            <P>
              For privacy questions or requests, contact:{" "}
              <a href={`mailto:${CONTACT_EMAIL}`} className="text-brand-strong font-bold underline">{CONTACT_EMAIL}</a>.
            </P>
          </section>

          <p className="text-muted mt-10 text-center text-xs">© {new Date().getFullYear()} ZONO · All rights reserved.</p>
        </div>
      </div>
    </main>
  );
}
