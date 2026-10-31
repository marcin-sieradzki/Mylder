// Records Rejseplanen's SIRI-ET from Dataudveksleren for a few minutes, to measure the feed.
// Usage: npm i rhea; then
//   DU_CLIENT_ID=... DU_TENANT_ID=... DU_SECRET=... node record-siri-et.mjs <outDir> <seconds> <phase-name> <amqpUrl>...
// The secret is read from the environment only and never written anywhere.
import rhea from 'rhea'
import https from 'node:https'
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'

const [outDir, secondsArg, phase, ...urls] = process.argv.slice(2)
const { DU_CLIENT_ID, DU_TENANT_ID, DU_SECRET } = process.env
if (
  !outDir ||
  !secondsArg ||
  !phase ||
  urls.length === 0 ||
  !DU_CLIENT_ID ||
  !DU_TENANT_ID ||
  !DU_SECRET
) {
  console.error(
    'usage: DU_CLIENT_ID DU_TENANT_ID DU_SECRET node record-siri-et.mjs <outDir> <seconds> <phase> <amqpUrl>...',
  )
  process.exit(2)
}
const seconds = Number(secondsArg)
const HOST = 'sb-duvproddistribution.servicebus.windows.net'
const startedAt = Date.now()
fs.mkdirSync(outDir, { recursive: true })
const index = fs.createWriteStream(path.join(outDir, `${phase}-index.jsonl`), { flags: 'a' })

function token() {
  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: DU_CLIENT_ID,
    client_secret: DU_SECRET,
    scope: 'https://servicebus.azure.net/.default',
  }).toString()
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: 'login.microsoftonline.com',
        path: `/${DU_TENANT_ID}/oauth2/v2.0/token`,
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
      },
      (res) => {
        let data = ''
        res.on('data', (c) => (data += c))
        res.on('end', () => {
          const json = JSON.parse(data)
          if (!json.access_token)
            reject(new Error(`token failed: ${json.error} ${json.error_description ?? ''}`))
          else resolve(json.access_token)
        })
      },
    )
    req.on('error', reject)
    req.end(body)
  })
}

function bodyBuffer(message) {
  const b = message.body
  let buf
  if (Buffer.isBuffer(b)) buf = b
  else if (b && Buffer.isBuffer(b.content)) buf = b.content
  else if (typeof b === 'string') buf = Buffer.from(b)
  else if (Array.isArray(b))
    buf = Buffer.concat(
      b.map((x) =>
        Buffer.isBuffer(x) ? x : Buffer.isBuffer(x?.content) ? x.content : Buffer.from(String(x)),
      ),
    )
  else buf = Buffer.from(JSON.stringify(b ?? null))
  const gzipped = buf[0] === 0x1f && buf[1] === 0x8b
  return { raw: buf, xml: gzipped ? zlib.gunzipSync(buf) : buf, gzipped }
}

const counts = {}
async function record(url) {
  const [, , , topic, subscription] = url.split('/')
  const dataset = topic.replace('t-distribution-', '')
  const dir = path.join(outDir, phase, dataset)
  fs.mkdirSync(dir, { recursive: true })
  counts[dataset] = 0
  const jwt = await token()
  const container = rhea.create_container()
  const connection = container.connect({
    host: HOST,
    hostname: HOST,
    port: 5671,
    transport: 'tls',
    reconnect: false,
    username: DU_CLIENT_ID,
  })
  const cbs = connection.open_sender('$cbs')
  connection.open_receiver('$cbs')
  let listening = false
  connection.on('message', (ctx) => {
    const m = ctx.message
    if (m.application_properties && 'status-code' in m.application_properties) {
      const code = m.application_properties['status-code']
      if (code >= 200 && code < 300 && !listening) {
        listening = true
        console.log(`${dataset}: signed in, listening on ${topic}/subscriptions/${subscription}`)
        connection.open_receiver({
          source: `${topic}/subscriptions/${subscription}`,
          credit_window: 200,
        })
      } else if (!(code >= 200 && code < 300)) console.error(`${dataset}: sign-in failed (${code})`)
      return
    }
    const n = ++counts[dataset]
    const { raw, xml, gzipped } = bodyBuffer(m)
    const file = path.join(dir, `${String(n).padStart(6, '0')}.xml`)
    fs.writeFileSync(file, xml)
    index.write(
      JSON.stringify({
        phase,
        dataset,
        n,
        receivedAt: new Date().toISOString(),
        msSinceStart: Date.now() - startedAt,
        bytes: raw.length,
        xmlBytes: xml.length,
        gzipped,
        enqueuedTime: m.message_annotations?.['x-opt-enqueued-time'] ?? null,
        contentType: m.content_type ?? null,
        properties: m.application_properties ?? null,
      }) + '\n',
    )
  })
  connection.on('sender_open', (ctx) => {
    if (ctx.sender === cbs)
      cbs.send({
        reply_to: 'cbs',
        application_properties: {
          operation: 'put-token',
          type: 'jwt',
          name: `amqps://${HOST}/${topic}`,
        },
        message_id: 1,
        body: jwt,
      })
  })
  connection.on('connection_error', (ctx) =>
    console.error(`${dataset}: connection error`, ctx.connection.error),
  )
  connection.on('disconnected', (ctx) =>
    console.error(`${dataset}: disconnected`, ctx.error?.message ?? ''),
  )
  return connection
}

const connections = await Promise.all(urls.map(record))
const ticker = setInterval(
  () => console.log(new Date().toISOString(), JSON.stringify(counts)),
  30_000,
)
setTimeout(() => {
  clearInterval(ticker)
  for (const c of connections) c.close()
  console.log('done', JSON.stringify(counts))
  index.end(() => process.exit(0))
}, seconds * 1000)
