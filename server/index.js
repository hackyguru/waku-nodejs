import { createLightNode, waitForRemotePeer, Protocols, createEncoder, createDecoder } from "@waku/sdk";

// Separate topics for client and server messages
const CLIENT_TOPIC = "/waku-chat/1/client-message/proto";
const SERVER_TOPIC = "/waku-chat/1/server-response/proto";

async function startServer() {
  console.log("Starting Waku Server...");

  try {
    // Initialize the Waku node
    const waku = await createLightNode({
      networkConfig: {clusterId: 1, shards: [0]},
      defaultBootstrap: true,
      pingKeepAlive: 60,
      numPeersToUse: 3,
    });

    await waku.start();
    console.log("Waku node started, waiting for peers...");
    
    await waitForRemotePeer(waku, [Protocols.LightPush, Protocols.Filter]);
    console.log("Connected to peers!");

    if (!waku.filter) {
      throw new Error("Filter protocol not available!");
    }

    // Create encoder for server responses and decoder for client messages
    const encoder = createEncoder({ contentTopic: SERVER_TOPIC });
    const decoder = createDecoder(CLIENT_TOPIC);

    // Subscribe to client messages
    await waku.filter.subscribe([decoder], async (wakuMessage) => {
        console.log("Raw message received:", wakuMessage);
        console.log("Decoder topic:", CLIENT_TOPIC);
        
        if (!wakuMessage.payload) {
            console.log("No payload in message");
            return;
        }
        
        try {
            const message = new TextDecoder().decode(wakuMessage.payload);
            console.log("\nReceived message from client:", message);

            // Create response
            const response = `Server received: "${message}" at ${new Date().toLocaleTimeString()}`;
            console.log("Sending response:", response);
            console.log("Using encoder with topic:", SERVER_TOPIC);

            // Send response using lightPush
            await waku.lightPush.send(encoder, {
                payload: new TextEncoder().encode(response)
            });
            console.log("Response sent successfully");
        } catch (error) {
            console.error("Error processing message:", error);
            console.error(error.stack);
        }
    });

    console.log("Sending test message to verify connection...");
    await waku.lightPush.send(encoder, {
        payload: new TextEncoder().encode("Server is online")
    });

    console.log("\nServer is ready and listening for messages!");
    console.log("Listening on topic:", CLIENT_TOPIC);
    console.log("Responding on topic:", SERVER_TOPIC);

    // Keep the server running
    process.on('SIGINT', async () => {
      console.log("Shutting down server...");
      await waku.stop();
      process.exit(0);
    });

  } catch (error) {
    console.error("Server failed to start:", error);
    process.exit(1);
  }
}

startServer().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
