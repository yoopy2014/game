const express = require('express');
const { WebSocketServer } = require('ws');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static(__dirname));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

const server = app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});

const wss = new WebSocketServer({ server });
const clientSockets = new Set();

let players = {}; 
let gameState = {
    status: "waiting", 
    timeLeft: 60,
    duration: 60
};
let gameInterval = null;
let serverTick = 0;

function broadcast(data) {
    for (const socket of clientSockets) {
        if (socket.readyState === 1) {
            socket.send(JSON.stringify(data));
        }
    }
}

function startGameSystem() {
    clearInterval(gameInterval);
    gameState.status = "playing";
    gameState.timeLeft = gameState.duration;
    serverTick = 0;
    
    broadcast({ type: "gameState", state: gameState });

    gameInterval = setInterval(() => {
        serverTick++;

        if (serverTick % 60 === 0) {
            gameState.timeLeft--;
            if (gameState.timeLeft <= 0) {
                clearInterval(gameInterval);
                gameState.status = "finished";
                
                let winnerName = "なし";
                let minDeaths = Infinity;
                let pArray = Object.values(players);
                
                if (pArray.length > 0) {
                    pArray.forEach(p => {
                        if (p.deaths < minDeaths) {
                            minDeaths = p.deaths;
                            winnerName = p.name;
                        }
                    });
                }
                gameState.winner = winnerName;
            }
            broadcast({ type: "gameState", state: gameState });
        }

        if (gameState.status === "playing") {
            if (serverTick % 40 === 0) {
                const isTop = Math.random() > 0.5;
                const height = Math.random() * 150 + 50;
                broadcast({ type: "spawnBone", isTop: isTop, height: height });
            }
            if (serverTick % 120 === 0) {
                const height = 60;
                const yPos = Math.random() * (400 - height);
                broadcast({ type: "spawnLaser", yPos: yPos, height: height });
            }
        }

    }, 1000 / 60); 
}

wss.on('connection', (ws) => {
    clientSockets.add(ws);
    
    // この接続（ws）がどのプレイヤーIDのものかを紐付けるための変数
    let myPlayerId = null;

    ws.send(JSON.stringify({ type: "init", state: gameState, players: players }));

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);

            if (data.type === "move") {
                // 初回移動時にIDを記録しておく
                if (!myPlayerId) {
                    myPlayerId = data.id;
                }
                players[data.id] = {
                    id: data.id, name: data.name, color: data.color, x: data.x, y: data.y, deaths: data.deaths || 0
                };
                broadcast({ type: "sync", players: players });
            }

            if (data.type === "startGame" && gameState.status === "waiting") {
                gameState.status = "countdown";
                broadcast({ type: "gameState", state: gameState });
                setTimeout(() => { startGameSystem(); }, 3000);
            }

            if (data.type === "resetGame") {
                clearInterval(gameInterval);
                gameState.status = "waiting";
                gameState.timeLeft = 60;
                if (gameState.winner) delete gameState.winner;
                for (let id in players) { players[id].deaths = 0; }
                broadcast({ type: "gameState", state: gameState });
                broadcast({ type: "sync", players: players });
            }
        } catch (e) {}
    });

    // 【★修正】タブが閉じられた、または切断されたときの処理
    const handleDisconnect = () => {
        clientSockets.delete(ws);
        
        // 切断したプレイヤーのデータをリストから完全に消す
        if (myPlayerId && players[myPlayerId]) {
            delete players[myPlayerId];
            // 削除した最新のプレイヤーリストを全員に即時同期
            broadcast({ type: "sync", players: players });
        }
    };

    ws.on('close', handleDisconnect);
    ws.on('error', handleDisconnect);
});
