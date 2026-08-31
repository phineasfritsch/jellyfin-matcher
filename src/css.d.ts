/**
 * R140: a declaration for the stylesheet import.
 *
 * `app/layout.tsx` does `import './globals.css'` -- a side-effect import, which
 * is how Next.js takes a global stylesheet. Newer TypeScript refuses that
 * without a declaration and raises TS2882: "Cannot find module or type
 * declarations for side-effect import of './globals.css'".
 *
 * This project found out because its own weekly dependency check opened a pull
 * request bumping TypeScript, and CI failed on this line. That is the check
 * working: the alternative was a household discovering it, months later, when
 * something else forced the upgrade.
 *
 * `next-env.d.ts` does not cover this. It is generated, it is gitignored in
 * many setups, and Next's own guidance is not to edit it -- so the declaration
 * lives here, where it is committed and can carry a reason.
 */
declare module '*.css';
