const axios = require('axios');

// Configuration
const SUBSCRIPTION_URL = 'http://127.0.0.1:8645';
const MESSAGE_URL = 'http://127.0.0.1:8645';
const CONTENT_TOPIC = '/my-app/2/chatroom-1/proto';
const POLL_INTERVAL = 1000; // Poll every second

// Function to subscribe to a content topic
async function subscribeToTopic() {
    try {
        const response = await axios.post(
            `${SUBSCRIPTION_URL}/relay/v1/auto/subscriptions`,
            [CONTENT_TOPIC],
            {
                headers: {
                    'accept': 'text/plain',
                    'content-type': 'application/json'
                }
            }
        );
        console.log('Successfully subscribed to topic:', CONTENT_TOPIC);
        return response.data;
    } catch (error) {
        console.error('Error subscribing to topic:', error.message);
        throw error;
    }
}

// Function to fetch messages
async function fetchMessages() {
    try {
        const encodedTopic = encodeURIComponent(CONTENT_TOPIC);
        const response = await axios.get(
            `${MESSAGE_URL}/relay/v1/auto/messages/${encodedTopic}`,
            {
                headers: {
                    'Content-Type': 'application/json'
                }
            }
        );
        
        if (response.data && response.data.length > 0) {
            console.log('Received messages:', response.data);
        }
    } catch (error) {
        console.error('Error fetching messages:', error.message);
    }
}

// Main function to run the subscriber
async function main() {
    try {
        console.log('Starting Waku subscription service...');
        await subscribeToTopic();
        
        // Start polling for messages
        console.log('Starting to poll for messages...');
        setInterval(fetchMessages, POLL_INTERVAL);
        
        // Handle graceful shutdown
        process.on('SIGINT', () => {
            console.log('Shutting down...');
            process.exit(0);
        });
    } catch (error) {
        console.error('Failed to start subscriber:', error.message);
        process.exit(1);
    }
}

// Start the subscriber
main();