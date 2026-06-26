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

// 全員のプレイヤーデータをサーバーで一元管理
let players = {}; 
let gameState = {
    status: "waiting", // "waiting", "countdown", "playing", "finished"
    timeLeft: 60,
    duration: 60
};
let timerInterval = null;

function broadcast(data) {
    for (const socket of clientSockets) {
        if (socket.readyState === 1) {
            socket.send(JSON.stringify(data));
        }
    }
}

function startTimer() {
    clearInterval(timerInterval);
    gameState.status = "playing";
    gameState.timeLeft = gameState.duration;
    
    broadcast({ type: "gameState", state: gameState });

    timerInterval = setInterval(() => {
        gameState.timeLeft--;
        if (gameState.timeLeft <= 0) {
            clearInterval(timerInterval);
            gameState.status = "finished";
            
            // 勝者を判定（死亡回数が一番少ない人）
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
    }, 1000);
}

wss.on('connection', (ws) => {
    clientSockets.add(ws);
    
    // 新規接続時に現在のゲーム状態と全プレイヤーリストを送信
    ws.send(JSON.stringify({ type: "init", state: gameState, players: players }));

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);

            // ① 移動・名前・生死データを受け取って保存
            if (data.type === "move") {
                players[data.id] = {
                    id: data.id,
                    name: data.name,
                    color: data.color,
                    x: data.x,
                    y: data.y,
                    deaths: data.deaths || 0
                };
                // 全員に最新のプレイヤー一覧をブロードキャスト
                broadcast({ type: "sync", players: players });
            }

            // ② ホストからのゲーム開始合図
            if (data.type === "startGame" && gameState.status === "waiting") {
                gameState.status = "countdown";
                gameState.duration = data.duration || 60;
                broadcast({ type: "gameState", state: gameState });

                // 3秒間のカウントダウン演出のあと、本戦スタート
                setTimeout(() => {
                    startTimer();
                }, 3000);
            }

            // ③ リセット合図
            if (data.type === "resetGame") {
                clearInterval(timerInterval);
                gameState.status = "waiting";
                gameState.timeLeft = 60;
                if (gameState.winner) delete gameState.winner;
                
                // 全員のデス数をゼロにリセット
                for (let id in players) {
                    players[id].deaths = 0;
                }
                broadcast({ type: "gameState", state: gameState });
                broadcast({ type: "sync", players: players });
            }

        } catch (e) {}
    });

    ws.on('close', () => {
        clientSockets.delete(ws);
        // 切断したプレイヤーをリストから削除する処理（任意。今回はID特定用に少し残すか、消すか）
        // ここではシンプルに全員同期に任せます
    });
    ws.on('error', () => { clientSockets.delete(ws); });
});
