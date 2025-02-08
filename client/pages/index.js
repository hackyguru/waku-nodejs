import { useState, useEffect } from "react";
import axios from 'axios';

const NWAKU_URL = 'http://127.0.0.1:8645';
const CLIENT_TOPIC = '/waku-chat/1/client-message/proto';
const RESPONSE_TOPIC = '/waku-chat/1/server-response/proto';
const POLL_INTERVAL = 1000; // 1 second

export default function ChatPage() {
    const [messages, setMessages] = useState([]);
    const [inputMessage, setInputMessage] = useState("");
    const [nodeStatus, setNodeStatus] = useState("disconnected");

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

    // Subscribe to response topic
    const subscribeToResponseTopic = async () => {
        try {
            await axios.post(
                `${NWAKU_URL}/relay/v1/auto/subscriptions`,
                [RESPONSE_TOPIC],
                {
                    headers: {
                        'accept': 'text/plain',
                        'content-type': 'application/json'
                    }
                }
            );
            console.log('Successfully subscribed to response topic:', RESPONSE_TOPIC);
        } catch (error) {
            console.error('Error subscribing to response topic:', error);
        }
    };

    // Fetch AI responses
    const fetchResponses = async () => {
        if (nodeStatus !== "connected") return;

        try {
            const encodedTopic = encodeURIComponent(RESPONSE_TOPIC);
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
                    ).map(msg => ({
                        ...msg,
                        isResponse: true
                    }));
                    return [...prevMessages, ...newMessages];
                });
            }
        } catch (error) {
            console.error('Error fetching responses:', error);
        }
    };

    // Send message to client topic
    const handleSendMessage = async (e) => {
        e.preventDefault();
        if (!inputMessage.trim() || nodeStatus !== "connected") return;

        try {
            const encodedMessage = btoa(inputMessage);
            await axios.post(
                `${NWAKU_URL}/relay/v1/auto/messages`,
                {
                    payload: encodedMessage,
                    contentTopic: CLIENT_TOPIC,
                    timestamp: Date.now()
                },
                {
                    headers: {
                        'content-type': 'application/json'
                    }
                }
            );
            
            // Add user message to the list
            setMessages(prev => [...prev, {
                payload: encodedMessage,
                timestamp: Date.now(),
                isResponse: false
            }]);
            
            setInputMessage('');
        } catch (error) {
            console.error('Error sending message:', error);
        }
    };

    // Initialize subscription and health check
    useEffect(() => {
        subscribeToResponseTopic();
        checkNodeHealth();

        // Set up periodic health checks
        const healthInterval = setInterval(checkNodeHealth, 5000);
        return () => clearInterval(healthInterval);
    }, []);

    // Set up response polling
    useEffect(() => {
        const interval = setInterval(fetchResponses, POLL_INTERVAL);
        return () => clearInterval(interval);
    }, [nodeStatus]);

    return (
        <div className="min-h-screen bg-gray-100 p-8">
            <div className="max-w-2xl mx-auto bg-white rounded-lg shadow-md p-6">
                <div className="mb-6">
                    <h1 className="text-2xl font-bold mb-4 text-black">Chat with AI</h1>
                    <div className={`text-sm ${
                        nodeStatus === 'connected' ? 'text-green-600' : 'text-red-600'
                    }`}>
                        Status: {nodeStatus}
                    </div>
                </div>

                <div className="mb-6 h-96 overflow-y-auto border rounded-lg p-4">
                    {messages.map((msg, index) => {
                        const decodedMessage = atob(msg.payload);
                        return (
                            <div 
                                key={index} 
                                className={`mb-3 p-3 rounded-lg ${
                                    msg.isResponse ? 'bg-blue-50 ml-8' : 'bg-gray-50 mr-8'
                                }`}
                            >
                                <p className="text-sm text-black">{decodedMessage}</p>
                                <p className="text-xs text-gray-600 mt-1">
                                    {new Date(msg.timestamp).toLocaleString()}
                                </p>
                            </div>
                        );
                    })}
                </div>

                <form onSubmit={handleSendMessage} className="flex gap-2">
                    <input
                        type="text"
                        value={inputMessage}
                        onChange={(e) => setInputMessage(e.target.value)}
                        placeholder="Type your message..."
                        className="flex-1 p-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-400 text-black placeholder-gray-500"
                        disabled={nodeStatus !== "connected"}
                    />
                    <button
                        type="submit"
                        disabled={nodeStatus !== "connected"}
                        className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:bg-gray-400 disabled:cursor-not-allowed"
                    >
                        Send
                    </button>
                </form>
            </div>
        </div>
    );
}
