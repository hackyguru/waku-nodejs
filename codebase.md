# client/.gitignore

```
# See https://help.github.com/articles/ignoring-files/ for more about ignoring files.

# dependencies
/node_modules
/.pnp
.pnp.*
.yarn/*
!.yarn/patches
!.yarn/plugins
!.yarn/releases
!.yarn/versions

# testing
/coverage

# next.js
/.next/
/out/

# production
/build

# misc
.DS_Store
*.pem

# debug
npm-debug.log*
yarn-debug.log*
yarn-error.log*
.pnpm-debug.log*

# env files (can opt-in for committing if needed)
.env*

# vercel
.vercel

# typescript
*.tsbuildinfo
next-env.d.ts

```

# client/components.json

```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "new-york",
  "rsc": false,
  "tsx": false,
  "tailwind": {
    "config": "tailwind.config.mjs",
    "css": "styles/globals.css",
    "baseColor": "zinc",
    "cssVariables": true,
    "prefix": ""
  },
  "aliases": {
    "components": "@/components",
    "utils": "@/lib/utils",
    "ui": "@/components/ui",
    "lib": "@/lib",
    "hooks": "@/hooks"
  },
  "iconLibrary": "lucide"
}
```

# client/eslint.config.mjs

```mjs
import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [...compat.extends("next/core-web-vitals")];

export default eslintConfig;

```

# client/jsconfig.json

```json
{
  "compilerOptions": {
    "paths": {
      "@/*": ["./*"]
    }
  }
}

```

# client/lib/utils.js

```js
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge"

export function cn(...inputs) {
  return twMerge(clsx(inputs));
}

```

# client/next.config.mjs

```mjs
/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
};

export default nextConfig;

```

# client/package.json

```json
{
  "name": "client",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint"
  },
  "dependencies": {
    "@waku/sdk": "^0.0.29",
    "class-variance-authority": "^0.7.1",
    "clsx": "^2.1.1",
    "lucide-react": "^0.474.0",
    "next": "15.1.6",
    "protobufjs": "^7.4.0",
    "react": "^18.0.0",
    "react-dom": "^18.0.0",
    "tailwind-merge": "^3.0.1",
    "tailwindcss-animate": "^1.0.7"
  },
  "devDependencies": {
    "@eslint/eslintrc": "^3",
    "eslint": "^9",
    "eslint-config-next": "15.1.6",
    "postcss": "^8",
    "tailwindcss": "^3.4.1"
  }
}

```

# client/pages/_app.js

```js
import "@/styles/globals.css";

export default function App({ Component, pageProps }) {
  return <Component {...pageProps} />;
}

```

# client/pages/_document.js

```js
import { Html, Head, Main, NextScript } from "next/document";

export default function Document() {
  return (
    <Html lang="en">
      <Head />
      <body className="antialiased">
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}

```

# client/pages/api/hello.js

```js
// Next.js API route support: https://nextjs.org/docs/api-routes/introduction

export default function handler(req, res) {
  res.status(200).json({ name: "John Doe" });
}

```

# client/pages/index.js

```js
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

```

# client/pages/relay.js

