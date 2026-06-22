(function () {
    "use strict";
    var ZXF = window.ZXF || {};
    window.ZXF = ZXF;

    // ========== 移动端检测 ==========
    ZXF.isMobile = window.innerWidth <= 640;

    // ========== 画布尺寸 ==========
    ZXF.CANVAS_W = 1024;
    ZXF.CANVAS_H = 576;

    // ========== 物理常量 ==========
    ZXF.GROUND_Y = 475;
    ZXF.GRAVITY = 2507;
    ZXF.JUMP_VELOCITY = -875;
    ZXF.JUMP_HOLD_FORCE = -1547;
    ZXF.MAX_JUMP_HOLD = 0.18;
    ZXF.FAST_DROP_GRAVITY = 4160;

    // ========== 游戏参数 ==========
    ZXF.INITIAL_SPEED = 437;
    ZXF.MAX_SPEED = 768;
    ZXF.SPEED_ACCEL = 8;
    ZXF.SCORE_DIVISOR = 10;
    ZXF.MAX_DT = 0.033;
    ZXF.INITIAL_SPAWN_TIMER = 0.65;
    ZXF.FLYING_SCORE_THRESHOLD = 235;
    ZXF.FLYING_CHANCE = 0.35;

    // ========== 碰撞盒边距 ==========
    ZXF.HITBOX_STAND = { x: 12, y: 9, wPad: 21, hPad: 13 };
    ZXF.HITBOX_DUCK = { x: 11, y: 16, wPad: 19, hPad: 32 };

    // ========== 障碍物配置 ==========
    ZXF.OBSTACLE_CFG = {
        qiaolezi:      { w: 77,  h: 154, yOff: 126, hitPad: 10 },
        qiaoleziAlt:   { w: 70,  h: 143, yOff: 119, hitPad: 10 },
        spriteBottle:  { w: 143, h: 81,  hitPad: 14 }
    };

    // ========== 飞行障碍物高度配置 ==========
    ZXF.FLYING_LANES = {
        duck: { baseY: 177, rangeY: 13, speedMin: 1.04, speedRange: 0.28 },
        jump: { baseY: 102, rangeY: 17, speedMin: 0.94, speedRange: 0.22 },
        high: { baseY: 237, rangeY: 28, speedMin: 1.12, speedRange: 0.38 }
    };

    // ========== 资源路径 ==========
    ZXF.ASSET_PATHS = {
        runner: "assets/zhang-runner.png",
        duck: "assets/zhang-duck.png",
        qiaolezi: "assets/qiaolezi.png",
        qiaoleziAlt: "assets/qiaolezi-alt.png",
        spriteBottle: "assets/sprite-bottle.png"
    };

    // ========== 玩家初始状态 ==========
    ZXF.player = {
        x: 113,
        standW: 104,
        standH: 141,
        duckW: 111,
        duckH: 97,
        w: 104,
        h: 141,
        vy: 0,
        grounded: true,
        ducking: false,
        jumpHold: 0
    };
    ZXF.player.y = ZXF.GROUND_Y - ZXF.player.standH;

    // ========== 游戏状态 ==========
    ZXF.game = {
        speed: ZXF.INITIAL_SPEED,
        distance: 0,
        score: 0,
        obstacles: [],
        dust: [],
        lastObstacleWasGround: false,
        dayTime: 6  // 游戏内起始时间（6点，日出）
    };

    // ========== 输入状态 ==========
    ZXF.input = {
        jumpHeld: false,
        duckHeld: false
    };

    // ========== 游戏修改器 ==========
    ZXF.modifiers = {
        speedMult: 1,
        densityMult: 1,
        invincible: false
    };

    // ========== 音效设置 ==========
    ZXF.sound = {
        bgmVolume: 0.5,
        sfxVolume: 0.9,
        bgmMuted: false,
        sfxMuted: false
    };

    // ========== 运行时变量（非配置，由 main.js 初始化） ==========
    ZXF.phase = "ready";
    ZXF.spawnTimer = ZXF.INITIAL_SPAWN_TIMER;
    ZXF.lastTime = 0;
    ZXF.bestScore = 0;
    ZXF.images = {};

    // ========== 后端/用户 ==========
    ZXF.userId = null;
    ZXF.nickname = null;
    ZXF.friends = [];           // [{ userId, nickname, bestScore }]

    // ========== PK 模式状态 ==========
    ZXF.pk = {
        mode: "solo",           // "solo" | "matchmaking" | "friend_waiting" | "matched" | "countdown" | "racing" | "result"
        matchId: null,
        opponentId: null,
        opponentNickname: null,
        isFriendPK: false,      // 是否为好友对战
        opponent: {             // 对手最终结果（死亡后轮询获取）
            score: 0,
            distance: 0,
            alive: true,
            finished: false,
            lastUpdate: 0
        },
        result: null,           // "win" | "lose" | "draw" 比赛结束后
        queuePollTimer: null,   // 匹配轮询定时器 ID
        selfFinished: false     // 自己是否已结束（等待对手）
    };
})();
