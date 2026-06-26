const express = require('express');
const { WebSocketServer } = require('ws');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// index.htmlがあるフォルダを指定
app.use(express.static(__dirname));

// 普通にアクセスされたらゲーム画面（index.html）を返す
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// サーバーを起動
const server = app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});

// 同じサーバー上でWebSocketを起動！
const wss = new WebSocketServer({ server });
const clientSockets = new Set();

wss.on('connection', (ws) => {
    clientSockets.add(ws);

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            // 送信元以外の全員に位置をブロードキャスト
            for (const socket of clientSockets) {
                if (socket !== ws && socket.readyState === 1) {
                    socket.send(JSON.stringify(data));
                }
            }
        } catch (e) {}
    });

    ws.on('close', () => { clientSockets.delete(ws); });
    ws.on('error', () => { clientSockets.delete(ws); });
});
