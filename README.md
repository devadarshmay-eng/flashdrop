<p align="center">
  <img src="./docs/banner.png" alt="FlashDrop — Ephemeral QR-Initiated P2P File Transfer" width="100%" />
</p>

<p align="center">
  <strong>Instant browser-to-phone file transfer over WebRTC.</strong><br />
  No accounts. No cloud storage. No persistent links. Every room dissolves when the tab closes.
</p>

<p align="center">
  <a href="#architecture"><img src="https://img.shields.io/badge/Transport-WebRTC_DataChannel-FF4D00?style=flat-square&labelColor=0A0A0B" alt="WebRTC DataChannel" /></a>
  <a href="#architecture"><img src="https://img.shields.io/badge/Signaling-Cloudflare_Durable_Objects-141416?style=flat-square&labelColor=0A0A0B" alt="Cloudflare Durable Objects" /></a>
  <a href="#security-model"><img src="https://img.shields.io/badge/Encryption-DTLS--SRTP_E2E-10B981?style=flat-square&labelColor=0A0A0B" alt="DTLS-SRTP E2E" /></a>
  <a href="#security-model"><img src="https://img.shields.io/badge/Persistence-Zero_(RAM_Only)-141416?style=flat-square&labelColor=0A0A0B" alt="Zero Persistence" /></a>
</p>

---

### How It Works

1. **Open on Desktop** — Generates a cryptographic room token (`crypto.randomUUID()`) and renders a high-contrast QR code bound to a short-lived Durable Object room.
2. **Scan with Phone** — Your phone camera opens `/s/<sessionId>`, exchanges SDP/ICE candidates over WebSocket, and upgrades to a direct peer-to-peer WebRTC DataChannel.
3. **Stream Directly** — Files transfer in **16 KB binary chunks** with SCTP backpressure control directly between devices.
4. **Dissolve** — Closing either browser tab, clicking **End Session**, or hitting the **10-minute** TTL wipes the Durable Object in memory and revokes all browser `ObjectURL` buffers.

<p align="center">
  <img src="./docs/architecture.png" alt="Desktop Host to Mobile Peer DTLS-SRTP Tunnel with Zero Cloud Storage" width="100%" />
</p>

---

### Architecture

FlashDrop separates **connection discovery** from **payload transport** so file bytes never touch a server:

| Component | Stack | Responsibility |
| :--- | :--- | :--- |
| **Frontend Client** | Vite, React, TypeScript, Tailwind | QR generation, WebRTC peer lifecycle, 16 KB chunker/reassembler, Wake Lock management. |
| **Signaling Relay** | Cloudflare Workers + Durable Objects | WebSocket Hibernation API relay for SDP offers/answers and ICE candidates only (32 KB payload cap). |
| **Data Transport** | WebRTC `RTCDataChannel` (SCTP/DTLS) | Direct encrypted binary stream between desktop and mobile browsers. |
| **NAT Traversal** | Cloudflare & Google STUN | Resolves Wi-Fi-to-Wi-Fi and Wi-Fi-to-Cellular peer paths without relaying file data. |

---

### Security & Ephemerality Guarantees

- **Strict 2-Peer Room Lock:** Each Durable Object accepts exactly one `host` and one `guest`. Any third connection attempt is rejected immediately with WebSocket close code `4003`.
- **Hard 10-Minute TTL:** Every room schedules a Durable Object alarm (`storage.setAlarm`) at creation. At `T+10:00`, the server broadcasts `SESSION_EXPIRED`, terminates all sockets, and executes `storage.deleteAll()`.
- **Instant Tab-Close Teardown:** Disconnecting either peer triggers an immediate `PEER_DISCONNECTED` broadcast and destroys the room state.
- **Zero Disk / Bucket Footprint:** No D1 databases, no KV namespaces, no R2 buckets, no cookies, and no `localStorage` transfer logs.

---

### Local Development

```bash
# 1. Start the Cloudflare Worker + Durable Object signaling server
cd worker
npm install
npx wrangler dev

# 2. Start the frontend client (in a separate terminal)
cd ../web
npm install
VITE_WS_URL=ws://localhost:8787 npm run dev
```

---

### Live Deployment

- **Signaling Worker**: `https://flashdrop-signaling.wick47501.workers.dev`
- **Web App (Cloudflare Pages)**: `https://getflashdrop.pages.dev`
- **GitHub Repository**: `https://github.com/devadarshmay-eng/flashdrop`
