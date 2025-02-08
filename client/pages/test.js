import { useState, useEffect } from "react";
import axios from 'axios';

const NWAKU_URL = 'http://127.0.0.1:8645';
const CLIENT_TOPIC = '/waku-chat/1/client-message/proto';
const RESPONSE_TOPIC = '/waku-chat/1/server-response/proto';
const POLL_INTERVAL = 1000; // 1 second

export default function TestPage() {
    const [messages, setMessages] = useState([]);
    const [nodeStatus, setNodeStatus] = useState("disconnected");
    const [isGenerating, setIsGenerating] = useState(false);

    // Check nwaku node health
    const checkNodeHealth = async () => {
        try {
            const response = await axios.get(`${NWAKU_URL}/health`, {
                headers: {
                    'accept': 'text/plain'
                }
            });
            setNodeStatus(response.status === 200 ? "connected" : "error");
        } catch (error) {
            console.error('Health check failed:', error);
            setNodeStatus("error");
        }
    };

    // Subscribe to client topic
    const subscribeToClientTopic = async () => {
        try {
            await axios.post(
                `${NWAKU_URL}/relay/v1/auto/subscriptions`,
                [CLIENT_TOPIC],
                {
                    headers: {
                        'accept': 'text/plain',
                        'content-type': 'application/json'
                    }
                }
            );
            console.log('Successfully subscribed to client topic:', CLIENT_TOPIC);
        } catch (error) {
            console.error('Error subscribing to client topic:', error);
        }
    };

    // Generate response using Ollama
    const generateOllamaResponse = async (message) => {
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
            return 'Sorry, I encountered an error while processing your request.';
        }
    };

    // Send response back to client
    const sendResponse = async (response) => {
        try {
            const encodedMessage = btoa(response);
            await axios.post(
                `${NWAKU_URL}/relay/v1/auto/messages`,
                {
                    payload: encodedMessage,
                    contentTopic: RESPONSE_TOPIC,
                    timestamp: Date.now()
                },
                {
                    headers: {
                        'content-type': 'application/json'
                    }
                }
            );
        } catch (error) {
            console.error('Error sending response:', error);
        }
    };

    // Fetch and process client messages
    const fetchClientMessages = async () => {
        if (nodeStatus !== "connected") return;

        try {
            const encodedTopic = encodeURIComponent(CLIENT_TOPIC);
            const response = await axios.get(
                `${NWAKU_URL}/relay/v1/auto/messages/${encodedTopic}`,
                {
                    headers: {
                        'Content-Type': 'application/json'
                    }
                }
            );
            
            if (response.data && response.data.length > 0) {
                setMessages(prevMessages => {
                    // Filter out duplicates and add new messages
                    const newMessages = response.data.filter(
                        newMsg => !prevMessages.some(
                            prevMsg => prevMsg.timestamp === newMsg.timestamp
                        )
                    );

                    // Process new messages
                    newMessages.forEach(async (msg) => {
                        if (!isGenerating) {
                            setIsGenerating(true);
                            const decodedMessage = atob(msg.payload);
                            console.log('Processing client message:', decodedMessage);

                            // Generate response using Ollama
                            const aiResponse = await generateOllamaResponse(decodedMessage);
                            console.log('Generated AI response:', aiResponse);

                            // Send response back
                            await sendResponse(aiResponse);
                            setIsGenerating(false);
                        }
                    });

                    return [...prevMessages, ...newMessages];
                });
            }
        } catch (error) {
            console.error('Error fetching client messages:', error);
        }
    };

    // Initialize subscription and health check
    useEffect(() => {
        subscribeToClientTopic();
        checkNodeHealth();

        // Set up periodic health checks
        const healthInterval = setInterval(checkNodeHealth, 5000);
        return () => clearInterval(healthInterval);
    }, []);

    // Set up message polling
    useEffect(() => {
        const interval = setInterval(fetchClientMessages, POLL_INTERVAL);
        return () => clearInterval(interval);
    }, [nodeStatus]);

    return (
        <div className="min-h-screen bg-gray-100 p-8">
            <div className="max-w-2xl mx-auto bg-white rounded-lg shadow-md p-6">
                <div className="mb-6">
                    <h1 className="text-2xl font-bold mb-4 text-black">AI Test Interface (Ollama)</h1>
                    <div className={`text-sm ${
                        nodeStatus === 'connected' ? 'text-green-600' : 'text-red-600'
                    }`}>
                        Status: {nodeStatus}
                    </div>
                    {isGenerating && (
                        <div className="text-sm text-blue-600 mt-2">
                            Generating response using Ollama...
                        </div>
                    )}
                </div>

                <div className="border rounded-lg p-4">
                    <h2 className="text-lg font-semibold mb-4 text-black">Client Messages</h2>
                    <div className="space-y-2">
                        {messages.map((msg, index) => {
                            const decodedMessage = atob(msg.payload);
                            return (
                                <div
                                    key={index}
                                    className="p-3 rounded-lg bg-gray-50"
                                >
                                    <p className="text-sm text-black">{decodedMessage}</p>
                                    <p className="text-xs text-gray-600 mt-1">
                                        {new Date(msg.timestamp).toLocaleString()}
                                    </p>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>
        </div>
    );
} 