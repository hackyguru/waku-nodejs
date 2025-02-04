import { useState, useEffect } from "react";
import { createLightNode, waitForRemotePeer, Protocols, createEncoder, createDecoder } from "@waku/sdk";
import dynamic from 'next/dynamic';

const CLIENT_TOPIC = '/waku-chat/1/client-message/proto';
const SERVER_TOPIC = '/waku-chat/1/server-response/proto';

const Home = () => {
  const [waku, setWaku] = useState(null);
  const [messages, setMessages] = useState([]);
  const [status, setStatus] = useState("disconnected");
  const [inputMessage, setInputMessage] = useState("");
  
  useEffect(() => {
    let isSubscribed = true;

    async function setupWaku() {
      try {
        setStatus("connecting");
        const node = await createLightNode({
          networkConfig: {clusterId: 1, shards: [0]},
          defaultBootstrap: true,
          pingKeepAlive: 60,
          //bootstrapPeers: bootstrapNodes,
          numPeersToUse: 3,
      });
        await node.start();
        await waitForRemotePeer(node, [Protocols.LightPush, Protocols.Filter]);

        if (!node.filter) {
          throw new Error("Filter protocol not available");
        }

        const encoder = createEncoder({ contentTopic: CLIENT_TOPIC });
        const decoder = createDecoder(SERVER_TOPIC);

        await node.filter.subscribe([decoder], (wakuMessage) => {
          if (!wakuMessage.payload || !isSubscribed) return;
          
          const message = new TextDecoder().decode(wakuMessage.payload);
          console.log("Received from server:", message);
          setMessages(prev => [...prev, { type: 'server', content: message }]);
        });

        if (isSubscribed) {
          setWaku({ node, encoder });
          setStatus("connected");
        }
      } catch (error) {
        console.error("Waku setup failed:", error);
        if (isSubscribed) {
          setStatus("error");
        }
      }
    }

    setupWaku();

    return () => {
      isSubscribed = false;
      if (waku?.node) {
        waku.node.stop().catch(console.error);
      }
    };
  }, []);

  const handleSendMessage = async () => {
    if (!waku?.node || !waku?.encoder || !inputMessage.trim()) return;

    try {
      const message = inputMessage.trim();
      await waku.node.lightPush.send(waku.encoder, {
        payload: new TextEncoder().encode(message)
      });

      setMessages(prev => [...prev, { type: 'client', content: message }]);
      setInputMessage("");
    } catch (error) {
      console.error("Failed to send message:", error);
    }
  };

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="max-w-2xl mx-auto">
        <div className="mb-8">
          <h1 className="text-2xl font-bold mb-2">Waku Chat Demo</h1>
          <div className={`text-sm ${
            status === 'connected' ? 'text-green-500' : 
            status === 'connecting' ? 'text-yellow-500' : 
            'text-red-500'
          }`}>
            Status: {status}
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
