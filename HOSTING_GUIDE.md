# Catan Game Hosting Guide

This guide provides comprehensive instructions on how to host the Catan game for multiplayer gameplay. Whether you want to play with friends on your local network or host the game online for remote play, this document will walk you through the necessary steps.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Local Hosting](#local-hosting)
3. [Online Hosting Options](#online-hosting-options)
4. [Environment Configuration](#environment-configuration)
5. [Networking and Firewall Considerations](#networking-and-firewall-considerations)
6. [Troubleshooting](#troubleshooting)

## Prerequisites

Before hosting the game, ensure you have the following:

- **Node.js**: Version 14 or higher (v18+ recommended)
- **npm**: Version 6 or higher
- **Git**: For cloning the repository (optional)
- **Basic networking knowledge**: For port forwarding if hosting locally

## Local Hosting

### Option 1: Local Network Play (Same Network)

This option is ideal for playing with friends who are on the same local network (e.g., connected to the same WiFi).

1. **Clone and set up the repository**:
   ```bash
   git clone https://github.com/bigomega/catan.git
   cd catan
   npm install
   ```

2. **Start the server**:
   ```bash
   npm start
   ```

3. **Access the game**:
   - On the host machine: Open a browser and navigate to `http://localhost:3000`
   - On other devices on the same network: Open a browser and navigate to `http://<host-machine-ip>:3000`
     - To find your IP address:
       - On Windows: Open Command Prompt and type `ipconfig`
       - On macOS/Linux: Open Terminal and type `ifconfig` or `ip addr`

4. **Create a game**:
   - The first player should create a game by entering their name and clicking "Host"
   - Other players can join by entering the game ID displayed to the host

### Option 2: Local Network Play with Port Forwarding

This option allows friends to connect from outside your local network.

1. **Set up the game as in Option 1**.

2. **Configure port forwarding on your router**:
   - Access your router's admin panel (typically by navigating to `192.168.0.1` or `192.168.1.1` in your browser)
   - Find the port forwarding section
   - Create a new rule forwarding external port 3000 to internal port 3000 on your host machine's IP address
   - Save the configuration

3. **Find your public IP address**:
   - Visit a website like [whatismyip.com](https://whatismyip.com)
   - Note: If you don't have a static IP, consider using a dynamic DNS service

4. **Access the game**:
   - Players outside your network can connect by navigating to `http://<your-public-ip>:3000`
   - Players on your local network can still use the local IP as in Option 1

### Option 3: Using ngrok for Temporary Public Access

[ngrok](https://ngrok.com/) provides a simple way to expose your local server to the internet without port forwarding.

1. **Set up the game as in Option 1**.

2. **Install and set up ngrok**:
   - Sign up for a free account at [ngrok.com](https://ngrok.com)
   - Download and install ngrok
   - Authenticate ngrok with your auth token: `ngrok authtoken YOUR_AUTH_TOKEN`

3. **Create a tunnel**:
   ```bash
   ngrok http 3000
   ```

4. **Access the game**:
   - ngrok will provide a public URL (e.g., `https://1234abcd.ngrok.io`)
   - Share this URL with your friends to allow them to connect from anywhere

## Online Hosting Options

### Option 1: Render (Recommended)

The game is already hosted on Render at [catan-qvig.onrender.com](https://catan-qvig.onrender.com/login). However, you can deploy your own instance:

1. **Create a Render account** at [render.com](https://render.com)

2. **Create a new Web Service**:
   - Connect your GitHub repository or upload the code
   - Configure the service:
     - Build Command: `npm install`
     - Start Command: `node index.js`
     - Environment: Node.js
     - Plan: Free or paid depending on your needs

3. **Set environment variables** (if needed):
   - `PORT`: Render will set this automatically
   - `API_SALT`: Set a secure value for API access

4. **Deploy the service**:
   - Render will automatically build and deploy your application
   - You'll receive a URL for your deployed application

### Option 2: Heroku

1. **Create a Heroku account** at [heroku.com](https://heroku.com)

2. **Install the Heroku CLI**:
   ```bash
   npm install -g heroku
   ```

3. **Login to Heroku**:
   ```bash
   heroku login
   ```

4. **Create a new Heroku app**:
   ```bash
   heroku create your-catan-app-name
   ```

5. **Add a Procfile** in the root directory with the content:
   ```
   web: node index.js
   ```

6. **Deploy to Heroku**:
   ```bash
   git push heroku main
   ```

7. **Set environment variables** (if needed):
   ```bash
   heroku config:set API_SALT=your_secure_salt
   ```

8. **Open the app**:
   ```bash
   heroku open
   ```

### Option 3: DigitalOcean App Platform

1. **Create a DigitalOcean account** at [digitalocean.com](https://digitalocean.com)

2. **Create a new App**:
   - Connect your GitHub repository
   - Configure the app:
     - Type: Web Service
     - Environment: Node.js
     - Build Command: `npm install`
     - Run Command: `node index.js`

3. **Set environment variables** (if needed)

4. **Deploy the app**:
   - DigitalOcean will build and deploy your application
   - You'll receive a URL for your deployed application

### Option 4: AWS, Google Cloud, or Azure

For more advanced users, the game can be deployed on major cloud platforms:

1. **Create a virtual machine** (EC2, Compute Engine, or Azure VM)
2. **Install Node.js** on the VM
3. **Clone the repository** and install dependencies
4. **Set up a process manager** like PM2:
   ```bash
   npm install -g pm2
   pm2 start index.js
   ```
5. **Configure a reverse proxy** (Nginx or Apache) to forward traffic to your Node.js application
6. **Set up a domain name** and SSL certificate

## Environment Configuration

The game supports the following environment variables:

- `PORT`: The port on which the server will run (default: 3000)
- `API_SALT`: A salt for API access (default: 'cultivate')
- `NODE_ENV`: Set to 'production' for production environments

You can set these variables in different ways depending on your hosting method:

- **Local**: Create a `.env` file in the root directory or set them before starting the server:
  ```bash
  PORT=3001 API_SALT=your_secure_salt npm start
  ```

- **Render/Heroku/etc.**: Set them in the platform's environment variables configuration

## Networking and Firewall Considerations

### Firewall Settings

If you're hosting the game on a server with a firewall, ensure that:

1. **The application port is open** (default: 3000)
2. **WebSocket connections are allowed** (Socket.IO uses WebSockets for real-time communication)

### Network Requirements

- **Bandwidth**: The game uses minimal bandwidth, but ensure you have at least 1 Mbps upload speed for a smooth experience
- **Latency**: Lower latency provides a better experience; ideally under 100ms
- **Stability**: A stable connection is important for real-time gameplay

### Security Considerations

- **API Access**: Change the default `API_SALT` value to prevent unauthorized access to the API endpoints
- **HTTPS**: When hosting online, use HTTPS to encrypt communications (most platforms like Render and Heroku provide this automatically)
- **Rate Limiting**: Consider implementing rate limiting if you expect high traffic

## Troubleshooting

### Common Issues

1. **"Cannot connect to the server"**:
   - Check if the server is running
   - Verify that you're using the correct URL/IP and port
   - Ensure that firewalls or security software aren't blocking the connection

2. **"Game is slow or laggy"**:
   - Check your internet connection
   - Reduce the number of players if using a free hosting tier
   - Consider upgrading to a paid hosting plan for better performance

3. **"Server crashes"**:
   - Check the server logs for error messages
   - Ensure you have enough memory available
   - Consider using a process manager like PM2 to automatically restart the server if it crashes

### Getting Help

If you encounter issues not covered in this guide:

1. Check the [GitHub repository](https://github.com/bigomega/catan) for known issues
2. Open a new issue on GitHub with detailed information about your problem
3. Reach out to the community for help

## Conclusion

By following this guide, you should be able to host the Catan game for multiplayer gameplay, either locally or online. Remember that the free tiers of hosting services like Render may have limitations, such as spinning down after periods of inactivity, which can cause initial loading delays.

Enjoy playing Catan with your friends!