## Task 2, call 1
- Step 1: generated the Angular 22 workspace in /tmp/scaffold, copied angular.json, package.json(+lock), tsconfigs, .editorconfig, .prettierrc, public/, src/ into the repo; appended Angular entries to .gitignore (kept existing lines). Generator added no test target or test deps; removed the unused "test" npm script. Verified git status shows only the listed files and .gitignore; nothing under supabase/ or ralphloop/ changed. Scaffold app.html is the generator placeholder (to be replaced later).

## Task 2, call 2
- Step 2: installed the runtime and dev dependencies exactly as listed. `npx ng build` succeeds; all @angular/* packages are major 22. npm audit reports 2 vulnerabilities (1 low, 1 high), not addressed (out of scope).

## Task 2, call 3
- Step 3: ran `ng add angular-eslint` (added eslint.config.js, lint target in angular.json, devDeps). Set .prettierrc printWidth to 120 (kept singleQuote and the existing html/angular parser override). Added npm script "lint"; "build" already existed. `npx ng lint` passes with no errors.
