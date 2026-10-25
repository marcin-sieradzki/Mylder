# Where to host an always-on feed service cheaply

Research for issue #8. Prices and limits as of 2026-10-25.

## Short answer

Split it. Host the Next.js app on Vercel Hobby. Host the feed service as one always-on container on
Fly.io in Stockholm (`arn`).

- Vercel Hobby is free and allows personal, non-commercial projects. Mylder fits that.
- Vercel Functions cannot be the feed service. On Hobby they stop after 300 s, hold no shared memory,
  and cron runs once a day.
- Fly.io runs a normal Node process that never sleeps when `auto_stop_machines = "off"`. A
  shared-cpu-1x machine with 1 GB costs about $7 a month. Egress in Europe is $0.02/GB. A static
  egress IP is $3.60 a month, if the data portal ever asks for one.
- Expected total: about $10 a month, or about $13 with a static egress IP.

The runner-up is a Hetzner CX23 in Helsinki: 2 vCPU, 4 GB RAM and 20 TB of traffic for about €6
a month, with a fixed IPv4 address. It is the cheapest and roomiest option. The cost is our own
time: OS updates, TLS, restarts and monitoring are ours to run. Coolify or plain Docker Compose
on the box can also serve the Next.js app.

Points for the grilling:

- Is 1 GB enough? The timetable is a guess of a few hundred MB, plus about 100 MB for Node. Measure
  it before choosing a size. Fly bills $6 per extra GB a month. Hetzner gives 4 GB from the start.
- Does the data portal allow-list IPs? We could not confirm it. SIRI often works by
  subscription, where the producer POSTs to our public endpoint. If Dataudveksleren works that way,
  the service needs a stable public HTTPS URL that never sleeps. Both picks give one.
- Egress could cost more than compute on some hosts. See the estimate below.

## Assumptions

- One Node process, 1 GB RAM, light CPU (parsing XML and sending diffs).
- Tens to a few hundred browsers hold one SSE connection each.
- Egress estimate: a snapshot of about 200 KB on connect, then about 5 KB of gzipped diffs every
  10 s. That is about 1.8 MB an hour per viewer. With 100 viewers on average around the clock, it
  is about 130 GB a month. This is a rough guess, not a measurement.
- Monthly costs below use 1 GB RAM and 130 GB egress. They exclude VAT.

## Comparison