```js
// pages/index.js
import { useState, useEffect } from 'react';
import Head from 'next/head';

// nwaku REST API configuration
const WAKU_NODE_URL = '/api/waku';  // Using Next.js proxy
const CONTENT_TOPIC = '/my-app/1/chat/proto';
const POLL_INTERVAL = 1000; // Poll for new messages every second

// Common fetch options for CORS
const FETCH_OPTIONS = {
  mode: 'cors',
  headers: {
    'Accept': 'application/json',
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  },
};

const RelayPage = () => {
  const [messages, setMessages] = useState([]);
  const [inputMessage, setInputMessage] = useState('');
  const [status, setStatus] = useState('connecting');
  const [error, setError] = useState(null);

  // Function to encode/decode messages
  const encodeMessage = (text) => btoa(text);
  const decodeMessage = (base64) => atob(base64);

  // Function to check node status
  const checkNodeStatus = async () => {
    try {
      const response = await fetch(`${WAKU_NODE_URL}/health`, {
        ...FETCH_OPTIONS,
        method: 'GET',
      });
      if (response.ok) {
        setStatus('connected');
        setError(null);
      } else {
        setStatus('error');
        setError('Node health check failed');
      }
    } catch (err) {
      setStatus('error');
      setError(`Failed to connect to node: ${err.message}`);
    }
  };

  // Function to send a message
  const sendMessage = async (message) => {
    try {
      const response = await fetch(`${WAKU_NODE_URL}/relay/v1/messages`, {
        ...FETCH_OPTIONS,
        method: 'POST',
        body: JSON.stringify({
          payload: encodeMessage(message),
          contentTopic: CONTENT_TOPIC,
          timestamp: Date.now(),
        }),
      });

      if (!response.ok) {
        throw new Error(`Failed to send message: ${response.statusText}`);
      }

      // Add message to local state
      setMessages(prev => [...prev, {
        type: 'sent',
        content: message,
        timestamp: new Date().toISOString()
      }]);

      return true;
    } catch (err) {
      console.error('Send message error:', err);
      setError(`Failed to send message: ${err.message}`);
      return false;
    }
  };

  // Function to fetch messages
  const fetchMessages = async () => {
    try {
      const response = await fetch(
        `${WAKU_NODE_URL}/filter/v1/messages?contentTopic=${CONTENT_TOPIC}`,
        {
          ...FETCH_OPTIONS,
          method: 'GET',
          credentials: 'omit',
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to fetch messages: ${response.statusText}`);
      }

      const data = await response.json();
      
      // Process and update messages
      const processedMessages = data.map(msg => ({
        type: 'received',
        content: decodeMessage(msg.payload),
        timestamp: new Date(msg.timestamp).toISOString()
      }));

      // Update messages, avoiding duplicates
      setMessages(prev => {
        const newMessages = processedMessages.filter(newMsg => 
          !prev.some(oldMsg => 
            oldMsg.content === newMsg.content && 
            oldMsg.timestamp === newMsg.timestamp
          )
        );
        return [...prev, ...newMessages].sort((a, b) => 
          new Date(a.timestamp) - new Date(b.timestamp)
        );
      });

      setError(null);
    } catch (err) {
      console.error('Fetch messages error:', err);
      setError(`Failed to fetch messages: ${err.message}`);
    }
  };

  // Set up polling for messages and status
  useEffect(() => {
    let statusInterval;
    let messagesInterval;

    const startPolling = async () => {
      // Initial checks
      await checkNodeStatus();
      await fetchMessages();

      // Set up polling intervals
      statusInterval = setInterval(checkNodeStatus, 5000);
      messagesInterval = setInterval(fetchMessages, POLL_INTERVAL);
    };

    startPolling();

    return () => {
      clearInterval(statusInterval);
      clearInterval(messagesInterval);
    };
  }, []);

  // Handle sending a new message
  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!inputMessage.trim() || status !== 'connected') return;

    const success = await sendMessage(inputMessage.trim());
    if (success) {
      setInputMessage('');
    }
  };

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <Head>
        <title>Waku REST API Chat</title>
      </Head>

      <div className="max-w-2xl mx-auto">
        <div className="mb-8">
          <h1 className="text-2xl font-bold mb-2">Waku REST API Demo</h1>
          <div className="space-y-2">
            <div className={`text-sm ${
              status === 'connected' ? 'text-green-500' : 
              status === 'connecting' ? 'text-yellow-500' : 
              'text-red-500'
            }`}>
              Status: {status}
            </div>
            {error && (
              <div className="text-sm text-red-500">
                Error: {error}
              </div>
            )}
          </div>
        </div>

        <div className="mb-6">
          <form onSubmit={handleSendMessage} className="flex gap-2">
            <input
              type="text"
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              placeholder="Type your message..."
              className="flex-1 px-4 py-2 rounded-lg border border-border bg-background"
              disabled={status !== 'connected'}
            />
            <button
              type="submit"
              disabled={status !== 'connected'}
              className="px-4 py-2 bg-primary text-primary-foreground rounded-lg disabled:opacity-50"
            >
              Send
            </button>
          </form>
        </div>

        <div className="border border-border rounded-lg p-4">
          <h2 className="text-lg font-semibold mb-4">Messages</h2>
          <div className="space-y-2">
            {messages.map((msg, index) => (
              <div
                key={index}
                className={`p-2 rounded-lg ${
                  msg.type === 'sent' 
                    ? 'bg-primary/10 ml-auto max-w-[80%]' 
                    : 'bg-secondary/10 mr-auto max-w-[80%]'
                }`}
              >
                <div className="text-xs opacity-50 mb-1">
                  {new Date(msg.timestamp).toLocaleTimeString()}
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

export default RelayPage;
```

# client/pages/test.js

```js
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
```

# client/postcss.config.mjs

```mjs
/** @type {import('postcss-load-config').Config} */
const config = {
  plugins: {
    tailwindcss: {},
  },
};

export default config;

```

# client/public/favicon.ico

This is a binary file of the type: Binary

# client/public/file.svg

This is a file of the type: SVG Image

# client/public/globe.svg

This is a file of the type: SVG Image

# client/public/next.svg

This is a file of the type: SVG Image

# client/public/vercel.svg

This is a file of the type: SVG Image

# client/public/window.svg

This is a file of the type: SVG Image

# client/styles/globals.css

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  --background: #ffffff;
  --foreground: #171717;
}

@media (prefers-color-scheme: dark) {
  :root {
    --background: #0a0a0a;
    --foreground: #ededed;
  }
}

body {
  color: var(--foreground);
  background: var(--background);
  font-family: Arial, Helvetica, sans-serif;
}

@layer base {
  :root {
    --background: 0 0% 100%;
    --foreground: 240 10% 3.9%;
    --card: 0 0% 100%;
    --card-foreground: 240 10% 3.9%;
    --popover: 0 0% 100%;
    --popover-foreground: 240 10% 3.9%;
    --primary: 240 5.9% 10%;
    --primary-foreground: 0 0% 98%;
    --secondary: 240 4.8% 95.9%;
    --secondary-foreground: 240 5.9% 10%;
    --muted: 240 4.8% 95.9%;
    --muted-foreground: 240 3.8% 46.1%;
    --accent: 240 4.8% 95.9%;
    --accent-foreground: 240 5.9% 10%;
    --destructive: 0 84.2% 60.2%;
    --destructive-foreground: 0 0% 98%;
    --border: 240 5.9% 90%;
    --input: 240 5.9% 90%;
    --ring: 240 10% 3.9%;
    --chart-1: 12 76% 61%;
    --chart-2: 173 58% 39%;
    --chart-3: 197 37% 24%;
    --chart-4: 43 74% 66%;
    --chart-5: 27 87% 67%;
    --radius: 0.5rem;
  }
  .dark {
    --background: 240 10% 3.9%;
    --foreground: 0 0% 98%;
    --card: 240 10% 3.9%;
    --card-foreground: 0 0% 98%;
    --popover: 240 10% 3.9%;
    --popover-foreground: 0 0% 98%;
    --primary: 0 0% 98%;
    --primary-foreground: 240 5.9% 10%;
    --secondary: 240 3.7% 15.9%;
    --secondary-foreground: 0 0% 98%;
    --muted: 240 3.7% 15.9%;
    --muted-foreground: 240 5% 64.9%;
    --accent: 240 3.7% 15.9%;
    --accent-foreground: 0 0% 98%;
    --destructive: 0 62.8% 30.6%;
    --destructive-foreground: 0 0% 98%;
    --border: 240 3.7% 15.9%;
    --input: 240 3.7% 15.9%;
    --ring: 240 4.9% 83.9%;
    --chart-1: 220 70% 50%;
    --chart-2: 160 60% 45%;
    --chart-3: 30 80% 55%;
    --chart-4: 280 65% 60%;
    --chart-5: 340 75% 55%;
  }
}

@layer base {
  * {
    @apply border-border;
  }
  body {
    @apply bg-background text-foreground;
  }
}

```

# client/tailwind.config.mjs

```mjs
/** @type {import('tailwindcss').Config} */
export default {
    darkMode: ["class"],
    content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
  	extend: {
  		colors: {
  			background: 'hsl(var(--background))',
  			foreground: 'hsl(var(--foreground))',
  			card: {
  				DEFAULT: 'hsl(var(--card))',
  				foreground: 'hsl(var(--card-foreground))'
  			},
  			popover: {
  				DEFAULT: 'hsl(var(--popover))',
  				foreground: 'hsl(var(--popover-foreground))'
  			},
  			primary: {
  				DEFAULT: 'hsl(var(--primary))',
  				foreground: 'hsl(var(--primary-foreground))'
  			},
  			secondary: {
  				DEFAULT: 'hsl(var(--secondary))',
  				foreground: 'hsl(var(--secondary-foreground))'
  			},
  			muted: {
  				DEFAULT: 'hsl(var(--muted))',
  				foreground: 'hsl(var(--muted-foreground))'
  			},
  			accent: {
  				DEFAULT: 'hsl(var(--accent))',
  				foreground: 'hsl(var(--accent-foreground))'
  			},
  			destructive: {
  				DEFAULT: 'hsl(var(--destructive))',
  				foreground: 'hsl(var(--destructive-foreground))'
  			},
  			border: 'hsl(var(--border))',
  			input: 'hsl(var(--input))',
  			ring: 'hsl(var(--ring))',
  			chart: {
  				'1': 'hsl(var(--chart-1))',
  				'2': 'hsl(var(--chart-2))',
  				'3': 'hsl(var(--chart-3))',
  				'4': 'hsl(var(--chart-4))',
  				'5': 'hsl(var(--chart-5))'
  			}
  		},
  		borderRadius: {
  			lg: 'var(--radius)',
  			md: 'calc(var(--radius) - 2px)',
  			sm: 'calc(var(--radius) - 4px)'
  		}
  	}
  },
  plugins: [require("tailwindcss-animate")],
};

```

# README.md

```md
# Waku NodeJS

A demonstration of peer-to-peer communication between a NextJS client and Node.js server using the Waku protocol, without traditional HTTP APIs.

## Overview

- A client (NextJS app) sends messages to a specific content topic
- A server listens for these messages and responds back through Waku
- No HTTP APIs or centralized servers are needed for communication

## How It Works

1. Client Side:
   - Connects to Waku network as a light node
   - Sends messages on client topic
   - Listens for server responses
   - Provides a chat interface

2. Server Side:
   - Connects to Waku network as a light node
   - Listens for client messages
   - Automatically responds to each message
   - Runs as a standalone Node.js process

## Quick Start

1. Start the server:
   - cd server
   - npm install
   - node index.js

2. Start the client:
   - cd client
   - npm install
   - npm run dev

3. Open http://localhost:3000 in your browser


```

# server/.gitignore

```
# See https://help.github.com/articles/ignoring-files/ for more about ignoring files.

# dependencies
node_modules
/.pnp
.pnp.*
.yarn/*
!.yarn/patches
!.yarn/plugins
!.yarn/releases
!.yarn/versions

# testing
/coverage

# next.js
/.next/
/out/

# production
/build

# misc
.DS_Store
*.pem

# debug
npm-debug.log*
yarn-debug.log*
yarn-error.log*
.pnpm-debug.log*

# env files (can opt-in for committing if needed)
.env*

# vercel
.vercel

# typescript
*.tsbuildinfo
next-env.d.ts

```

# server/index.js

```js
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

```

# server/package.json

```json
{
  "name": "server",
  "version": "1.0.0",
  "main": "index.js",
  "type": "module",
  "scripts": {
    "test": "echo \"Error: no test specified\" && exit 1"
  },
  "keywords": [],
  "author": "",
  "license": "ISC",
  "description": "",
  "dependencies": {
    "@waku/sdk": "^0.0.29",
    "protobufjs": "^7.4.0"
  }
}

```

