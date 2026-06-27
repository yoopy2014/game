<!DOCTYPE html>
<html lang="ja">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no, viewport-fit=cover">
    <title>3D/2Dサンズ風・完全公平デスマッチ</title>
    <style>
        * { box-sizing: border-box; }
        
        body {
            background-color: #000; color: #fff; font-family: monospace;
            margin: 0; padding: 10px; overflow-x: hidden; overflow-y: auto;
            display: flex; flex-direction: column; align-items: center; min-height: 100vh; touch-action: none; 
        }
        
        .game-wrapper {
            display: flex;
            flex-direction: row;
            gap: 15px;
            width: 95vw;
            max-width: 1050px;
            margin-bottom: 20px;
        }

        #game-area {
            flex: 2;
            display: flex;
            flex-direction: column;
            align-items: center;
            min-width: 0;
            width: 100%;
        }

        #game-stage-container {
            width: 800px;
            height: 400px;
            position: relative;
            border: 4px solid #fff;
            background-color: #000;
            overflow: hidden;
            transform-origin: top center;
        }

        #stage-scaler {
            width: 100%;
            max-width: 800px;
            margin: 0 auto;
            overflow: hidden;
        }

        #leaderboard {
            flex: 0.6;
            border: 4px solid #fff;
            background-color: #111;
            padding: 10px;
            display: flex;
            flex-direction: column;
            min-width: 200px;
            min-height: 200px; 
            max-height: 400px;
            overflow-y: auto;
        }
        #leaderboard h2 { font-size: 16px; margin: 0 0 10px 0; border-bottom: 2px solid #fff; padding-bottom: 5px; text-align: center; }
        .rank-item { display: flex; justify-content: space-between; padding: 6px; margin-bottom: 5px; background: #222; font-size: 13px; border-radius: 4px; }

        #timer-display { font-size: 18px; font-weight: bold; margin-bottom: 5px; color: #ff0; text-align: center; }
        #control-panel { margin-bottom: 10px; display: flex; gap: 10px; }
        button { background: #fff; color: #000; border: none; padding: 6px 12px; font-weight: bold; cursor: pointer; font-family: monospace; font-size: 12px; }
        button:hover { background: #ccc; }
        
        .bg-line { position: absolute; height: 2px; background-color: #333; width: 100px; }
        
        .player-container { 
            position: absolute; 
            width: 20px; 
            height: 20px; 
            z-index: 10; 
            display: flex; 
            flex-direction: column; 
            align-items: center; 
        }
        .player-body { width: 20px; height: 20px; }
        
        .player-name { 
            position: absolute; 
            bottom: 24px; 
            white-space: nowrap; 
            font-size: 11px; 
            color: #fff; 
            background-color: rgba(0, 0, 0, 0.8); 
            padding: 2px 6px; 
            border-radius: 3px; 
            border: 1px solid #555; 
        }
        .other-player { opacity: 0.6; }
        .bone { position: absolute; width: 15px; background-color: #fff; border-radius: 4px; z-index: 5; }
        
        .laser { position: absolute; background-color: #fff; z-index: 6; opacity: 0; transition: opacity 0.1s; }
        .laser-horizontal { left: 0; width: 100%; border-top: 4px solid #00f; border-bottom: 4px solid #f00; }
        .laser-vertical { top: 0; height: 100%; border-left: 4px solid #00f; border-right: 4px solid #f00; }
        
        #overlay { position: absolute; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.8); z-index: 100; display: flex; flex-direction: column; align-items: center; justify-content: center; font-size: 24px; font-weight: bold; text-align: center; }

        @media (max-width: 900px) {
            .game-wrapper { flex-direction: column; width: 95vw; gap: 10px; }
            #leaderboard { width: 100%; min-height: 150px; max-height: 200px; }
        }
    </style>
</head>
<body>

    <div class="game-wrapper">
        <div id="game-area">
            <div id="timer-display">待機中...</div>
            <div id="control-panel">
                <button id="btn-start">ゲーム開始 (60秒)</button>
                <button id="btn-reset">リセット</button>
            </div>
            <div id="stage-scaler">
                <div id="game-stage-container">
                    <div id="overlay">名前を入力してください</div>
                </div>
            </div>
        </div>
        <div id="leaderboard">
            <h2>🏆 RANKING</h2>
            <div id="rank-list"></div>
        </div>
    </div>

    <audio id="bgm-player" loop preload="auto"></audio>

    <script>
        let myName = prompt("あなたの名前を入力してください：", "ゲスト");
        if (!myName || myName.trim() === "") { myName = "ゲスト"; }
        document.getElementById("overlay").style.display = "none";

        const protocol = window.location.protocol === 'https:' ? 'wss://' : 'ws://';
        const wsUrl = protocol + window.location.host;

        const myId = "player_" + Math.floor(Math.random() * 10000);
        const myColor = '#' + Math.floor(Math.random()*16777215).toString(16);
        let myPos = { x: 100, y: 190 };
        let lastSentPos = { x: 0, y: 0 }; 
        let myDeaths = 0; 
        
        const SPEED = 6;
        const keys = {};
        let obstacles = [];
        const bgLines = [];
        let lasers = []; 
        let gameTick = 0;
        let ws = null; 
        let currentStatus = "waiting"; 
        let isInvincible = false;

        const stage = document.getElementById("game-stage-container");
        const stageScaler = document.getElementById("stage-scaler");
        const timerDisplay = document.getElementById("timer-display");
        const overlay = document.getElementById("overlay");
        let touchTarget = null; 

        // 効果音自動生成システム (Web Audio API)
        let audioCtx = null;
        function initAudio() {
            if (!audioCtx) {
                audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            }
        }

        function playWarningSound() {
            initAudio();
            if (!audioCtx) return;
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.connect(gain);
            gain.connect(audioCtx.destination);
            osc.type = 'square';
            osc.frequency.setValueAtTime(800, audioCtx.currentTime);
            gain.gain.setValueAtTime(0.05, audioCtx.currentTime);
            gain.gain.setValueAtTime(0, audioCtx.currentTime + 0.05);
            gain.gain.setValueAtTime(0.05, audioCtx.currentTime + 0.1);
            gain.gain.setValueAtTime(0, audioCtx.currentTime + 0.15);
            gain.gain.setValueAtTime(0.05, audioCtx.currentTime + 0.2);
            gain.gain.setValueAtTime(0, audioCtx.currentTime + 0.25);
            osc.start();
            osc.stop(audioCtx.currentTime + 0.3);
        }

        function playLaserSound() {
            initAudio();
            if (!audioCtx) return;
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.connect(gain);
            gain.connect(audioCtx.destination);
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(1200, audioCtx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(80, audioCtx.currentTime + 0.4);
            gain.gain.setValueAtTime(0.12, audioCtx.currentTime);
            gain.gain.linearRampToValueAtTime(0, audioCtx.currentTime + 0.4);
            osc.start();
            osc.stop(audioCtx.currentTime + 0.4);
        }

        function resizeStage() {
            const containerWidth = stageScaler.clientWidth;
            const scale = containerWidth / 800;
            stage.style.transform = `scale(${scale})`;
            stageScaler.style.height = (400 * scale) + "px";
        }
        window.addEventListener("resize", resizeStage);
        setTimeout(resizeStage, 100);

        let lastTime = performance.now();
        const fpsInterval = 1000 / 60; 
        let accumulatedTime = 0;

        // 【同期システム拡張】BGM管理システム
        const bgm = document.getElementById("bgm-player");
        const BGM_WAITING_URL = "game_waiting.mp3"; 
        const BGM_PLAYING_URL = "game_playing.mp3"; 
        let lastLoggedStatus = ""; // 前回のステータスを記憶して無駄な再再生を防ぐ

        function playExternalBGM(status) {
            // ステータスに変化がない場合は処理をスキップ（曲のズレや重複再生を防止）
            if (status === lastLoggedStatus) return;
            lastLoggedStatus = status;

            let targetUrl = "";
            if (status === "waiting" || status === "countdown") {
                targetUrl = BGM_WAITING_URL;
            } else if (status === "playing") {
                targetUrl = BGM_PLAYING_URL;
            }

            if (status === "finished") {
                bgm.pause();
                return;
            }

            // 曲が切り替わる時だけ新しく読み込んで再生
            if (targetUrl !== "") {
                bgm.src = targetUrl;
                bgm.volume = 0.25;
                // ブラウザの制限を回避するためcatchを入れておく
                bgm.play().catch(() => {
                    console.log("ユーザー操作前の自動再生ブロックを検出。操作を待ちます。");
                });
            }
        }

        for(let i=0; i<15; i++) {
            const line = document.createElement("div");
            line.className = "bg-line";
            line.style.left = Math.random() * 800 + "px"; line.style.top = Math.random() * 400 + "px";
            stage.appendChild(line);
            bgLines.push({ element: line, x: Math.random() * 800, speed: Math.random() * 4 + 2 });
        }

        // 画面のどこかを操作した瞬間にBGMシステムをアクティブにする
        function unlockAudio() {
            initAudio();
            if (bgm.paused && lastLoggedStatus !== "finished") {
                bgm.play().catch(()=>{});
            }
        }
        window.addEventListener("keydown", (e) => { unlockAudio(); keys[e.key] = true; });
        window.addEventListener("keyup", (e) => { keys[e.key] = false; });

        function updateTouchTarget(e) {
            unlockAudio();
            if (e.touches.length === 0 || currentStatus !== "playing") return;
            const touch = e.touches[0];
            const rect = stage.getBoundingClientRect();
            touchTarget = {
                x: (touch.clientX - rect.left) * (800 / rect.width) - 10,
                y: (touch.clientY - rect.top) * (400 / rect.height) - 10
            };
        }
        stage.addEventListener("touchstart", updateTouchTarget, { passive: true });
        stage.addEventListener("touchmove", updateTouchTarget, { passive: true });
        stage.addEventListener("touchend", () => { touchTarget = null; }, { passive: true });

        document.getElementById("btn-start").addEventListener("click", () => {
            unlockAudio();
            if (currentStatus !== "waiting") return;
            const inputPass = prompt("管理用パスワードを入力してください：");
            if (inputPass === "1234") {
                if (ws && ws.readyState === WebSocket.OPEN) { ws.send(JSON.stringify({ type: "startGame" })); }
            } else if (inputPass !== null) {
                alert("パスワードが違います！");
            }
        });

        document.getElementById("btn-reset").addEventListener("click", () => {
            unlockAudio();
            if (ws && ws.readyState === WebSocket.OPEN) { ws.send(JSON.stringify({ type: "resetGame" })); }
        });

        function connectToWebSocket() {
            try {
                if (ws) { ws.close(); }
                ws = new WebSocket(wsUrl);
                ws.binaryType = "arraybuffer"; 

                ws.onmessage = (event) => {
                    const data = JSON.parse(event.data);
                    
                    // 【完全同期コア】サーバーから届いたゲーム状態の更新メッセージ
                    if (data.type === "gameState") {
                        currentStatus = data.state.status;
                        
                        // サーバーの公式ステータスを元に、全員一斉に音を鳴らし分ける
                        playExternalBGM(currentStatus);

                        if (currentStatus === "waiting") {
                            timerDisplay.innerText = "待機中..."; overlay.style.display = "none"; myDeaths = 0;
                            obstacles.forEach(b => b.element.remove()); obstacles = [];
                            lasers.forEach(l => l.element.remove()); lasers = [];
                            isInvincible = false;
                        } else if (currentStatus === "countdown") {
                            timerDisplay.innerText = "まもなく開始..."; overlay.style.display = "flex"; overlay.innerText = "READY..."; overlay.style.color = "#ff0";
                        } else if (currentStatus === "playing") {
                            overlay.style.display = "none"; timerDisplay.innerText = "⏱ 残り時間: " + data.state.timeLeft + "秒";
                        } else if (currentStatus === "finished") {
                            overlay.style.display = "flex"; overlay.innerText = "⌛ TIME UP!\n👑 勝者: " + data.state.winner; overlay.style.color = "#0f0"; timerDisplay.innerText = "ゲーム終了！";
                        }
                    }

                    if (data.type === "spawnBone") {
                        const bone = document.createElement("div");
                        bone.className = "bone";
                        const yPos = data.isTop ? 0 : (400 - data.height);
                        bone.style.height = data.height + "px"; bone.style.top = yPos + "px"; bone.style.left = "800px";
                        stage.appendChild(bone);
                        obstacles.push({ element: bone, x: 800, y: yPos, h: data.height });
                    }

                    if (data.type === "spawnLaser") {
                        const laser = document.createElement("div");
                        const dir = data.direction || "horizontal"; 
                        laser.className = "laser " + (dir === "vertical" ? "laser-vertical" : "laser-horizontal");
                        
                        if (dir === "vertical") {
                            laser.style.width = data.width + "px"; laser.style.left = data.xPos + "px";
                        } else {
                            laser.style.height = data.height + "px"; laser.style.top = data.yPos + "px";
                        }
                        
                        stage.appendChild(laser);
                        
                        const laserObj = { 
                            element: laser, direction: dir, x: data.xPos || 0, y: data.yPos || 0,
                            w: data.width || data.height, h: data.height || 400, isActive: false, life: 75 
                        };
                        lasers.push(laserObj);
                        
                        laser.style.opacity = "0.2"; laser.style.backgroundColor = "#f00";
                        
                        if (currentStatus === "playing") { playWarningSound(); }
                        
                        setTimeout(() => { 
                            laserObj.isActive = true; 
                            laser.style.opacity = "1"; laser.style.backgroundColor = "#fff"; 
                            if (currentStatus === "playing") { playLaserSound(); }
                        }, 1000); 
                    }

                    if (data.type === "init") { 
                        updateLeaderboard(data.players); 
                        currentStatus = data.state.status;
                        playExternalBGM(currentStatus);
                    }

                    if (data.type === "sync") {
                        updateLeaderboard(data.players);
                        for (let id in data.players) {
                            if (id === myId) continue;
                            const pData = data.players[id];
                            let pContainer = document.getElementById(id);
                            if (!pContainer) {
                                pContainer = document.createElement("div"); pContainer.id = id; pContainer.className = "player-container other-player";
                                const nDiv = document.createElement("div"); nDiv.className = "player-name"; pContainer.appendChild(nDiv);
                                const bDiv = document.createElement("div"); bDiv.className = "player-body"; pContainer.appendChild(bDiv);
                                stage.appendChild(pContainer);
                            }
                            pContainer.querySelector(".player-name").innerText = pData.name + " (" + pData.deaths + "鍵)";
                            pContainer.querySelector(".player-body").style.backgroundColor = pData.color;
                            pContainer.style.left = pData.x + "px"; pContainer.style.top = pData.y + "px";
                        }
                        const containers = stage.querySelectorAll(".other-player");
                        containers.forEach(c => { if (!data.players[c.id]) { c.remove(); } });
                    }
                };
                ws.onclose = () => { setTimeout(connectToWebSocket, 1000); };
            } catch (e) { setTimeout(connectToWebSocket, 1000); }
        }

        function updateLeaderboard(players) {
            const rankList = document.getElementById("rank-list");
            rankList.innerHTML = "";
            let sorted = Object.values(players).sort((a, b) => a.deaths - b.deaths);
            sorted.forEach((p, index) => {
                const item = document.createElement("div");
                item.className = "rank-item";
                if(p.id === myId) item.style.border = "1px solid #fff";
                item.innerHTML = `<span>${index + 1}位: ${p.name}</span> <span>${p.deaths} 💀</span>`;
                rankList.appendChild(item);
            });
        }

        connectToWebSocket();
        
        function renderAnimationFrame(currentTime) {
            requestAnimationFrame(renderAnimationFrame);
            let deltaTime = currentTime - lastTime;
            lastTime = currentTime;
            accumulatedTime += deltaTime;
            while (accumulatedTime >= fpsInterval) {
                updateGameLogic();
                accumulatedTime -= fpsInterval;
            }
        }
        requestAnimationFrame(renderAnimationFrame);

        function updateGameLogic() {
            gameTick++;
            let moved = false;

            if (currentStatus === "playing") {
                if (keys["ArrowUp"] || keys["w"]) { myPos.y -= SPEED; moved = true; }
                if (keys["ArrowDown"] || keys["s"]) { myPos.y += SPEED; moved = true; }
                if (keys["ArrowLeft"] || keys["a"]) { myPos.x -= SPEED; moved = true; }
                if (keys["ArrowRight"] || keys["d"]) { myPos.x += SPEED; moved = true; }

                if (touchTarget) {
                    const diffX = touchTarget.x - myPos.x; const diffY = touchTarget.y - myPos.y;
                    const distance = Math.sqrt(diffX * diffX + diffY * diffY);
                    if (distance > SPEED) {
                        myPos.x += (diffX / distance) * SPEED; myPos.y += (diffY / distance) * SPEED; moved = true;
                    } else {
                        myPos.x = touchTarget.x; myPos.y = touchTarget.y; moved = true;
                    }
                }
                
                if (myPos.x < 5) myPos.x = 5; 
                if (myPos.x > 775) myPos.x = 775;
                if (myPos.y < 5) myPos.y = 5; 
                if (myPos.y > 375) myPos.y = 375; 
            }

            let myContainer = document.getElementById(myId);
            if (!myContainer) {
                myContainer = document.createElement("div"); myContainer.id = myId; myContainer.className = "player-container";
                const nDiv = document.createElement("div"); nDiv.className = "player-name"; myContainer.appendChild(nDiv);
                const bDiv = document.createElement("div"); bDiv.className = "player-body"; bDiv.style.border = "2px solid #fff"; myContainer.appendChild(bDiv);
                stage.appendChild(myContainer);
            }
            myContainer.querySelector(".player-name").innerText = myName + " (" + myDeaths + "💀)";
            myContainer.querySelector(".player-body").style.backgroundColor = myColor;
            myContainer.style.left = myPos.x + "px"; myContainer.style.top = myPos.y + "px";

            if (ws && ws.readyState === WebSocket.OPEN) {
                if (moved || gameTick % 30 === 0) {
                    try {
                        ws.send(JSON.stringify({ 
                            type: "move", id: myId, name: myName, color: myColor, x: Math.round(myPos.x), y: Math.round(myPos.y), deaths: myDeaths 
                        }));
                        lastSentPos.x = myPos.x; lastSentPos.y = myPos.y;
                    } catch(e) {}
                }
            }

            bgLines.forEach(line => {
                line.x -= line.speed;
                if (line.x < -100) { line.x = 800; line.element.style.top = Math.random() * 400 + "px"; }
                line.element.style.left = line.x + "px";
            });

            obstacles.forEach((bone, index) => {
                bone.x -= 5; 
                bone.element.style.left = bone.x + "px";
                if (currentStatus === "playing" && !isInvincible && bone.x < myPos.x + 20 && bone.x + 15 > myPos.x && bone.y < myPos.y + 20 && bone.y + bone.h > myPos.y) {
                    hitPenalty(myContainer.querySelector(".player-body"), 1);
                }
                if (bone.x < -20) { bone.element.remove(); obstacles.splice(index, 1); }
            });

            lasers.forEach((laser, index) => {
                if (laser.isActive && currentStatus === "playing" && !isInvincible) {
                    if (laser.direction === "vertical") {
                        if (myPos.x + 20 > laser.x && myPos.x < laser.x + laser.w) {
                            hitPenalty(myContainer.querySelector(".player-body"), 1);
                        }
                    } else {
                        if (myPos.y + 20 > laser.y && myPos.y < laser.y + laser.h) { 
                            hitPenalty(myContainer.querySelector(".player-body"), 1); 
                        }
                    }
                }
                laser.life--;
                if (laser.life <= 0) { laser.element.remove(); lasers.splice(index, 1); }
            });
        }

        function hitPenalty(bodyDiv, penaltyAmount) {
            isInvincible = true; 
            myPos = { x: 100, y: 190 }; 
            touchTarget = null;
            myDeaths += penaltyAmount; 
            bodyDiv.style.backgroundColor = "#f00"; 

            setTimeout(() => { 
                bodyDiv.style.backgroundColor = myColor; 
                isInvincible = false;
            }, 200);
        }
    </script>
</body>
</html>