| Host                                     | Monthly cost at this scale                                                                                                              | Sleeps or cold-starts                                                                      | Long-lived SSE / WebSocket                                                                                 | Stable outbound IP                                                                 | Near Copenhagen                                                | Memory for the timetable                              | Next.js alongside                                           |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | -------------------------------------------------------------- | ----------------------------------------------------- | ----------------------------------------------------------- |
| **Vercel Functions**                     | Hobby $0, Pro $20 with $20 usage credit                                                                                                 | Scales to zero; no process stays up                                                        | Cut at max duration: 300 s on Hobby, 800 s on Pro (1800 s in beta). Clients must reconnect                 | Static IPs: Pro and up, $100/project/month                                         | `arn1` Stockholm, `fra1` Frankfurt                             | Per instance, not shared between instances            | Native. Best place for the Next.js app                      |
| **Vercel Sandbox**                       | Hobby includes 5 CPU-h and 420 GB-h a month                                                                                             | Session cap: 45 min on Hobby, 24 h on Pro                                                  | Not built as a public server                                                                               | Not found                                                                          | Not checked                                                    | Fine                                                  | Same account                                                |
| **Fly.io**                               | About $7 machine + $2.60 egress = **about $10**. +$3.60 for a static egress IP                                                          | Never, with `auto_stop_machines = "off"`                                                   | No documented hard cap. The proxy sends a WebSocket close frame before it stops a machine                  | Static egress IP $0.005/h (about $3.60/month). Dedicated IPv4 for inbound $2/month | `arn` Stockholm, `ams` Amsterdam, `fra` Frankfurt              | 1 GB about $6.70 to $7; each extra GB $6/month        | Second Fly app, or keep Vercel                              |
| **Railway**                              | Hobby $5 includes $5 usage. 1 GB RAM $10 + CPU about $2 + egress $6.50 = **about $18.50**                                               | Never, unless "serverless" sleep is on (sleeps after 10 min with no outbound packets)      | HTTP (SSE) capped at 15 min, closed after 5 min idle. WebSockets have no cap. 10,000 connections           | Pro plan only. Reported missing on Metal regions (forum, unconfirmed)              | EU West, Amsterdam                                             | Up to 48 GB per service on Hobby                      | Second service in the same project                          |
| **Render**                               | Starter 512 MB $7 is too small. Standard 2 GB $25 + bandwidth (5 GB free, then $0.15/GB) = **about $44**                                | Paid: never. Free: sleeps after 15 min idle, about 1 min to wake                           | WebSockets: no fixed timeout, closed on deploy. HTTP requests up to 100 min (SSE rule not stated)          | Shared regional ranges free. Dedicated set $100/month, Pro ($25) and up            | Frankfurt                                                      | 512 MB (Starter), 2 GB (Standard)                     | Second web service                                          |
| **Cloudflare Workers + Durable Objects** | Workers Paid $5 minimum                                                                                                                 | Isolates are evicted; WebSocket hibernation keeps clients connected                        | Durable Objects can hold WebSockets and hibernate between messages                                         | No. Workers egress IPs are not published; dedicated egress is Enterprise           | Global edge; no region pick                                    | **128 MB per isolate. Too small for the timetable**   | Next.js via the OpenNext adapter (not re-checked)           |
| **Cloudflare Containers**                | $5 + basic (1/4 vCPU, 1 GiB) about $7 = **about $12**. standard-1 (4 GiB) about $33                                                     | Sleeps after `sleepAfter` (default 10 min). Unset, runs until stopped or the host restarts | Reached through a Worker / Durable Object in front                                                         | Not found for Containers                                                           | Constraint `regions: WEUR` or `jurisdiction: eu`; no city pick | 256 MiB to 12 GiB                                     | Same account, via Workers                                   |
| **Hetzner Cloud VPS**                    | CX23 (2 vCPU, 4 GB) €5.49 + IPv4 about €0.50 = **about €6**. 20 TB traffic included                                                     | Never                                                                                      | Whatever our own Node and reverse proxy allow                                                              | Yes, the server's primary IPv4                                                     | Helsinki (`hel1`), Falkenstein, Nuremberg                      | 4 GB on CX23                                          | Same box with Coolify (free, needs 2 GB+) or Docker Compose |
| **Google Cloud Run (min instances = 1)** | Instance-based billing, 1 vCPU + 1 GiB: about $47 after the free tier, + egress, + NAT and IP about $5 = **$60+**                       | Never with min instances and instance-based billing                                        | Request timeout up to 60 min, then the client must reconnect. Up to 1,000 concurrent requests per instance | Via Direct VPC egress + Cloud NAT + static IP ($0.005/h IP, plus NAT fees)         | `europe-north1` Finland, `europe-north2` Stockholm             | Fine; instance-based needs 1 vCPU and 512 MiB minimum | Second Cloud Run service                                    |
| **Koyeb**                                | eco-small (0.5 vCPU, 1 GB) $5.36. New users may now need Pro ($29 with $10 compute) (unconfirmed)                                       | Paid: never. Free instance sleeps after 1 h idle                                           | HTTP timeout 100 s. WebSockets up to 12 h with keep-alives                                                 | No static outbound IPs                                                             | Frankfurt                                                      | 1 GB on eco-small                                     | Second service                                              |
| **Northflank**                           | Free Sandbox: always on, up to $20/month of resources. Paid pay-as-you-go 0.2 vCPU + 1 GB about $8.40 + egress $0.06/GB = **about $16** | Never; the Sandbox states "always on, no sleeping"                                         | Not found in the docs                                                                                      | Egress gateway $15/month                                                           | Frankfurt, Netherlands, Zurich                                 | Sandbox up to 1 vCPU and 1 GB (from a product page)   | Second service (Sandbox allows 2)                           |

### Free tiers and their catches

- **Vercel Hobby:** free for personal, non-commercial use. Usage caps cannot be raised; over the cap
  you wait out the 30 days. Includes 100 GB of Fast Data Transfer. Cron runs once a day.
- **Fly.io:** no free tier for new organisations. The trial lasts 2 machine-hours or 7 days.
- **Railway:** a one-time $5 trial for 30 days, then $1 of credit a month. That does not cover an
  always-on 1 GB service (about $10 of RAM alone).
- **Render:** free web services sleep after 15 minutes and take about a minute to wake. Render's
  status page said on 2026-10-14 that deploys for free services were paused.
- **Cloudflare:** the Workers free plan exists, but the 128 MB isolate limit rules out the
  timetable. Containers bill on Workers Paid.
