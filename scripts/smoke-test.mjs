import http from "node:http";

async function runSmokeTests() {
  console.log("=== FlashDrop Live Smoke Tests ===");
  
  // 1. Health check
  console.log("\n[1/4] Testing GET /health...");
  const healthRes = await fetch("http://127.0.0.1:8787/health");
  if (!healthRes.ok) {
    throw new Error(`Health check failed with status ${healthRes.status}`);
  }
  const healthData = await healthRes.json();
  console.log("  Health response:", JSON.stringify(healthData));
  if (!healthData.ok || healthData.service !== "flashdrop-signaling") {
    throw new Error("Health check returned unexpected payload");
  }
  console.log("  ✓ Health check passed!");

  // 2. WebSocket 2-peer connection & signaling relay
  console.log("\n[2/4] Testing WebSocket 2-peer connection and signaling...");
  const roomId = "smoke-" + Date.now();
  const wsUrl = `ws://127.0.0.1:8787/ws/${roomId}`;

  // Helper to create WebSocket promise
  const connectWs = (label) => {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(wsUrl);
      const messages = [];
      ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        console.log(`  [${label}] Received:`, data.type);
        messages.push(data);
      };
      ws.onopen = () => {
        console.log(`  [${label}] Connected`);
        resolve({ ws, messages });
      };
      ws.onerror = (err) => reject(err);
    });
  };

  // Host connects
  const { ws: hostWs, messages: hostMessages } = await connectWs("Host (Peer 1)");
  await new Promise((r) => setTimeout(r, 200));

  // Host should receive ROOM_JOINED with role host
  if (hostMessages[0]?.type !== "ROOM_JOINED" || hostMessages[0]?.role !== "host") {
    throw new Error(`Host expected ROOM_JOINED (host), got: ${JSON.stringify(hostMessages[0])}`);
  }
  console.log("  ✓ Host received ROOM_JOINED with role host");

  // Guest connects
  const { ws: guestWs, messages: guestMessages } = await connectWs("Guest (Peer 2)");
  await new Promise((r) => setTimeout(r, 200));

  // Guest should receive ROOM_JOINED with role guest
  if (guestMessages[0]?.type !== "ROOM_JOINED" || guestMessages[0]?.role !== "guest") {
    throw new Error(`Guest expected ROOM_JOINED (guest), got: ${JSON.stringify(guestMessages[0])}`);
  }
  console.log("  ✓ Guest received ROOM_JOINED with role guest");

  // Host should receive PEER_JOINED
  const peerJoinedMsg = hostMessages.find((m) => m.type === "PEER_JOINED");
  if (!peerJoinedMsg) {
    throw new Error("Host did not receive PEER_JOINED notification");
  }
  console.log("  ✓ Host received PEER_JOINED notification");

  // 3. Test signaling message forwarding
  console.log("\n[3/4] Testing signaling relay between Host and Guest...");
  hostWs.send(JSON.stringify({ type: "SIGNAL_OFFER", sdp: "dummy-sdp-offer" }));
  await new Promise((r) => setTimeout(r, 200));

  const offerReceived = guestMessages.find((m) => m.type === "SIGNAL_OFFER");
  if (!offerReceived || offerReceived.sdp !== "dummy-sdp-offer") {
    throw new Error("Guest did not receive SIGNAL_OFFER from Host");
  }
  console.log("  ✓ Guest received forwarded SIGNAL_OFFER");

  // 4. Test 3rd peer rejection with code 4003 ('Room Full')
  console.log("\n[4/4] Testing 3rd peer rejection (strict 2-peer room enforcement)...");
  const thirdPeerResult = await new Promise((resolve) => {
    const ws3 = new WebSocket(wsUrl);
    ws3.onclose = (event) => {
      console.log(`  [Peer 3] Socket closed with code: ${event.code}, reason: '${event.reason}'`);
      resolve(event);
    };
    ws3.onerror = () => {};
  });

  if (thirdPeerResult.code !== 4003) {
    throw new Error(`Expected close code 4003 for 3rd peer, got ${thirdPeerResult.code}`);
  }
  console.log("  ✓ 3rd peer rejected with code 4003 ('Room Full')");

  // Clean up sockets
  hostWs.close();
  guestWs.close();

  console.log("\n=== ALL END-TO-END SMOKE TESTS PASSED CLEANLY! ===");
}

runSmokeTests().catch((err) => {
  console.error("SMOKE TEST FAILED:", err);
  process.exit(1);
});
