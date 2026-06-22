(function () {
    "use strict";
    var ZXF = window.ZXF;
    if (!ZXF) return;

    // ========== 玩家形态更新 ==========
    function updatePlayerShape() {
        var player = ZXF.player;
        var wasH = player.h;

        player.ducking = ZXF.input.duckHeld && player.grounded;
        player.w = player.ducking ? player.duckW : player.standW;
        player.h = player.ducking ? player.duckH : player.standH;

        if (player.grounded || player.h !== wasH) {
            player.y = ZXF.GROUND_Y - player.h;
        }
    }

    // ========== 碰撞检测 ==========
    function getPlayerHitBox() {
        var player = ZXF.player;
        if (player.ducking) {
            var d = ZXF.HITBOX_DUCK;
            return {
                x: player.x + d.x,
                y: player.y + d.y,
                w: player.w - d.wPad,
                h: player.h - d.hPad
            };
        }
        var s = ZXF.HITBOX_STAND;
        return {
            x: player.x + s.x,
            y: player.y + s.y,
            w: player.w - s.wPad,
            h: player.h - s.hPad
        };
    }

    function collides(obstacle) {
        var pb = getPlayerHitBox();
        var ob = {
            x: obstacle.x + obstacle.hitPad,
            y: obstacle.y + obstacle.hitPad,
            w: obstacle.w - obstacle.hitPad * 2,
            h: obstacle.h - obstacle.hitPad * 2
        };
        return pb.x < ob.x + ob.w &&
               pb.x + pb.w > ob.x &&
               pb.y < ob.y + ob.h &&
               pb.y + pb.h > ob.y;
    }

    // ========== 生成障碍物 ==========
    var MIN_SPAWN_TIMER = 0.48;
    var MIN_OBSTACLE_GAP = 299;

    function getFlyingY(lane) {
        var cfg = ZXF.FLYING_LANES[lane];
        return ZXF.GROUND_Y - cfg.baseY - Math.random() * cfg.rangeY;
    }

    function spawnObstacle() {
        var game = ZXF.game;
        var W = ZXF.CANVAS_W;
        var groundY = ZXF.GROUND_Y;
        var speed = game.speed;

        // 动态最小间距（速度越快，间距越大）
        var dynamicMinGap = Math.max(MIN_OBSTACLE_GAP, speed * 0.55);

        // 检查与上一个障碍物的间距
        var lastObs = game.obstacles[game.obstacles.length - 1];
        if (lastObs && lastObs.x + lastObs.w > W - dynamicMinGap) {
            ZXF.spawnTimer = 0.1;
            return;
        }

        var flying = game.score > ZXF.FLYING_SCORE_THRESHOLD && Math.random() < ZXF.FLYING_CHANCE;

        if (flying) {
            spawnFlyingObstacle();
        } else {
            spawnGroundObstacle();
        }

        // 动态生成间隔
        var baseTimer = 0.92 + Math.random() * 0.78 - Math.min(game.score / 3200, 0.32);
        var speedAdjustedMin = Math.max(MIN_SPAWN_TIMER, dynamicMinGap / Math.max(speed, 1));
        ZXF.spawnTimer = Math.max(baseTimer, speedAdjustedMin) / ZXF.modifiers.densityMult;
    }

    function spawnFlyingObstacle() {
        var game = ZXF.game;
        var W = ZXF.CANVAS_W;
        var lane = pickFlyingLane();
        var lcfg = ZXF.FLYING_LANES[lane];
        var speedMult = lcfg.speedMin + Math.random() * lcfg.speedRange;
        var cfg = ZXF.OBSTACLE_CFG.spriteBottle;

        game.obstacles.push({
            type: "spriteBottle",
            img: ZXF.images.spriteBottle,
            x: W + 30,
            y: getFlyingY(lane),
            w: cfg.w,
            h: cfg.h,
            hitPad: cfg.hitPad,
            lane: lane,
            speedMultiplier: speedMult
        });

        game.lastObstacleWasGround = false;
    }

    function pickFlyingLane() {
        var game = ZXF.game;
        var roll = Math.random();

        // 如果上一个障碍物是地面障碍物，避免生成 jump 高度（玩家正在跳跃）
        if (game.lastObstacleWasGround) {
            if (roll < 0.55) {
                return "duck";
            }
            return "high";
        }

        // 正常概率分布
        if (roll < 0.45) {
            return "duck";
        } else if (roll < 0.78) {
            return "jump";
        }
        return "high";
    }

    function spawnGroundObstacle() {
        var game = ZXF.game;
        var W = ZXF.CANVAS_W;
        var groundY = ZXF.GROUND_Y;
        var useAlt = Math.random() < 0.5;
        var type = useAlt ? "qiaoleziAlt" : "qiaolezi";
        var cfg = useAlt ? ZXF.OBSTACLE_CFG.qiaoleziAlt : ZXF.OBSTACLE_CFG.qiaolezi;

        game.obstacles.push({
            type: type,
            img: useAlt ? ZXF.images.qiaoleziAlt : ZXF.images.qiaolezi,
            x: W + 30,
            y: groundY - cfg.yOff,
            w: cfg.w,
            h: cfg.h,
            hitPad: cfg.hitPad,
            speedMultiplier: 1
        });

        game.lastObstacleWasGround = true;
    }

    // ========== 粒子效果 ==========
    ZXF.makeDust = function (x, y) {
        var dust = ZXF.game.dust;
        for (var i = 0; i < 6; i += 1) {
            dust.push({
                x: x - Math.random() * 18,
                y: y + Math.random() * 10,
                r: 2 + Math.random() * 4,
                vx: -80 - Math.random() * 120,
                life: 0.35 + Math.random() * 0.22
            });
        }
    };

    // ========== 得分显示 ==========
    function padScore(value) {
        return String(value).padStart(5, "0");
    }

    ZXF.updateScoreDisplay = function () {
        var scoreEl = ZXF.dom.scoreEl;
        var newText = padScore(ZXF.game.score || 0);
        if (scoreEl.textContent !== newText && ZXF.phase === "playing") {
            scoreEl.classList.remove("pop");
            void scoreEl.offsetWidth;
            scoreEl.classList.add("pop");
        }
        scoreEl.textContent = newText;
        ZXF.dom.bestEl.textContent = "BEST " + padScore(ZXF.bestScore);
    };

    // ========== 游戏状态管理 ==========
    ZXF.resetGame = function () {
        var input = ZXF.input;
        var player = ZXF.player;
        var game = ZXF.game;

        // 确保无敌模式关闭
        ZXF.modifiers.invincible = false;
        input.jumpHeld = false;
        input.duckHeld = false;
        player.w = player.standW;
        player.h = player.standH;
        player.y = ZXF.GROUND_Y - player.h;
        player.vy = 0;
        player.grounded = true;
        player.ducking = false;
        player.jumpHold = 0;
        game.speed = ZXF.INITIAL_SPEED * ZXF.modifiers.speedMult;
        game.distance = 0;
        game.score = 0;
        game.obstacles = [];
        game.dust = [];
        game.lastObstacleWasGround = false;
        game.dayTime = 6;
        ZXF.spawnTimer = ZXF.INITIAL_SPAWN_TIMER / ZXF.modifiers.densityMult;
        ZXF.lastTime = performance.now();
    };

    ZXF.startGame = function () {
        if (ZXF.loadedCount !== Object.keys(ZXF.ASSET_PATHS).length) {
            ZXF.dom.overlayText.textContent = "素材还在加载，马上就能跑。";
            return;
        }

        if (ZXF.playBgm) ZXF.playBgm();
        ZXF.resetGame();
        ZXF.phase = "playing";
        ZXF.dom.overlay.classList.add("hidden");
        requestAnimationFrame(ZXF.loop);
    };

    ZXF.endGame = function () {
        if (ZXF.phase === "gameover") return;

        // PK 模式下玩家死亡：不走普通结束流程，进入等待对手状态
        if (ZXF.pk.mode === "racing" && !ZXF.pk.selfFinished) {
            if (ZXF.playDeathSound) ZXF.playDeathSound();
            ZXF.bestScore = Math.max(ZXF.bestScore, ZXF.game.score);
            localStorage.setItem("zhang-runner-best", String(ZXF.bestScore));
            ZXF.updateScoreDisplay();
            if (ZXF.saveScore) ZXF.saveScore(ZXF.game.score);
            ZXF.endPKGame();
            return;
        }

        ZXF.phase = "gameover";
        if (ZXF.playDeathSound) ZXF.playDeathSound();

        ZXF.bestScore = Math.max(ZXF.bestScore, ZXF.game.score);
        localStorage.setItem("zhang-runner-best", String(ZXF.bestScore));
        ZXF.updateScoreDisplay();
        if (ZXF.saveScore) ZXF.saveScore(ZXF.game.score);

        ZXF.dom.overlayText.textContent = "你跑不过我你信吗！按空格 / ↑ / 点击再跑一把。";
        ZXF.dom.startButton.textContent = "重来";
        ZXF.dom.overlay.classList.remove("hidden");
    };

    // ========== 跳跃 ==========
    ZXF.jump = function () {
        if (ZXF.phase === "ready" || ZXF.phase === "gameover") {
            ZXF.startGame();
            return;
        }

        var player = ZXF.player;
        if (player.grounded) {
            ZXF.input.duckHeld = false;
            player.ducking = false;
            player.vy = ZXF.JUMP_VELOCITY;
            player.grounded = false;
            player.jumpHold = ZXF.MAX_JUMP_HOLD;
            ZXF.makeDust(player.x + 36, ZXF.GROUND_Y - 9);
        }
    };

    // ========== 暂停 / 继续 ==========
    ZXF.pauseGame = function () {
        if (ZXF.phase !== "playing") return;
        ZXF._pausedPhase = ZXF.phase;
        ZXF.phase = "paused";
    };

    ZXF.resumeGame = function () {
        if (ZXF.phase !== "paused") return;
        ZXF.phase = ZXF._pausedPhase || "playing";
        ZXF.lastTime = performance.now();
        requestAnimationFrame(ZXF.loop);
    };

    ZXF.restartFromPause = function () {
        ZXF.phase = "ready";
        ZXF.resetGame();
        ZXF.updateScoreDisplay();
        ZXF.drawFrame(0);
    };

    // ========== 3 秒倒计时 ==========
    ZXF.startCountdown = function (callback) {
        var overlay = document.getElementById("countdownOverlay");
        var text = document.getElementById("countdownText");
        if (!overlay || !text) {
            if (callback) callback();
            return;
        }

        var count = 3;
        var savedPhase = ZXF.phase;
        overlay.classList.remove("hidden");
        ZXF.phase = "countdown";

        function tick() {
            if (count > 0) {
                text.textContent = count;
                text.style.animation = "none";
                void text.offsetWidth;
                text.style.animation = "countBounce 0.6s ease";
                count--;
                setTimeout(tick, 900);
            } else {
                text.textContent = "GO!";
                text.style.animation = "none";
                void text.offsetWidth;
                text.style.animation = "countBounce 0.6s ease";
                setTimeout(function () {
                    overlay.classList.add("hidden");
                    text.textContent = "3";
                    ZXF.phase = savedPhase;
                    ZXF.lastTime = performance.now();
                    if (callback) callback();
                }, 600);
            }
        }

        tick();
    };

    // ========== 下蹲 ==========
    ZXF.setDuck = function (ducking) {
        ZXF.input.duckHeld = ducking;
        if (ZXF.phase !== "playing") return;

        var player = ZXF.player;
        if (!player.grounded && ducking && player.vy < 900) {
            player.vy += 420;
        }
    };

    // ========== 配置玩家精灵尺寸 ==========
    ZXF.configurePlayerSprites = function () {
        var player = ZXF.player;
        var imgs = ZXF.images;

        if (imgs.runner && imgs.runner.naturalWidth) {
            player.standH = 141;
            player.standW = Math.round(player.standH * imgs.runner.naturalWidth / imgs.runner.naturalHeight);
        }
        if (imgs.duck && imgs.duck.naturalWidth) {
            player.duckH = 97;
            player.duckW = Math.round(player.duckH * imgs.duck.naturalWidth / imgs.duck.naturalHeight);
        }
    };

    // ========== 主更新循环 ==========
    // ========== PK 辅助函数 ==========

    // PK 同步：POST 自己进度 + GET 对手进度
    ZXF.pk.syncPKUpdate = function () {
        var game = ZXF.game;
        var pk = ZXF.pk;

        if (!ZXF.api) return;

        var progress = {
            score: game.score,
            distance: game.distance,
            speed: game.speed,
            alive: !pk.selfFinished,
            finished: pk.selfFinished
        };

        ZXF.api.syncPKProgress(ZXF.userId, pk.matchId, progress).then(function () {
            // POST 成功后再 GET 对手进度
            return ZXF.api.getOpponentProgress(pk.matchId, ZXF.userId);
        }).then(function (data) {
            if (data && !data.error) {
                pk.opponent.score = data.opponentScore || 0;
                pk.opponent.distance = data.opponentDistance || 0;
                pk.opponent.alive = data.opponentAlive !== false;
                pk.opponent.finished = data.opponentFinished === true;
                pk.opponent.lastUpdate = Date.now();

                // 如果对手已结束且自己还活着，标记我们领先
                if (pk.opponent.finished && !pk.selfFinished) {
                    // 继续跑，等自己死了再结算
                }

                // 拿到最新对手数据后立即检查是否双方都已结束
                ZXF.pk.checkPKResult();
            }
        }).catch(function () {
            // 网络错误，忽略本次同步
        });
    };

    // 检查 PK 是否双方都已结束
    ZXF.pk.checkPKResult = function () {
        var pk = ZXF.pk;
        if (!pk.selfFinished) return;

        // 对手数据超时（超过 15s 无更新），强制结算
        var opponentStale = Date.now() - pk.opponent.lastUpdate > 15000;
        if (opponentStale) {
            ZXF.pk.finalizePKMatch();
            return;
        }

        // 对手已结束（finished 或 !alive）→ 结算
        if (pk.opponent.finished || !pk.opponent.alive) {
            ZXF.pk.finalizePKMatch();
        }
        // 否则对手还在跑，继续等待
    };

    // PK 结算
    ZXF.pk.finalizePKMatch = function () {
        var pk = ZXF.pk;
        var myDistance = ZXF.game.distance;
        var oppDistance = pk.opponent.distance;
        var myScore = ZXF.game.score;
        var oppScore = pk.opponent.score;

        // 按距离判断胜负
        if (myDistance > oppDistance) {
            pk.result = "win";
        } else if (myDistance < oppDistance) {
            pk.result = "lose";
        } else {
            pk.result = "draw";
        }

        pk.mode = "result";
        ZXF.phase = "gameover";

        // 提交分数到排行榜
        if (ZXF.api && ZXF.userId) {
            ZXF.api.submitScore(ZXF.userId, myScore, ZXF.modifiers.speedMult !== 1 || ZXF.modifiers.densityMult !== 1 || ZXF.modifiers.invincible);
        }

        // 显示 PK 结果 UI（传入双方距离）
        if (ZXF.showPKResult) {
            ZXF.showPKResult(pk.result, myScore, oppScore, pk.opponentNickname, myDistance, oppDistance);
        }
    };

    // 玩家在 PK 中死亡
    ZXF.endPKGame = function () {
        var pk = ZXF.pk;
        pk.selfFinished = true;

        // 发送最终同步
        if (ZXF.api) {
            ZXF.api.syncPKProgress(ZXF.userId, pk.matchId, {
                score: ZXF.game.score,
                distance: ZXF.game.distance,
                speed: ZXF.game.speed,
                alive: false,
                finished: true
            }).catch(function () {});
        }

        // 继续游戏循环等待对手
        ZXF.phase = "playing";
        ZXF.updateScoreDisplay();

        // 显示等待对手的提示
        if (ZXF.showPKWaiting) {
            ZXF.showPKWaiting(pk.opponentNickname);
        }
    };

    // 启动 PK 比赛（倒计时后调用）
    ZXF.pk.startPKRace = function () {
        var pk = ZXF.pk;

        // 强制重置所有关键状态
        ZXF.modifiers.invincible = false;
        pk.mode = "racing";
        pk.selfFinished = false;
        pk.syncTimer = 0;
        pk.result = null;
        pk.opponent.score = 0;
        pk.opponent.distance = 0;
        pk.opponent.alive = true;
        pk.opponent.finished = false;
        pk.opponent.lastUpdate = Date.now();

        // 隐藏所有可能阻挡的弹窗
        ZXF.dom.overlay.classList.add("hidden");
        var els = document.querySelectorAll(
            ".pk-result-overlay,.pk-matchmaking-overlay,.pk-match-found-overlay," +
            ".pk-waiting-overlay,.chat-modal,.player-popup,.profile-modal,.settings-modal,.help-modal"
        );
        for (var i = 0; i < els.length; i++) {
            els[i].classList.add("hidden");
        }
        // 确保 countdownOverlay 也隐藏
        var cdOv = document.getElementById("countdownOverlay");
        if (cdOv) cdOv.classList.add("hidden");

        ZXF.resetGame();
        ZXF.phase = "playing";
        ZXF.lastTime = performance.now();

        if (ZXF.playBgm) ZXF.playBgm();

        // 先渲染一帧，再启动循环
        ZXF.drawFrame(0);
        requestAnimationFrame(ZXF.loop);
    };

    ZXF.update = function (dt) {
        var player = ZXF.player;
        var game = ZXF.game;
        var input = ZXF.input;
        var groundY = ZXF.GROUND_Y;

        // PK 模式下自己已死亡，跳过物理但仍更新障碍物和同步
        if (ZXF.pk.selfFinished) {
            // 仅更新障碍物位置（保持画面滚动）
            for (var i = 0; i < game.obstacles.length; i++) {
                game.obstacles[i].x -= game.speed * (game.obstacles[i].speedMultiplier || 1) * dt;
            }
            game.obstacles = game.obstacles.filter(function (obs) {
                return obs.x + obs.w > -40;
            });

            // PK 同步
            ZXF.pk.syncTimer += dt;
            if (ZXF.pk.syncTimer >= ZXF.pk.syncInterval) {
                ZXF.pk.syncTimer = 0;
                ZXF.pk.syncPKUpdate();
            }

            // 检查对手是否也结束了
            ZXF.pk.checkPKResult();
            return;
        }

        updatePlayerShape();

        // 跳跃蓄力
        if (input.jumpHeld && player.jumpHold > 0 && player.vy < 0 && !input.duckHeld) {
            player.vy += ZXF.JUMP_HOLD_FORCE * dt;
            player.jumpHold -= dt;
        } else {
            player.jumpHold = 0;
        }

        // 重力
        player.vy += (input.duckHeld && !player.grounded ? ZXF.FAST_DROP_GRAVITY : ZXF.GRAVITY) * dt;
        player.y += player.vy * dt;

        // 落地检测
        if (player.y >= groundY - player.h) {
            player.y = groundY - player.h;
            player.vy = 0;
            player.grounded = true;
            player.jumpHold = 0;
            updatePlayerShape();
        }

        // 速度与分数（分段加速，越跑越快）
        var speedStage = 1 + Math.floor(game.score / 800);
        var stageAccel = ZXF.SPEED_ACCEL * (1 + speedStage * 0.5) * ZXF.modifiers.speedMult;
        var speedCap = ZXF.MAX_SPEED * ZXF.modifiers.speedMult;
        game.speed = Math.min(speedCap, game.speed + stageAccel * dt);
        game.distance += game.speed * dt;
        game.dayTime += dt;
        game.score = Math.floor(game.distance / ZXF.SCORE_DIVISOR);

        // 生成障碍物
        ZXF.spawnTimer -= dt;
        if (ZXF.spawnTimer <= 0) {
            spawnObstacle();
        }

        // 更新障碍物位置
        for (var i = 0; i < game.obstacles.length; i++) {
            game.obstacles[i].x -= game.speed * (game.obstacles[i].speedMultiplier || 1) * dt;
        }
        game.obstacles = game.obstacles.filter(function (obs) {
            return obs.x + obs.w > -40;
        });

        // 更新粒子
        for (var j = 0; j < game.dust.length; j++) {
            game.dust[j].x += game.dust[j].vx * dt;
            game.dust[j].life -= dt;
        }
        game.dust = game.dust.filter(function (dot) {
            return dot.life > 0;
        });

        // 碰撞检测（无敌模式下跳过）
        if (!ZXF.modifiers.invincible) {
            for (var k = 0; k < game.obstacles.length; k++) {
                if (collides(game.obstacles[k])) {
                    ZXF.endGame();
                    return;
                }
            }
        }

        // PK 同步（仅在 racing 模式下）
        if (ZXF.pk.mode === "racing") {
            ZXF.pk.syncTimer += dt;
            if (ZXF.pk.syncTimer >= ZXF.pk.syncInterval) {
                ZXF.pk.syncTimer = 0;
                ZXF.pk.syncPKUpdate();
            }
        }
    };
})();