- **Google Cloud Run:** the free tier is a spending discount, worth about $5 a month against an
  always-on instance.
- **Koyeb:** one free instance (0.1 vCPU, 512 MB) in Frankfurt or Washington. It sleeps after an
  hour without traffic. Koyeb agreed to join Mistral AI in February 2026 and says it will focus on
  Pro customers and above.
- **Northflank:** the free Sandbox needs no card and does not sleep. Its compute is listed as
  "limited". This is the only free tier here that could run the service around the clock. Its exact
  memory cap and WebSocket rules need a test.
- **Hetzner:** no free tier.

### Notes per host

- **Vercel.** Fluid compute lets many requests share one instance, but nothing keeps one process
  alive to read a continuous feed. Vercel's own realtime guide says a function cannot hold a
  WebSocket open forever. Use Vercel for the Next.js app only.
- **Fly.io.** A Machine is a small VM. With autostop off, it runs until we stop it. A 1 GB RAM
  price rise to $6/GB took effect around 2026-10-01 (secondary source). The official page lists
  $6.70 for 1 GB in Ashburn and $7.73 in Frankfurt; Stockholm is about $6.95 (secondary source).
- **Railway.** The 15-minute HTTP cap means SSE clients reconnect every 15 minutes. `EventSource`
  does this by itself. WebSockets avoid the cap.
- **Render.** The 5 GB bandwidth allowance on Hobby makes SSE fan-out the biggest cost line.
- **Cloudflare.** A workable shape is a Container holding the timetable, with a Durable Object
  fanning out to browsers over hibernating WebSockets. It has the most moving parts. Containers
  restart on rollouts and host restarts (SIGTERM, then up to 15 min to exit).
- **Hetzner.** Prices rose on 2026-04-01 and again on 2026-06-15. A third-party tracker reported
  CX23 as not orderable on 2026-10-07 (unconfirmed). If so, the next shared plan costs more.
- **Google Cloud Run.** Sub-1 vCPU only works with request-based billing and concurrency 1. Outside
  requests the CPU is throttled, so the background feed reader needs instance-based billing at
  1 vCPU. That makes it the most expensive option here.
- **Koyeb.** The 100-second HTTP timeout may cut SSE streams; we did not confirm whether a steady
  stream resets it.

## How this was checked

Direct page fetches failed in this environment, so the provider pages were read through search
excerpts of those pages. Where sources disagreed, the provider's own page wins and the gap is noted.
Re-check the chosen host's pricing page before signing up.

Not confirmed:

- Whether Rejseplanen or Dataudveksleren allow-list client IPs, and whether SIRI-ET is pushed to us
  or pulled by us.
- The current Hetzner primary IPv4 price (the only page found is old).
- Cloud Run internet egress price from the Nordic regions.
- Koyeb's plans for new users after the Mistral AI deal.
- Northflank Sandbox memory cap and WebSocket limits.
- Railway Pro plan price, and static IPs on the EU West Metal region.

## Sources

Vercel

- Functions limits: https://vercel.com/docs/functions/limitations
- Hobby plan: https://vercel.com/docs/plans/hobby
- Pricing: https://vercel.com/pricing
- Fair use: https://vercel.com/docs/limits/fair-use-guidelines
- Realtime on Vercel: https://vercel.com/kb/guide/publish-and-subscribe-to-realtime-data-on-vercel
- Static IPs: https://vercel.com/docs/networking/static-ips
- Regions: https://vercel.com/docs/regions
- Stockholm pricing: https://vercel.com/docs/pricing/regional-pricing/arn1
- Cron limits: https://vercel.com/docs/cron-jobs/usage-and-pricing
- Sandbox pricing: https://vercel.com/docs/sandbox/pricing

Fly.io

- Pricing: https://fly.io/docs/about/pricing/
- Free trial: https://fly.io/docs/about/free-trial/
- Discontinued plans: https://fly.io/docs/about/discontinued-plans/
- Regions: https://fly.io/docs/reference/regions
- Long-running tasks (autostop off): https://fly.io/docs/blueprints/long-running-tasks/
- WebSocket close on stop: https://fly.io/changelog/websocket-graceful-shutdown-autostop/
- RAM price change (secondary):
  https://dev.to/pavel-hostim/flyio-pricing-2026-what-changed-on-1-october-and-what-it-costs-in-europe-1pjl

