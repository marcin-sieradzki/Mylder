// Every port Mylder's own servers listen on, in one place, so a new server takes a free one and
// two never meet: Playwright's servers, the demo's, and the verifier's. The table in
// docs/testing-seams.md lists them, and ports.test.ts checks that they stay apart and that the
// table, the verifier's launch script and the factory's skill agree with this file.

/** Playwright's servers on the production build (playwright.config.ts). */
export const E2E_PORTS = {
  /** The weekday recording, with its aircraft; the tests' base URL. */
  recording: 4173,
  /** The simulation, with the aircraft off, to prove the default source starts. */
  simulated: 4174,
  /** The weekday recording again, for the snapshot route's tests alone, which count its calls. */
  snapshot: 4176,
  /** The crowded recording, for the tests that open a stop with more trains than it lists. */
  crowded: 4177,
} as const

/** The GitHub Pages demo, served from out/ (`npm run demo:serve`, playwright.demo.config.ts). */
export const DEMO_PORT = 4175

/**
 * `verify-mylder`'s launch.sh, run by hand: its default port, and the one its skill gives a
 * second run of main beside the branch.
 */
export const VERIFY_PORTS = { branch: 4300, main: 4301 } as const

/**
 * The factory's verifier in round `round` (from 1) of a ticket, as the factory's skill gives
 * them: main and the branch on the weekday recording, and a run on another recording, the
 * branch's and then main's on the same port.
 */
export const factoryVerifierPorts = (round: number) => ({
  main: 4300 + 2 * round,
  branch: 4301 + 2 * round,
  otherRecording: 4400 + round,
})
