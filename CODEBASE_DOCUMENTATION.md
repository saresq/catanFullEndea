# Catan Game Codebase Documentation

This document provides a comprehensive overview of the Catan game implementation, explaining the architecture, code organization, game flow, and setup instructions. It's designed to help new developers understand how the codebase works and how to contribute to it.

## Table of Contents

1. [Project Overview](#project-overview)
2. [Architecture](#architecture)
3. [Code Organization](#code-organization)
4. [Game Flow](#game-flow)
5. [Key Components](#key-components)
6. [Setup Instructions](#setup-instructions)
7. [Development Guidelines](#development-guidelines)

## Project Overview

This project is a web-based implementation of the popular board game Settlers of Catan. It allows multiple players (2-8) to play the game in real-time over the internet. The game includes all the core mechanics of Catan, including resource collection, building, trading, development cards, and special achievements.

### Features

- Multiplayer gameplay with 2-8 players
- Real-time communication between players
- Customizable game rules and board layouts
- Responsive design for different screen sizes
- Sound effects and visual animations
- Accessibility features

## Architecture

The application follows a client-server architecture with real-time communication:

### Server-Side

- **Node.js**: The server is built with Node.js and Express.js
- **Socket.IO**: Handles real-time communication between the server and clients
- **Mustache**: Used for server-side templating
- **In-Memory Game State**: Game sessions are stored in memory on the server

### Client-Side

- **Vanilla JavaScript**: The client-side code is written in vanilla JavaScript using ES modules
- **Socket.IO Client**: Handles real-time communication with the server
- **CSS**: Styling is organized in modular CSS files
- **HTML**: Server-rendered HTML with Mustache templates

### Communication Flow

1. The server maintains the authoritative game state
2. Clients send actions to the server via Socket.IO
3. The server validates actions, updates the game state, and broadcasts updates to all clients
4. Clients update their local state and UI based on server updates

## Code Organization

### Server-Side

- **index.js**: Main entry point, sets up Express and Socket.IO, defines routes
- **models/**: Contains the core game logic
  - **game.js**: Manages game state, rules, and player actions
  - **player.js**: Represents a player and their resources, buildings, etc.
  - **io_manager.js**: Handles Socket.IO communication

### Client-Side

- **public/js/**: Contains client-side JavaScript
  - **index.js**: Entry point for the game page
  - **game.js**: Client-side game logic
  - **board/**: Board-related classes (board.js, corner.js, edge.js, tile.js)
  - **player/**: Player-related classes
  - **ui/**: UI-related classes
  - **const.js**: Game constants and configurations
  - **utils.js**: Utility functions
  - **socket_manager.js**: Handles Socket.IO communication
  - **audio_manager.js**: Manages game sounds
- **public/css/**: Contains CSS files
  - **index.css**: Main CSS file
  - **constants.css**: CSS variables
  - **index/**: Component-specific CSS files
- **public/images/**: Contains game images
- **views/**: Contains HTML templates
  - **index.html**: Main game page
  - **login.html**: Login page
  - **waiting_room.html**: Waiting room page

## Game Flow

### 1. Game Creation and Joining

1. A player creates a game by selecting "Host" on the login page
2. The server generates a unique game ID and creates a new Game instance
3. Other players join the game by entering the game ID on the login page
4. Players are redirected to the waiting room until all player slots are filled

### 2. Initial Setup

1. Once all players have joined, the game starts
2. Players take turns placing their initial settlements and roads
3. In the first round, players place settlements and roads in clockwise order
4. In the second round, players place settlements and roads in counter-clockwise order
5. Players receive resources for their second settlement

### 3. Main Game Loop

The game follows a state machine pattern with the following states:

1. **PLAYER_ROLL**: The active player rolls the dice
   - If a 7 is rolled, the game transitions to ROBBER_DROP or ROBBER_MOVE
   - Otherwise, resources are distributed and the game transitions to PLAYER_ACTIONS

2. **PLAYER_ACTIONS**: The active player can:
   - Build roads, settlements, and cities
   - Buy and use development cards
   - Trade with other players or the bank
   - End their turn, which transitions back to PLAYER_ROLL for the next player

3. **ROBBER_DROP**: When a 7 is rolled, players with more than the hand limit must discard half their cards
   - After all affected players have discarded, the game transitions to ROBBER_MOVE

4. **ROBBER_MOVE**: The active player moves the robber and steals a resource
   - After the robber is moved, the game transitions to PLAYER_ACTIONS

### 4. Game End

The game ends when a player reaches the configured number of victory points (default 10). Victory points can be earned from:

- Settlements (1 point each)
- Cities (2 points each)
- Victory point development cards (1 point each)
- Largest army (2 points)
- Longest road (2 points)

## Key Components

### Game Class (Server-Side)

The server-side Game class is the core of the game logic. It:

- Manages the game state and rules
- Processes player actions
- Handles resource distribution
- Manages the robber
- Checks victory conditions
- Coordinates communication with clients

### Board Class

The Board class represents the game board. It:

- Creates and manages tiles, corners, and edges
- Provides methods for finding valid building locations
- Handles resource distribution when numbers are rolled
- Manages the robber
- Calculates the longest road

### Player Class

The Player class represents a player in the game. It:

- Manages the player's resources and development cards
- Tracks the player's buildings (roads, settlements, cities)
- Handles buying and using development cards
- Calculates victory points
- Manages special achievements (largest army, longest road)

### Socket Communication

Socket.IO is used for real-time communication between the server and clients. Key events include:

- State changes
- Player actions (building, trading, etc.)
- Dice rolls
- Resource distribution
- Development card usage
- Robber movement
- Game end

## Setup Instructions

### Prerequisites

- Node.js (v14 or higher)
- npm (v6 or higher)

### Installation

1. Clone the repository:
   ```
   git clone https://github.com/bigomega/catan.git
   cd catan
   ```

2. Install dependencies:
   ```
   npm install
   ```

3. Start the development server:
   ```
   npm start
   ```

4. Open your browser and navigate to `http://localhost:3000`

### Development Scripts

- `npm start`: Starts the development server with nodemon for auto-reloading
- `npm run dev-static`: Starts a static file server for development
- `npm run deploy-shuffler`: Deploys the board shuffler to GitHub Pages

## Development Guidelines

### Adding New Features

1. Understand the existing code and architecture
2. Make changes to the server-side code in the `models/` directory
3. Update the client-side code in the `public/js/` directory
4. Test your changes thoroughly
5. Submit a pull request

### Game Customization

The game can be customized in several ways:

1. **Game Configuration**: Modify the `GAME_CONFIG` object in `const.js` to change game rules
2. **Map Layout**: Create custom map layouts using the mapkey format
3. **UI Styling**: Modify the CSS files to change the game's appearance
4. **Sound Effects**: Replace or add sound files in the `public/audio/` directory

### Advanced Map Customization

The game uses a custom mapkey format to define the board layout. The format is:

```
S.S.S.S
-S.M10.G2.J9.S
-S.F12.C6.G4.C10.S
-S.F9.J11.D.J3.M8.S
+S.J8.M3.F4.G5.S
+S.C5.F6.G11.S
+S.S.S.S
```

Where:
- `S` represents a sea tile
- `D` represents a desert tile
- Letters like `M`, `G`, `J`, `C`, `F` represent resource tiles
- Numbers represent the dice values
- `+` and `-` indicate how the next row is positioned relative to the current row

## Conclusion

This documentation provides a comprehensive overview of the Catan game implementation. By understanding the architecture, code organization, and game flow, new developers should be able to navigate the codebase and contribute to the project effectively.

For any questions or issues, please open an issue on the GitHub repository or contact the project maintainers.