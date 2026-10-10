# hal-test reuse

pattern-only

The local `hal-test-main` folder is a JavaScript Turbo monorepo. Its `LICENSE` file is the GNU GPL version 3 text. The root `package.json` says `GPL-3.0`. The backend and frontend packages say `GPL-3.0-only`. The README badge and the license section say Apache License 2.0 and link that badge at `LICENSE`.

Those declarations do not agree, so no hal-test source is copied into this repo. Behavior can be described in our own words. Toolchain pieces are not imported: this repo stays on strict TypeScript and `pnpm@12.6.0`, with no Turbo.

The local folder has no `.git` commit. GitHub `main` was `52a02640c19155e76197ef4369980f6ea5adde57` on 2026-10-10. Tag `v1.0.72` was `56d3aa7e5d99660443d50e2acc8fc5f2d2a2faaa`. `apps/backend/package.json` in the local folder matched neither tree.
