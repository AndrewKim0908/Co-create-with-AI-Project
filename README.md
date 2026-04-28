# Co-Create AI — Decision Sprint Platform

A working prototype of the Co-Create AI decision sprint platform, built from the
original `Co-Create AI.html` mock-up.

**Stack:** Vite + React 18 + Tailwind CSS + React Router v6 + Framer Motion + Lucide Icons.

---

## Quickstart

> Requires **Node.js 18+** with **npm** on your `PATH`.
> Cursor's bundled Node does not include npm — install Node from [nodejs.org](https://nodejs.org) if `npm --version` doesn't work.

```bash
npm install
npm run dev
```

Then open http://localhost:5173.

### Other scripts

| Command            | Description                                    |
| ------------------ | ---------------------------------------------- |
| `npm run dev`      | Start the Vite dev server with HMR             |
| `npm run build`    | Production build to `dist/`                    |
| `npm run preview`  | Preview the production build locally           |

---

## How the prototype flows

1. `/` — **Login screen.** Pick a role (Engineer / Designer / Lead User) and click
   **Enter Decision Sprint** → routes to `/hub`.
2. `/hub` — **Project Hub (Dashboard)**. KPI cards + 6 project cards. Clicking
   any card jumps to `/workspace`.
3. `/workspace` — **Active sprint workspace** (blueprint, AI chat panel, conflict
   resolution panel). Approving _Option C_ navigates to `/consensus`.
4. `/timeline` — **Sprint history** with rejection/approval outcomes.
5. `/consensus` — **Decision record** ready to export.

Use the language switcher (top-right of header / login) to toggle EN / 한 / 中.

---

## Folder layout

```
.
├─ public/
│  ├─ assets/logo.png            # Brand logo (used by sidebar + favicon)
│  ├─ fonts/InterVariable.ttf    # Inter Variable font (loaded via @font-face)
│  └─ uploads/                   # Source-of-truth design uploads
├─ src/
│  ├─ components/                # Shared UI: Sidebar, Header, Layout, Btn …
│  ├─ pages/                     # LoginPage, HubPage, TimelinePage, WorkspacePage, ConsensusPage
│  ├─ i18n/                      # translations.js + LangContext.jsx
│  ├─ constants/colors.js        # Design-token JS object + ROLE_MAP
│  ├─ styles/tokens.css          # @font-face + CSS custom properties
│  ├─ index.css                  # Tailwind layers + global keyframes
│  ├─ App.jsx                    # React Router routes + auth state
│  └─ main.jsx                   # Vite entrypoint (LangProvider + BrowserRouter)
├─ index.html
├─ tailwind.config.js
├─ postcss.config.js
├─ vite.config.js
└─ package.json
```

---

## Design tokens

The original `colors_and_type.css` was split into two synchronized sources:

* **`tailwind.config.js`** — extends Tailwind's theme (colors, fontSize, shadows, animations).
* **`src/styles/tokens.css`** — CSS custom properties used by inline styles and
  any non-Tailwind CSS.

Components use Tailwind utilities for layout and inline styles (via the
`C` object from `@/constants/colors`) for color-rich elements. This mirrors the
original HTML's expressiveness while staying easy to refactor.
