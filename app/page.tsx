// Root route — app/page.tsx takes precedence over (public)/page.tsx in Next.js App Router.
// Re-export the public homepage so the landing page renders at /.
export { default } from './(public)/page'
