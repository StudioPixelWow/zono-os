This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## Environment Variables

Copy `.env.example` to `.env.local` and fill in your values. See that file for the full list (Supabase, AI image provider, Google Maps).

### Google Maps

The live map and heatmap need a **browser** Maps JavaScript key. This is the only key the map components read:

```bash
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=your_google_maps_browser_key
```

The `NEXT_PUBLIC_` prefix is intentional — a Maps JS key is exposed to the client by design, and is protected by HTTP-referrer restrictions (below) rather than secrecy. Server-side geocoding uses a separate `GOOGLE_MAPS_GEOCODE_API_KEY` (falls back to the public key if unset).

If `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` is missing, the map renders a graceful Hebrew fallback (`מפה לא זמינה`) instead of crashing. In development, ZonoMap logs whether the key is present (never the value).

**Google Cloud setup checklist** (for the browser key, then **Redeploy** on Vercel so the new env value ships):

1. Enable **Maps JavaScript API**
2. Enable **Geocoding API** (used for address → lat/lng)
3. Enable **Places API** (only if Places is used)
4. On the browser key → **Application restrictions → HTTP referrers**, add:
   - `http://localhost:3000/*`
   - `https://*.vercel.app/*`
   - `https://YOUR_PRODUCTION_DOMAIN/*`
5. Ensure **billing** is active on the project.
6. **Save**, then **Redeploy** on Vercel.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
