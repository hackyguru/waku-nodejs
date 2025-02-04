import { useState, useEffect } from "react";
import { createLightNode, waitForRemotePeer, Protocols, createEncoder, createDecoder } from "@waku/sdk";
import dynamic from 'next/dynamic';

const CLIENT_TOPIC = '/waku-chat/1/client-message/proto';
const SERVER_TOPIC = '/waku-chat/1/server-response/proto';
const RETRY_DELAY = 2000; // 2 seconds

const Home = () => {
  const [waku, setWaku] = useState(null);
  const [messages, setMessages] = useState([]);
  const [status, setStatus] = useState("disconnected");
  const [inputMessage, setInputMessage] = useState("");
  const [peerCount, setPeerCount] = useState(0);
  
  // Helper function to send messages with retry
  const sendMessageWithRetry = async (node, encoder, message, retries = 3) => {
    for (let i = 0; i < retries; i++) {
      try {
        await node.lightPush.send(encoder, {
          payload: new TextEncoder().encode(message)
        });
        console.log("Message sent successfully:", message);
        return true;
      } catch (error) {
        console.error(`Send attempt ${i + 1} failed:`, error);
        if (i < retries - 1) {
          console.log(`Retrying in ${RETRY_DELAY}ms...`);
          await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
        }
      }
    }
    return false;
  };

  useEffect(() => {
    let isSubscribed = true;
    let wakuNode = null;
    let retryTimeout = null;

    async function setupWaku() {
      try {
        setStatus("connecting");
        const node = await createLightNode({
          defaultBootstrap: true,
        });
        wakuNode = node;
        
        await node.start();
        console.log("Node started, waiting for peers...");
        
        // Wait for both protocols specifically
        await Promise.all([
          waitForRemotePeer(node, [Protocols.LightPush]),
          waitForRemotePeer(node, [Protocols.Filter])
        ]);
        console.log("Found peers with required protocols");

        // Double check protocol availability
        if (!node.filter || !node.lightPush) {
          throw new Error("Required protocols not available");
        }

        const encoder = createEncoder({ contentTopic: CLIENT_TOPIC });
        const decoder = createDecoder(SERVER_TOPIC);

        await node.filter.subscribe([decoder], (wakuMessage) => {
          if (!wakuMessage.payload || !isSubscribed) return;
          
          const message = new TextDecoder().decode(wakuMessage.payload);
          console.log("Received from server:", message);
          setMessages(prev => [...prev, { type: 'server', content: message }]);
        });

        // Set up peer monitoring with reconnection logic
        const updatePeerCount = async () => {
          if (!node || !isSubscribed) return;
          
          const peers = await node.libp2p.getPeers();
          setPeerCount(peers.length);
          
          // If no peers, attempt to reconnect
          if (peers.length === 0 && isSubscribed) {
            console.log("No peers found, attempting to reconnect...");
            setStatus("connecting");
            clearTimeout(retryTimeout);
            retryTimeout = setTimeout(setupWaku, RETRY_DELAY);
          }
        };

        // Update peer count more frequently initially, then less frequently
        updatePeerCount();
        const quickInterval = setInterval(updatePeerCount, 1000);
        setTimeout(() => {
          clearInterval(quickInterval);
          setInterval(updatePeerCount, 5000);
        }, 10000);

        if (isSubscribed) {
          setWaku({ node, encoder });
          setStatus("connected");
        }
      } catch (error) {
        console.error("Waku setup failed:", error);
        if (isSubscribed) {
          setStatus("error");
          // Retry setup after delay
          clearTimeout(retryTimeout);
          retryTimeout = setTimeout(setupWaku, RETRY_DELAY);
        }
      }
    }

    setupWaku();

    return () => {
      isSubscribed = false;
      clearTimeout(retryTimeout);
      if (wakuNode) {
        console.log("Stopping Waku node...");
        wakuNode.stop().catch(console.error);
      }
    };
  }, []);

  const handleSendMessage = async () => {
    if (!waku?.node || !waku?.encoder || !inputMessage.trim()) return;

    const message = inputMessage.trim();
    console.log("Attempting to send message:", message);
    
    const success = await sendMessageWithRetry(waku.node, waku.encoder, message);
    if (success) {
      setMessages(prev => [...prev, { type: 'client', content: message }]);
      setInputMessage("");
    }
  };

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="max-w-2xl mx-auto">
        <div className="mb-8">
          <h1 className="text-2xl font-bold mb-2">Waku Chat Demo</h1>
          <div className="space-y-2">
            <div className={`text-sm ${
              status === 'connected' ? 'text-green-500' : 
              status === 'connecting' ? 'text-yellow-500' : 
              'text-red-500'
            }`}>
              Status: {status}
            </div>
            <div className="text-sm">
              Connected Peers: {peerCount}
            </div>
          </div>
        </div>

        <div className="mb-6">
          <div className="flex gap-2">
            <input
              type="text"
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
              placeholder="Type your message..."
              className="flex-1 px-4 py-2 rounded-lg border border-border bg-background"
              disabled={status !== 'connected'}
            />
            <button
              onClick={handleSendMessage}
              disabled={status !== 'connected'}
              className="px-4 py-2 bg-primary text-primary-foreground rounded-lg disabled:opacity-50"
            >
              Send
            </button>
          </div>
        </div>

        <div className="border border-border rounded-lg p-4">
          <h2 className="text-lg font-semibold mb-4">Messages</h2>
          <div className="space-y-2">
            {messages.map((msg, index) => (
              <div
                key={index}
                className={`p-2 rounded-lg ${
                  msg.type === 'client' 
                    ? 'bg-primary/10 ml-auto max-w-[80%]' 
                    : 'bg-secondary/10 mr-auto max-w-[80%]'
                }`}
              >
                {msg.content}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default dynamic(() => Promise.resolve(Home), {
  ssr: false
});
