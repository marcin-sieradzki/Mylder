// The GitHub Pages demo (ADR 0013): `npm run demo` builds it into out/. The pages are Next.js's
// static export under the repository's path, the simulated tracker is one worker script beside
// them, and `index.html` at the root sends a visit to the language its browser asks for, as the
// proxy does on the server.
import { execFileSync } from 'node:child_process'
import { rm, writeFile } from 'node:fs/promises'
import { defaultLang, langs } from '../../src/i18n/lang.ts'

/** The path the demo is served under: the repository's, on its owner's Pages site. */
const BASE_PATH = process.env.MYLDER_DEMO_BASE_PATH ?? '/mylder'

const run = (command: string, args: string[], env: Record<string, string> = {}) =>
  execFileSync(command, args, { stdio: 'inherit', env: { ...process.env, ...env } })

await rm('out', { recursive: true, force: true })
run('npx', ['next', 'build'], { MYLDER_DEMO_BASE_PATH: BASE_PATH })
run('npx', ['vite', 'build', '--config', 'scripts/demo/worker.config.ts'])

// The first of Mylder's languages the browser lists, or the default; without scripts, the default.
const redirect = `const langs = ${JSON.stringify(langs)}
const asked = navigator.languages.map((tag) => tag.split('-')[0].toLowerCase())
const lang = asked.find((each) => langs.includes(each)) ?? ${JSON.stringify(defaultLang)}
location.replace(${JSON.stringify(BASE_PATH)} + '/' + lang + location.search + location.hash)`

await writeFile(
  'out/index.html',
  `<!doctype html>
<html lang="${defaultLang}">
<head>
<meta charset="utf-8">
<title>Mylder</title>
<noscript><meta http-equiv="refresh" content="0; url=${BASE_PATH}/${defaultLang}"></noscript>
<script>${redirect}</script>
</head>
<body><a href="${BASE_PATH}/${defaultLang}">Mylder</a></body>
</html>
`,
)