Railway

- Plans: https://docs.railway.com/pricing/plans
- Pricing: https://railway.com/pricing
- Free trial: https://docs.railway.com/pricing/free-trial
- Network limits: https://docs.railway.com/networking/public-networking/specs-and-limits
- SSE vs WebSockets: https://docs.railway.com/guides/sse-vs-websockets
- Static outbound IPs: https://docs.railway.com/networking/static-outbound-ips
- Serverless sleep: https://docs.railway.com/deployments/serverless
- Regions: https://docs.railway.com/deployments/regions

Render

- Pricing: https://render.com/pricing
- Compute plans: https://render.com/docs/compute-plans
- WebSockets: https://render.com/docs/websocket
- Outbound bandwidth: https://render.com/docs/outbound-bandwidth
- Pricing changes 2026: https://render.com/blog/better-pricing-for-fast-growing-teams
- Outbound IPs: https://render.com/docs/outbound-ip-addresses
- Dedicated IPs: https://render.com/docs/dedicated-ips
- Regions: https://render.com/docs/regions
- Status: https://status.render.com/

Cloudflare

- Workers limits: https://developers.cloudflare.com/workers/platform/limits/
- Workers pricing: https://developers.cloudflare.com/workers/platform/pricing/
- Durable Objects pricing: https://developers.cloudflare.com/durable-objects/platform/pricing/
- Durable Objects WebSockets: https://developers.cloudflare.com/durable-objects/best-practices/websockets/
- Containers pricing: https://developers.cloudflare.com/containers/pricing/
- Containers limits: https://developers.cloudflare.com/containers/platform/limits/
- Containers lifecycle: https://developers.cloudflare.com/containers/platform-details/architecture/
- Containers placement: https://developers.cloudflare.com/containers/concepts/placement/
- Workers egress IPs (community):
  https://community.cloudflare.com/t/what-are-cf-worker-egress-ip-ranges/911150

Hetzner and Coolify

- Price adjustment 15 June 2026:
  https://docs.hetzner.com/general/infrastructure-and-availability/price-adjustment/
- Statement on 1 April 2026 change: https://www.hetzner.com/pressroom/statement-price-adjustment/
- Cost-optimized cloud plans: https://www.hetzner.com/cloud/cost-optimized/
- IP pricing (old page): https://docs.hetzner.com/general/infrastructure-and-availability/ipv4-pricing/
- Orderability tracker (secondary): https://agentdeals.dev/hetzner-pricing-2026
- Coolify install and requirements: https://coolify.io/docs/start-with-self-hosted

Google Cloud Run

- Pricing: https://cloud.google.com/run/pricing
- Billing settings: https://docs.cloud.google.com/run/docs/configuring/billing-settings
- CPU limits: https://docs.cloud.google.com/run/docs/configuring/services/cpu
- WebSockets: https://docs.cloud.google.com/run/docs/triggering/websockets
- Quotas: https://docs.cloud.google.com/run/quotas
- Static outbound IP: https://docs.cloud.google.com/run/docs/configuring/static-outbound-ip
- Cloud NAT pricing: https://cloud.google.com/nat/pricing
- Locations: https://docs.cloud.google.com/run/docs/locations

Koyeb

- Pricing: https://www.koyeb.com/pricing
- Pricing FAQ: https://www.koyeb.com/docs/faqs/pricing
- Instances: https://www.koyeb.com/docs/reference/instances
- Edge network limits: https://www.koyeb.com/docs/reference/edge-network
- General FAQ (no static IPs): https://www.koyeb.com/docs/faqs/general
- Mistral AI deal (secondary): https://www.frenchtechjournal.com/breaking-down-mistral-ais-bargain-acquihire-of-koyeb/

Northflank

- Pricing: https://northflank.com/pricing
- Billing docs: https://northflank.com/docs/v1/application/billing/pricing-on-northflank
- Egress IPs: https://northflank.com/docs/v1/application/network/configure-egress-ips
- Managed cloud regions: https://northflank.com/cloud/northflank

Rejseplanen data access

- About SIRI-ET: https://labs.rejseplanen.dk/hc/en-us/articles/25407687677597-Om-SIRI-ET
- Data overview: https://labs.rejseplanen.dk/hc/en-us/articles/24750139021341-Oversigt-over-udstillede-data
- SIRI subscription model (Entur, for comparison):
  https://github.com/entur/anshar/blob/master/Subscription-lifecycle.md
