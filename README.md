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

