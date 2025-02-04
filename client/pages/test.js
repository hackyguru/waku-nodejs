import { useState, useEffect } from "react";
import { createLightNode, waitForRemotePeer, Protocols, createEncoder, createDecoder } from "@waku/sdk";
import dynamic from 'next/dynamic';

const CLIENT_TOPIC = '/waku-chat/1/client-message/proto';
const SERVER_TOPIC = '/waku-chat/1/server-response/proto';
const RETRY_DELAY = 2000; // 2 seconds

const TestPage = () => {
  const [waku, setWaku] = useState(null);
  const [status, setStatus] = useState("disconnected");
  const [messages, setMessages] = useState([]);
  const [customResponse, setCustomResponse] = useState("");
  const [autoReply, setAutoReply] = useState(true);
  const [peerCount, setPeerCount] = useState(0);
  const [isGenerating, setIsGenerating] = useState(false);

  // Helper function to generate response using Ollama
  const generateResponse = async (message) => {
    try {
      const response = await fetch('http://localhost:11434/api/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'dolphin-llama3',
          prompt: `You are a helpful assistant. Please provide a natural and engaging response to this message: "${message}"
                  Keep your response concise (1-2 sentences).`,
          stream: false
        })
      });

      if (!response.ok) {
        throw new Error(`Ollama API error: ${response.statusText}`);
      }

      const data = await response.json();
      return data.response.trim();
    } catch (error) {
      console.error('Failed to generate response:', error);
      return null;
    }
  };

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

        // Create encoders and decoders for both topics
        const clientDecoder = createDecoder(CLIENT_TOPIC);
        const serverEncoder = createEncoder({ contentTopic: SERVER_TOPIC });

        // Listen for client messages
        await node.filter.subscribe([clientDecoder], async (wakuMessage) => {
          if (!wakuMessage.payload || !isSubscribed) return;
          
          const message = new TextDecoder().decode(wakuMessage.payload);
          console.log("Received from client:", message);
          
          // Add received message to the list
          setMessages(prev => [...prev, { type: 'received', content: message }]);

          // Generate and send response if auto-reply is enabled
          if (autoReply && !isGenerating) {
            setIsGenerating(true);
            try {
              console.log("Generating response using Ollama...");
              const generatedResponse = await generateResponse(message);
              
              if (generatedResponse) {
                console.log("Generated response:", generatedResponse);
                const success = await sendMessageWithRetry(node, serverEncoder, generatedResponse);
                if (success) {
                  setMessages(prev => [...prev, { type: 'sent', content: generatedResponse }]);
                }
              } else {
                console.error("Failed to generate response");
              }
            } catch (error) {
              console.error("Error in generate-and-send flow:", error);
            } finally {
              setIsGenerating(false);
            }
          }
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
          setWaku({ node, serverEncoder });
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
  }, [autoReply]);

  const handleSendCustomResponse = async () => {
    if (!waku?.node || !waku?.serverEncoder || !customResponse.trim()) return;

    const success = await sendMessageWithRetry(waku.node, waku.serverEncoder, customResponse.trim());
    if (success) {
      setMessages(prev => [...prev, { type: 'sent', content: customResponse }]);
      setCustomResponse("");
    }
  };

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="max-w-2xl mx-auto">
        <div className="mb-8">
          <h1 className="text-2xl font-bold mb-2">Waku Test Server</h1>
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
            {isGenerating && (
              <div className="text-sm text-blue-500">
                Generating response...
              </div>
            )}
          </div>
        </div>

        <div className="mb-6 space-y-4">
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={autoReply}
                onChange={(e) => setAutoReply(e.target.checked)}
                className="rounded border-gray-300"
              />
              <span>Auto Reply (using Ollama)</span>
            </label>
          </div>

          <div className="flex gap-2">
            <input
              type="text"
              value={customResponse}
              onChange={(e) => setCustomResponse(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleSendCustomResponse()}
              placeholder="Type custom response..."
              className="flex-1 px-4 py-2 rounded-lg border border-border bg-background"
              disabled={status !== 'connected'}
            />
            <button
              onClick={handleSendCustomResponse}
              disabled={status !== 'connected'}
              className="px-4 py-2 bg-primary text-primary-foreground rounded-lg disabled:opacity-50"
            >
              Send
            </button>
          </div>
        </div>

        <div className="border border-border rounded-lg p-4">
          <h2 className="text-lg font-semibold mb-4">Message Log</h2>
          <div className="space-y-2">
            {messages.map((msg, index) => (
              <div
                key={index}
                className={`p-2 rounded-lg ${
                  msg.type === 'received' 
                    ? 'bg-primary/10 mr-auto max-w-[80%]' 
                    : 'bg-secondary/10 ml-auto max-w-[80%]'
                }`}
              >
                <div className="text-xs opacity-50 mb-1">
                  {msg.type === 'received' ? 'Received' : 'Sent'}:
                </div>
                {msg.content}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default dynamic(() => Promise.resolve(TestPage), {
  ssr: false
}); 