# 🚀 Ludo Multiplayer Deployment Guide

## Local Development

```bash
npm install
npm start
```

Visit: http://localhost:3000

## Features

✅ 2-4 Players multiplayer
✅ Classic Ludo rules
✅ Dice rolling with animation
✅ Token movement
✅ Capture mechanics
✅ Safe zones
✅ Turn-based gameplay
✅ Winner celebration
✅ Mobile responsive

## How to Play

1. **Create Room** - Select number of players (2-4)
2. **Share Code** - Friends join with room code
3. **Start Game** - Host starts when all joined
4. **Roll Dice** - Click to roll on your turn
5. **Move Tokens** - Click token to move
6. **Win** - First to get all 4 tokens home wins!

## Game Rules

- Roll **6** to bring token out of home
- Roll dice and move tokens
- Land on opponent to send them back
- **Safe zones** protect your tokens
- Roll **6** to get extra turn
- First to get all 4 tokens home wins!

## Deploy to Render

1. Go to https://render.com
2. Click "New +" → "Web Service"
3. Connect your GitHub repository
4. Configure:
   - **Name**: ludo-multiplayer
   - **Environment**: Node
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
5. Click "Create Web Service"

## Tech Stack

- **Backend**: Node.js + Express + WebSocket
- **Frontend**: Vanilla JavaScript + CSS
- **Game Logic**: Classic Ludo rules

---

**Made with ❤️ for board game lovers!**
