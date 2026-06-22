(function () {
    "use strict";
    var ZXF = window.ZXF;
    if (!ZXF) return;

    // ========== DOM 引用 ==========
    ZXF.dom = {
        canvas: document.getElementById("game"),
        scoreEl: document.getElementById("score"),
        bestEl: document.getElementById("best"),
        overlay: document.getElementById("overlay"),
        overlayText: document.getElementById("overlayText"),
        startButton: document.getElementById("startButton"),
        jumpButton: document.getElementById("jumpButton"),
        duckButton: document.getElementById("duckButton")
    };

    // ========== Canvas 上下文 ==========
    ZXF.ctx = ZXF.dom.canvas.getContext("2d");
    ZXF.dom.canvas.width = ZXF.CANVAS_W;
    ZXF.dom.canvas.height = ZXF.CANVAS_H;

    // ========== 音效 ==========
    var bgm = new Audio("assets/bgm.m4a");
    bgm.loop = true;

    var deathSound = new Audio("assets/death.mp3");

    var bgmStarted = false;

    function applySoundSettings() {
        var s = ZXF.sound;
        bgm.volume = s.bgmMuted ? 0 : s.bgmVolume;
        deathSound.volume = s.sfxMuted ? 0 : s.sfxVolume;
    }
    applySoundSettings();

    // 音量更新函数
    ZXF.setBgmVolume = function (v) {
        ZXF.sound.bgmVolume = v;
        ZXF.sound.bgmMuted = false;
        applySoundSettings();
    };
    ZXF.setSfxVolume = function (v) {
        ZXF.sound.sfxVolume = v;
        ZXF.sound.sfxMuted = false;
        applySoundSettings();
    };
    ZXF.toggleBgmMute = function () {
        ZXF.sound.bgmMuted = !ZXF.sound.bgmMuted;
        applySoundSettings();
        return ZXF.sound.bgmMuted;
    };
    ZXF.toggleSfxMute = function () {
        ZXF.sound.sfxMuted = !ZXF.sound.sfxMuted;
        applySoundSettings();
        return ZXF.sound.sfxMuted;
    };

    // 页面首次交互时尝试启动 BGM（满足浏览器自动播放策略）
    function tryStartBgm() {
        if (bgmStarted) return;
        bgmStarted = true;
        bgm.play().catch(function () {});
    }

    document.addEventListener("pointerdown", tryStartBgm, { once: true });
    document.addEventListener("keydown", tryStartBgm, { once: true });

    ZXF.playBgm = function () {
        if (!bgm.paused) return;
        bgmStarted = true;
        bgm.play().catch(function () {});
    };

    ZXF.pauseBgm = function () {
        bgm.pause();
    };

    ZXF.toggleBgm = function () {
        if (bgm.paused) {
            ZXF.playBgm();
            return true;
        } else {
            ZXF.pauseBgm();
            return false;
        }
    };

    ZXF.isBgmPlaying = function () {
        return !bgm.paused;
    };

    ZXF.playDeathSound = function () {
        deathSound.currentTime = 0;
        deathSound.play().catch(function () {});
    };

    // ========== 最高分 ==========
    ZXF.bestScore = Number(localStorage.getItem("zhang-runner-best") || 0);

    // ========== 得分记录 ==========
    var SCORE_HISTORY_KEY = "zhang-runner-history";
    var MAX_HISTORY = 20;

    function getScoreHistory() {
        try {
            return JSON.parse(localStorage.getItem(SCORE_HISTORY_KEY) || "[]");
        } catch (e) {
            return [];
        }
    }

    ZXF.saveScore = function (score) {
        if (score <= 0) return;
        // 本地记录（保留作为备份）
        var history = getScoreHistory();
        history.push({ score: score, date: Date.now() });
        history.sort(function (a, b) { return b.score - a.score; });
        if (history.length > MAX_HISTORY) history.length = MAX_HISTORY;
        localStorage.setItem(SCORE_HISTORY_KEY, JSON.stringify(history));
        renderScoreHistory();

        // 在线提交分数
        if (ZXF.api && ZXF.userId && ZXF.pk.mode !== "racing") {
            var modifiersUsed = ZXF.modifiers.speedMult !== 1 || ZXF.modifiers.densityMult !== 1 || ZXF.modifiers.invincible;
            ZXF.api.submitScore(ZXF.userId, score, modifiersUsed).then(function (result) {
                if (result && !result.error && result.rank) {
                    // 可选：显示排名提示
                }
                // 提交后刷新排行榜
                if (ZXF.fetchLeaderboard) ZXF.fetchLeaderboard();
            }).catch(function () {});
        }
    };

    function renderScoreHistory() {
        var history = getScoreHistory();
        var list = document.getElementById("historyList");
        var count = document.getElementById("historyCount");
        if (!list || !count) return;
        count.textContent = history.length;
        list.innerHTML = history.map(function (entry, i) {
            var d = new Date(entry.date);
            var dateStr = d.getMonth() + 1 + "/" + d.getDate() + " " +
                          String(d.getHours()).padStart(2, "0") + ":" +
                          String(d.getMinutes()).padStart(2, "0");
            return "<li><span class=\"hist-rank\">#" + (i + 1) + "</span>" +
                   "<span class=\"hist-score\">" + String(entry.score).padStart(5, "0") + "</span>" +
                   "<span class=\"hist-date\">" + dateStr + "</span></li>";
        }).join("") || "<li class=\"hist-empty\">暂无记录</li>";
    }

    // ========== 在线排行榜 ==========
    ZXF.currentLeaderboardTab = true; // true = 纯净化

    ZXF.fetchLeaderboard = function () {
        if (!ZXF.api) return;
        var pureOnly = ZXF.currentLeaderboardTab;
        ZXF.api.getLeaderboard(20, 0, pureOnly).then(function (data) {
            if (data && !data.error && data.entries) {
                renderOnlineLeaderboard(data.entries, data.total);
            }
        }).catch(function () {});
    };

    function renderOnlineLeaderboard(entries, total) {
        var list = document.getElementById("leaderboardList");
        var lbCount = document.getElementById("lbCount");
        if (!list) return;
        if (lbCount) lbCount.textContent = total || entries.length;

        if (!entries.length) {
            list.innerHTML = "<li class=\"hist-empty\">暂无排行记录</li>";
            return;
        }

        list.innerHTML = entries.map(function (entry) {
            var isMe = ZXF.userId && entry.userId === ZXF.userId;
            var rowClass = isMe ? "lb-row lb-is-me" : "lb-row";
            var rankIcon = entry.rank <= 3
                ? ["🥇", "🥈", "🥉"][entry.rank - 1]
                : "#" + entry.rank;
            return "<li class=\"" + rowClass + "\">" +
                   "<span class=\"lb-rank\">" + rankIcon + "</span>" +
                   "<span class=\"lb-nickname\">" + escapeHtml(entry.nickname) + "</span>" +
                   "<span class=\"lb-score\">" + String(entry.score).padStart(5, "0") + "</span>" +
                   "</li>";
        }).join("");
    }

    function escapeHtml(str) {
        var div = document.createElement("div");
        div.appendChild(document.createTextNode(str));
        return div.innerHTML;
    }

    // ========== PK 流程状态机 ==========
    var pkMatchmakingPollTimer = null;
    var pkMatchmakingCancelTimer = null;

    function stopPKPolling() {
        if (pkMatchmakingPollTimer) {
            clearInterval(pkMatchmakingPollTimer);
            pkMatchmakingPollTimer = null;
        }
        if (pkMatchmakingCancelTimer) {
            clearTimeout(pkMatchmakingCancelTimer);
            pkMatchmakingCancelTimer = null;
        }
    }

    ZXF.startPKMatchmaking = function () {
        if (!ZXF.api || !ZXF.userId) return;
        if (ZXF.phase !== "ready" && ZXF.phase !== "gameover") return;

        ZXF.pk.mode = "matchmaking";
        ZXF.pk.matchId = null;
        ZXF.pk.opponentId = null;
        ZXF.pk.opponentNickname = null;
        ZXF.pk.result = null;
        ZXF.pk.selfFinished = false;

        var overlay = document.getElementById("pkMatchmakingOverlay");
        var text = document.getElementById("pkMatchmakingText");
        if (overlay) overlay.classList.remove("hidden");
        if (text) text.textContent = "正在匹配对手...";

        var startTime = Date.now();
        var joined = false;

        function doJoin() {
            ZXF.api.joinPKQueue(ZXF.userId).then(function (result) {
                if (ZXF.pk.mode !== "matchmaking") return;

                if (result && !result.error) {
                    if (result.status === "matched") {
                        // 匹配成功！
                        ZXF.pk.matchId = result.matchId;
                        ZXF.pk.opponentId = result.opponentId;
                        ZXF.pk.opponentNickname = result.opponentNickname || "对手";
                        stopPKPolling();
                        ZXF.pk.mode = "matched";
                        if (overlay) overlay.classList.add("hidden");
                        ZXF.startPKCountdown();
                    } else if (result.status === "waiting") {
                        joined = true;
                        if (text) {
                            var elapsed = Math.floor((Date.now() - startTime) / 1000);
                            text.textContent = "正在匹配对手... (已等待 " + elapsed + "s)";
                        }
                    }
                }
            }).catch(function () {});
        }

        // 立即加入队列，然后每 2s 轮询
        doJoin();
        pkMatchmakingPollTimer = setInterval(doJoin, 2000);

        // 60s 超时
        pkMatchmakingCancelTimer = setTimeout(function () {
            if (ZXF.pk.mode === "matchmaking") {
                ZXF.cancelPKMatchmaking();
                if (text) text.textContent = "匹配超时，请稍后重试";
                setTimeout(function () {
                    if (overlay) overlay.classList.add("hidden");
                }, 2000);
            }
        }, 60000);
    };

    ZXF.cancelPKMatchmaking = function () {
        stopPKPolling();
        if (ZXF.api && ZXF.userId) {
            ZXF.api.cancelPKQueue(ZXF.userId).catch(function () {});
        }
        ZXF.pk.mode = "solo";
        var overlay = document.getElementById("pkMatchmakingOverlay");
        if (overlay) overlay.classList.add("hidden");
    };

    ZXF.startPKCountdown = function () {
        ZXF.pk.mode = "countdown";
        var overlay = document.getElementById("pkMatchmakingOverlay");
        if (overlay) overlay.classList.add("hidden");

        // 显示匹配成功信息
        var matchFoundOverlay = document.getElementById("pkMatchFoundOverlay");
        var matchFoundText = document.getElementById("pkMatchFoundText");
        if (matchFoundOverlay && matchFoundText) {
            matchFoundText.textContent = "找到对手: " + (ZXF.pk.opponentNickname || "对手");
            matchFoundOverlay.classList.remove("hidden");
        }

        // 隐藏普通 overlay
        ZXF.dom.overlay.classList.add("hidden");

        // 使用游戏内倒计时
        ZXF.startCountdown(function () {
            if (matchFoundOverlay) matchFoundOverlay.classList.add("hidden");
            ZXF.pk.startPKRace();
        });
    };

    ZXF.showPKResult = function (result, myScore, oppScore, oppName) {
        var overlay = document.getElementById("pkResultOverlay");
        var title = document.getElementById("pkResultTitle");
        var detail = document.getElementById("pkResultDetail");

        if (!overlay) return;
        overlay.classList.remove("hidden");

        if (title) {
            if (result === "win") {
                title.textContent = "你赢了! 🎉";
                title.className = "pk-result-win";
            } else if (result === "lose") {
                title.textContent = "你输了! 💀";
                title.className = "pk-result-lose";
            } else {
                title.textContent = "平局! 🤝";
                title.className = "pk-result-draw";
            }
        }

        if (detail) {
            detail.textContent = "你的分数: " + String(myScore).padStart(5, "0") +
                "  |  " + (oppName || "对手") + ": " + String(oppScore).padStart(5, "0");
        }

        // 刷新排行榜
        if (ZXF.fetchLeaderboard) ZXF.fetchLeaderboard();
    };

    ZXF.resetToSoloMode = function () {
        ZXF.pk.mode = "solo";
        ZXF.pk.matchId = null;
        ZXF.pk.opponentId = null;
        ZXF.pk.opponentNickname = null;
        ZXF.pk.isFriendPK = false;
        ZXF.pk.result = null;
        ZXF.pk.selfFinished = false;
        ZXF.pk.opponent = { score: 0, distance: 0, alive: true, finished: false, lastUpdate: 0 };
        ZXF.phase = "ready";
        ZXF.resetGame();
        ZXF.updateScoreDisplay();
        ZXF.drawFrame(0);

        var resultOverlay = document.getElementById("pkResultOverlay");
        if (resultOverlay) resultOverlay.classList.add("hidden");
        var matchFoundOverlay = document.getElementById("pkMatchFoundOverlay");
        if (matchFoundOverlay) matchFoundOverlay.classList.add("hidden");

        ZXF.dom.overlay.classList.remove("hidden");
        ZXF.dom.overlayText.textContent = "长按跳更高，按 ↓ 下蹲躲避雪碧<br>点击按钮或按空格开始游戏";
        ZXF.dom.startButton.textContent = "开始游戏";
    };

    function clearScoreHistory() {
        localStorage.removeItem(SCORE_HISTORY_KEY);
        renderScoreHistory();
    }

    // ========== 资源加载 ==========
    ZXF.loadedCount = 0;
    var assetKeys = Object.keys(ZXF.ASSET_PATHS);

    function loadAssets() {
        assetKeys.forEach(function (key) {
            var img = new Image();
            img.onload = onAssetLoad;
            img.onerror = onAssetLoad;
            img.src = ZXF.ASSET_PATHS[key];
            ZXF.images[key] = img;
        });
    }

    function onAssetLoad() {
        ZXF.loadedCount += 1;
        if (ZXF.loadedCount === assetKeys.length) {
            ZXF.configurePlayerSprites();
            updatePlayerShape();
            ZXF.drawFrame(0);
        }
    }

    function updatePlayerShape() {
        var player = ZXF.player;
        player.w = player.standW;
        player.h = player.standH;
        player.y = ZXF.GROUND_Y - player.h;
    }

    // ========== 游戏主循环 ==========
    ZXF.loop = function (now) {
        if (ZXF.phase !== "playing") return;

        var dt = Math.min((now - ZXF.lastTime) / 1000, ZXF.MAX_DT);
        ZXF.lastTime = now;

        ZXF.update(dt);
        ZXF.drawFrame(dt);
        ZXF.updateScoreDisplay();

        if (ZXF.phase === "playing") {
            requestAnimationFrame(ZXF.loop);
        }
    };

    // ========== 修改器面板 ==========
    function initModifierPanel() {
        var panel = document.getElementById("modifierPanel");
        if (!panel) return;

        // 折叠/展开
        var toggle = document.getElementById("modifierToggle");
        var body = document.getElementById("modifierBody");
        toggle.addEventListener("click", function () {
            var collapsed = body.classList.toggle("collapsed");
            toggle.querySelector(".toggle-arrow").textContent = collapsed ? "▶" : "▼";
        });

        // 选项按钮事件委托
        panel.addEventListener("click", function (e) {
            var btn = e.target.closest(".mod-option");
            if (!btn) return;
            var group = btn.closest(".modifier-options");
            var key = group.getAttribute("data-key");
            var value = parseFloat(btn.getAttribute("data-value"));

            ZXF.modifiers[key] = value;

            group.querySelectorAll(".mod-option").forEach(function (b) {
                b.classList.remove("active");
            });
            btn.classList.add("active");
        });

        // 无敌模式开关
        var invToggle = document.getElementById("invincibleToggle");
        if (invToggle) {
            invToggle.addEventListener("change", function () {
                ZXF.modifiers.invincible = invToggle.checked;
            });
        }
    }

    // ========== 帮助弹窗 ==========
    function initHelpModal() {
        var modal = document.getElementById("helpModal");
        var helpBtn = document.getElementById("helpButton");
        var closeBtn = document.getElementById("helpClose");
        var backdrop = modal ? modal.querySelector(".help-backdrop") : null;
        if (!modal || !helpBtn) return;

        var wasPlaying = false;

        function openModal() {
            wasPlaying = ZXF.phase === "playing";
            if (wasPlaying) ZXF.pauseGame();
            modal.classList.remove("hidden");
        }
        function closeModal() {
            modal.classList.add("hidden");
            if (wasPlaying && ZXF.phase === "paused") {
                wasPlaying = false;
                ZXF.startCountdown(function () {
                    ZXF.resumeGame();
                });
            }
        }

        helpBtn.addEventListener("click", function (e) {
            e.stopPropagation();
            openModal();
        });

        if (closeBtn) {
            closeBtn.addEventListener("click", function (e) {
                e.stopPropagation();
                closeModal();
            });
        }

        if (backdrop) {
            backdrop.addEventListener("click", function (e) {
                e.stopPropagation();
                closeModal();
            });
        }

        // 阻止帮助弹窗内的点击事件传递到画布（避免触发跳跃）
        modal.addEventListener("pointerdown", function (e) {
            e.stopPropagation();
        });

        // ESC 关闭
        document.addEventListener("keydown", function (e) {
            if (e.key === "Escape" && !modal.classList.contains("hidden")) {
                closeModal();
            }
        });
    }

    // ========== 设置面板 ==========
    function initSettingsModal() {
        var modal = document.getElementById("settingsModal");
        var btn = document.getElementById("settingsButton");
        var resumeBtn = document.getElementById("resumeButton");
        var restartBtn = document.getElementById("restartButton");
        var bgmSlider = document.getElementById("bgmVolume");
        var sfxSlider = document.getElementById("sfxVolume");
        var bgmLabel = document.getElementById("bgmVolumeLabel");
        var sfxLabel = document.getElementById("sfxVolumeLabel");

        if (!modal || !btn) return;

        function openSettings() {
            if (ZXF.phase === "playing") {
                ZXF.pauseGame();
            }
            modal.classList.remove("hidden");
        }

        function closeSettings() {
            modal.classList.add("hidden");
            if (ZXF.phase === "paused") {
                ZXF.resumeGame();
            }
        }

        btn.addEventListener("click", function (e) {
            e.stopPropagation();
            openSettings();
        });

        // 面板内阻止事件冒泡到画布
        modal.addEventListener("pointerdown", function (e) {
            e.stopPropagation();
        });

        if (resumeBtn) {
            resumeBtn.addEventListener("click", function (e) {
                e.stopPropagation();
                modal.classList.add("hidden");
                ZXF.startCountdown(function () {
                    ZXF.resumeGame();
                });
            });
        }

        if (restartBtn) {
            restartBtn.addEventListener("click", function (e) {
                e.stopPropagation();
                ZXF.restartFromPause();
                modal.classList.add("hidden");
                ZXF.startCountdown(function () {
                    ZXF.startGame();
                });
            });
        }

        // 音量滑块
        if (bgmSlider) {
            bgmSlider.value = ZXF.sound.bgmVolume * 100;
            bgmSlider.addEventListener("input", function () {
                var v = bgmSlider.value / 100;
                ZXF.setBgmVolume(v);
                if (bgmLabel) bgmLabel.textContent = bgmSlider.value + "%";
            });
        }
        if (sfxSlider) {
            sfxSlider.value = ZXF.sound.sfxVolume * 100;
            sfxSlider.addEventListener("input", function () {
                var v = sfxSlider.value / 100;
                ZXF.setSfxVolume(v);
                if (sfxLabel) sfxLabel.textContent = sfxSlider.value + "%";
            });
        }

        // ESC 关闭
        document.addEventListener("keydown", function (e) {
            if (e.key === "Escape" && !modal.classList.contains("hidden")) {
                closeSettings();
            }
        });

        // 防止设置面板打开时触发游戏控制
        window.addEventListener("keydown", function (e) {
            if (!modal.classList.contains("hidden") &&
                (e.code === "Space" || e.code === "ArrowUp" || e.code === "ArrowDown")) {
                e.stopImmediatePropagation();
            }
        }, true);
    }

    // ========== 得分记录面板 ==========
    function initScoreHistoryPanel() {
        var toggle = document.getElementById("historyToggle");
        var body = document.getElementById("historyBody");
        if (!toggle || !body) return;

        toggle.addEventListener("click", function () {
            var expanded = body.classList.toggle("hidden");
            toggle.querySelector(".toggle-arrow").textContent = expanded ? "▶" : "▼";
        });

        var clearBtn = document.getElementById("clearHistory");
        if (clearBtn) {
            clearBtn.addEventListener("click", function () {
                clearScoreHistory();
            });
        }
    }

    // ========== 豆瓣二维码弹窗 ==========
    function initDouyinModal() {
        var modal = document.getElementById("douyinModal");
        var link = document.getElementById("douyinLink");
        var closeBtn = document.getElementById("douyinClose");
        var backdrop = modal ? modal.querySelector(".douyin-backdrop") : null;

        if (!modal || !link) return;

        var wasPlaying = false;

        link.addEventListener("click", function (e) {
            e.preventDefault();
            wasPlaying = ZXF.phase === "playing";
            if (wasPlaying) ZXF.pauseGame();
            modal.classList.remove("hidden");
        });

        function closeModal() {
            modal.classList.add("hidden");
            if (wasPlaying && ZXF.phase === "paused") {
                wasPlaying = false;
                ZXF.startCountdown(function () {
                    ZXF.resumeGame();
                });
            }
        }

        if (closeBtn) {
            closeBtn.addEventListener("click", closeModal);
        }
        if (backdrop) {
            backdrop.addEventListener("click", closeModal);
        }

        document.addEventListener("keydown", function (e) {
            if (e.key === "Escape" && !modal.classList.contains("hidden")) {
                closeModal();
            }
        });
    }

    // ========== 个人中心 + 好友 ==========
    function initProfileUI() {
        var modal = document.getElementById("profileModal");
        var nickBtn = document.getElementById("nicknameDisplay");
        var closeBtn = document.getElementById("profileClose");
        var backdrop = modal ? modal.querySelector(".profile-backdrop") : null;
        var copyBtn = document.getElementById("copyUserId");
        var saveNickBtn = document.getElementById("saveNickname");
        var addFriendBtn = document.getElementById("addFriendBtn");
        var nickInput = document.getElementById("profileNicknameInput");

        if (!modal) return;

        var wasPlaying = false;

        function openProfile() {
            wasPlaying = ZXF.phase === "playing";
            if (wasPlaying) ZXF.pauseGame();
            modal.classList.remove("hidden");
            renderProfile();
        }

        function closeProfile() {
            modal.classList.add("hidden");
            if (wasPlaying && ZXF.phase === "paused") {
                wasPlaying = false;
                ZXF.startCountdown(function () { ZXF.resumeGame(); });
            }
        }

        if (nickBtn) {
            nickBtn.addEventListener("click", function (e) {
                e.stopPropagation();
                openProfile();
            });
        }

        if (closeBtn) {
            closeBtn.addEventListener("click", function (e) {
                e.stopPropagation();
                closeProfile();
            });
        }

        if (backdrop) {
            backdrop.addEventListener("click", function (e) {
                e.stopPropagation();
                closeProfile();
            });
        }

        // 阻止弹窗内点击冒泡
        modal.addEventListener("pointerdown", function (e) { e.stopPropagation(); });

        // 复制 ID
        if (copyBtn) {
            copyBtn.addEventListener("click", function () {
                var uidEl = document.getElementById("profileUserId");
                if (!uidEl) return;
                var text = uidEl.textContent;
                if (navigator.clipboard) {
                    navigator.clipboard.writeText(text).then(function () {
                        copyBtn.textContent = "已复制!";
                        setTimeout(function () { copyBtn.textContent = "复制"; }, 1500);
                    });
                }
            });
        }

        // 保存昵称
        if (saveNickBtn && nickInput) {
            saveNickBtn.addEventListener("click", function () {
                var newNick = nickInput.value.trim();
                if (!newNick || newNick.length < 1 || newNick.length > 20) return;
                if (!ZXF.api || !ZXF.userId) return;
                ZXF.api.updateNickname(ZXF.userId, newNick).then(function (result) {
                    if (result && !result.error) {
                        ZXF.nickname = result.nickname;
                        localStorage.setItem('zxf_nickname', result.nickname);
                        var display = document.getElementById("nicknameDisplay");
                        if (display) display.textContent = result.nickname;
                        saveNickBtn.textContent = "已保存!";
                        setTimeout(function () { saveNickBtn.textContent = "保存"; }, 1500);
                        if (ZXF.fetchLeaderboard) ZXF.fetchLeaderboard();
                    }
                }).catch(function () {});
            });
        }

        // 添加好友
        if (addFriendBtn) {
            addFriendBtn.addEventListener("click", function () {
                var input = document.getElementById("addFriendInput");
                var msg = document.getElementById("addFriendMsg");
                if (!input || !msg || !ZXF.api || !ZXF.userId) return;
                var friendId = input.value.trim();
                if (!friendId) return;
                ZXF.api.addFriend(ZXF.userId, friendId).then(function (result) {
                    msg.classList.remove("hidden");
                    if (result && !result.error) {
                        msg.textContent = "已添加好友: " + (result.friend ? result.friend.nickname : friendId);
                        msg.className = "profile-add-msg success";
                        input.value = "";
                        renderFriendsList();
                    } else {
                        msg.textContent = result.error === "user_not_found" ? "未找到该用户" :
                                         result.error === "cannot_add_self" ? "不能添加自己" : "添加失败";
                        msg.className = "profile-add-msg error";
                    }
                }).catch(function () {
                    msg.classList.remove("hidden");
                    msg.textContent = "网络错误";
                    msg.className = "profile-add-msg error";
                });
            });
        }

        // ESC 关闭
        document.addEventListener("keydown", function (e) {
            if (e.key === "Escape" && !modal.classList.contains("hidden")) {
                closeProfile();
            }
        });
    }

    function renderProfile() {
        var uidEl = document.getElementById("profileUserId");
        var nickInput = document.getElementById("profileNicknameInput");
        var bestEl = document.getElementById("profileBestScore");
        if (uidEl) uidEl.textContent = ZXF.userId || "";
        if (nickInput) nickInput.value = ZXF.nickname || "";
        if (bestEl) bestEl.textContent = String(ZXF.bestScore || 0).padStart(5, "0");
        renderFriendsList();
    }

    function renderFriendsList() {
        var container = document.getElementById("friendsListContainer");
        var countEl = document.getElementById("friendCount");
        if (!container || !ZXF.api || !ZXF.userId) return;

        ZXF.api.getFriendsList(ZXF.userId).then(function (data) {
            if (data && data.friends) {
                ZXF.friends = data.friends;
                if (countEl) countEl.textContent = data.friends.length;
                if (data.friends.length === 0) {
                    container.innerHTML = "<p class=\"friends-empty\">暂无好友，快去添加吧</p>";
                    return;
                }
                container.innerHTML = data.friends.map(function (f) {
                    return "<div class=\"friend-row\">" +
                           "<span class=\"friend-nickname\">" + escapeHtml(f.nickname) + "</span>" +
                           "<span class=\"friend-best\">" + String(f.bestScore || 0).padStart(5, "0") + "</span>" +
                           "<button class=\"friend-pk-btn\" data-friend-id=\"" + f.userId + "\">PK</button>" +
                           "<button class=\"friend-delete-btn\" data-friend-id=\"" + f.userId + "\">&times;</button>" +
                           "</div>";
                }).join("");

                // 绑定好友 PK 按钮
                var pkBtns = container.querySelectorAll(".friend-pk-btn");
                for (var i = 0; i < pkBtns.length; i++) {
                    pkBtns[i].addEventListener("click", function (e) {
                        e.stopPropagation();
                        var fid = this.getAttribute("data-friend-id");
                        startFriendPK(fid);
                    });
                }

                // 绑定删除按钮
                var delBtns = container.querySelectorAll(".friend-delete-btn");
                for (var j = 0; j < delBtns.length; j++) {
                    delBtns[j].addEventListener("click", function (e) {
                        e.stopPropagation();
                        var fid = this.getAttribute("data-friend-id");
                        ZXF.api.removeFriend(ZXF.userId, fid).then(function () {
                            renderFriendsList();
                        }).catch(function () {});
                    });
                }
            }
        }).catch(function () {});
    }

    function startFriendPK(friendUserId) {
        if (!ZXF.api || !ZXF.userId) return;
        if (ZXF.phase === "playing" || ZXF.pk.mode === "racing") return;

        var profileModal = document.getElementById("profileModal");
        if (profileModal) profileModal.classList.add("hidden");

        ZXF.pk.mode = "friend_waiting";
        ZXF.pk.isFriendPK = true;

        ZXF.api.joinFriendPK(ZXF.userId, friendUserId).then(function (result) {
            if (result && !result.error && result.status === "matched") {
                ZXF.pk.matchId = result.matchId;
                ZXF.pk.opponentId = result.opponentId;
                ZXF.pk.opponentNickname = result.opponentNickname || "好友";
                ZXF.pk.mode = "matched";
                ZXF.startPKCountdown();
            } else if (result && result.error === "friend_busy") {
                alert("好友正在对战中，请稍后再试");
                ZXF.pk.mode = "solo";
            } else {
                alert("发起对战失败，好友可能离线");
                ZXF.pk.mode = "solo";
            }
        }).catch(function () {
            alert("网络错误");
            ZXF.pk.mode = "solo";
        });
    }

    // ========== PK UI 初始化 ==========
    function initPKUI() {
        // PK 对战按钮
        var pkButton = document.getElementById("pkButton");
        if (pkButton) {
            pkButton.addEventListener("click", function (e) {
                e.stopPropagation();
                if (ZXF.phase === "playing" || ZXF.pk.mode === "racing") return;
                ZXF.startPKMatchmaking();
            });
        }

        // 取消匹配按钮
        var pkCancelBtn = document.getElementById("pkCancelButton");
        if (pkCancelBtn) {
            pkCancelBtn.addEventListener("click", function (e) {
                e.stopPropagation();
                ZXF.cancelPKMatchmaking();
            });
        }

        // PK 结果关闭按钮
        var pkResultClose = document.getElementById("pkResultClose");
        if (pkResultClose) {
            pkResultClose.addEventListener("click", function (e) {
                e.stopPropagation();
                ZXF.resetToSoloMode();
            });
        }

        // 阻止 PK 弹窗内的点击冒泡
        var pkOverlays = document.querySelectorAll(".pk-matchmaking-overlay, .pk-result-overlay, .pk-match-found-overlay");
        for (var i = 0; i < pkOverlays.length; i++) {
            pkOverlays[i].addEventListener("pointerdown", function (e) {
                e.stopPropagation();
            });
        }
    }

    // ========== 在线排行榜 UI 初始化 ==========
    function initOnlineLeaderboardUI() {
        // 纯净/全部 tab 切换
        var tabs = document.querySelectorAll(".lb-tab");
        for (var i = 0; i < tabs.length; i++) {
            tabs[i].addEventListener("click", function () {
                var pure = this.getAttribute("data-pure") === "true";
                ZXF.currentLeaderboardTab = pure;
                // 更新 tab 激活状态
                var allTabs = document.querySelectorAll(".lb-tab");
                for (var j = 0; j < allTabs.length; j++) {
                    allTabs[j].classList.remove("active");
                }
                this.classList.add("active");
                if (ZXF.fetchLeaderboard) ZXF.fetchLeaderboard();
            });
        }

        // 刷新按钮
        var refreshBtn = document.getElementById("refreshLeaderboard");
        if (refreshBtn) {
            refreshBtn.addEventListener("click", function (e) {
                e.stopPropagation();
                if (ZXF.fetchLeaderboard) ZXF.fetchLeaderboard();
            });
        }

        // 排行榜面板折叠
        var lbToggle = document.getElementById("leaderboardToggle");
        var lbBody = document.getElementById("leaderboardBody");
        if (lbToggle && lbBody) {
            lbToggle.addEventListener("click", function () {
                var collapsed = lbBody.classList.toggle("hidden");
                lbToggle.querySelector(".toggle-arrow").textContent = collapsed ? "▶" : "▼";
            });
        }
    }

    // ========== 禁止长按弹出菜单/选择（全局，二维码弹窗除外） ==========
    document.addEventListener("contextmenu", function (e) {
        if (e.target.closest("#douyinModal")) return;
        e.preventDefault();
    });
    document.addEventListener("selectstart", function (e) {
        if (e.target.closest("#douyinModal")) return;
        e.preventDefault();
    });
    document.addEventListener("selectionchange", function () {
        var sel = window.getSelection();
        if (sel && sel.rangeCount > 0) {
            var range = sel.getRangeAt(0);
            var node = range.commonAncestorContainer;
            var el = node.nodeType === 3 ? node.parentElement : node;
            if (el && el.closest("#douyinModal")) return;
            sel.removeAllRanges();
        }
    });

    // ========== 启动 ==========
    function initApp() {
        // 设置 API 基地址
        ZXF.api.BASE = window.location.origin;

        ZXF.updateScoreDisplay();
        ZXF.initInput();
        initModifierPanel();
        initScoreHistoryPanel();
        initHelpModal();
        initSettingsModal();
        initDouyinModal();
        initPKUI();
        initOnlineLeaderboardUI();
        initProfileUI();
        renderScoreHistory();
        loadAssets();

        // 初始化昵称
        if (ZXF.api) {
            ZXF.api.getOrCreateNickname().then(function (result) {
                if (result && result.nickname) {
                    // 更新昵称显示
                    var nickDisplay = document.getElementById("nicknameDisplay");
                    if (nickDisplay) {
                        nickDisplay.textContent = result.nickname;
                        nickDisplay.classList.add("nickname-loaded");
                    }
                }
            }).catch(function () {});

            // 首次加载排行榜
            ZXF.fetchLeaderboard();
        }
    }

    initApp();
})();
