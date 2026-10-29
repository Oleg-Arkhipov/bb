import { useEffect, useRef, useState, useCallback } from 'react';

// ============ TYPES ============
interface Ball {
  x: number;
  y: number;
  dx: number;
  dy: number;
  radius: number;
  speed: number;
  rotation: number;
  trail: { x: number; y: number; alpha: number }[];
}

interface Paddle {
  x: number;
  y: number;
  width: number;
  height: number;
  targetX: number;
}

interface Brick {
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
  glowColor: string;
  hits: number;
  maxHits: number;
  alive: boolean;
  shakeX: number;
  shakeY: number;
}

interface Particle {
  x: number;
  y: number;
  dx: number;
  dy: number;
  radius: number;
  color: string;
  alpha: number;
  decay: number;
  life: number;
}

interface PowerUp {
  x: number;
  y: number;
  dy: number;
  type: 'wide' | 'multi' | 'slow';
  radius: number;
  color: string;
  glowColor: string;
}

// ============ CONSTANTS ============
const CANVAS_WIDTH = 800;
const CANVAS_HEIGHT = 600;
const PADDLE_WIDTH = 130;
const PADDLE_HEIGHT = 28;
const BALL_RADIUS = 8;
const BALL_SPEED = 8;
const BRICK_ROWS = 6;
const BRICK_COLS = 10;
const BRICK_HEIGHT = 25;
const BRICK_PADDING = 4;
const BRICK_TOP_OFFSET = 60;
const BRICK_SIDE_OFFSET = 20;

const BRICK_COLORS = [
  { color: '#A0522D', glow: '#A0522D80' }, // Classic brick color (sienna)
];

// Helper function to darken a hex color
function darkenColor(hex: string, amount: number): string {
  const num = parseInt(hex.replace('#', ''), 16);
  const r = Math.max(0, (num >> 16) - Math.floor(255 * amount));
  const g = Math.max(0, ((num >> 8) & 0x00FF) - Math.floor(255 * amount));
  const b = Math.max(0, (num & 0x0000FF) - Math.floor(255 * amount));
  return `#${(r << 16 | g << 8 | b).toString(16).padStart(6, '0')}`;
}

function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameStateRef = useRef<{
    ball: Ball;
    paddle: Paddle;
    bricks: Brick[];
    particles: Particle[];
    powerUps: PowerUp[];
    score: number;
    lives: number;
    level: number;
    combo: number;
    maxCombo: number;
    gameStarted: boolean;
    gameOver: boolean;
    gameWon: boolean;
    waitingForClick: boolean;
    screenShake: number;
    paddleWidth: number;
    ballSpeedMultiplier: number;
    mouseX: number;
  } | null>(null);
  const animationRef = useRef<number>(0);
  const [score, setScore] = useState(0);
  const [lives, setLives] = useState(3);
  const [level, setLevel] = useState(1);
  const [combo, setCombo] = useState(0);
  const [gameStarted, setGameStarted] = useState(false);
  const [gameOver, setGameOver] = useState(false);
  const [gameWon, setGameWon] = useState(false);

  const createBricks = useCallback((lvl: number): Brick[] => {
    const bricks: Brick[] = [];
    const brickWidth = (CANVAS_WIDTH - 2 * BRICK_SIDE_OFFSET - (BRICK_COLS - 1) * BRICK_PADDING) / BRICK_COLS;
    
    // Base probability increases with level (60% base + 3% per level, capped at 95%)
    const baseProbability = Math.min(0.95, 0.6 + lvl * 0.03);
    
    // Multi-hit probability increases with level
    const multiHitChance = Math.min(0.5, 0.1 + lvl * 0.05);
    
    // Generate random brick layout
    for (let row = 0; row < BRICK_ROWS; row++) {
      for (let col = 0; col < BRICK_COLS; col++) {
        // Random chance to place a brick at this position
        if (Math.random() < baseProbability) {
          const colorIdx = 0; // Classic brick color
          
          // Higher levels have more multi-hit bricks
          const maxHits = Math.random() < multiHitChance ? Math.min(3, 1 + Math.floor(lvl / 3)) : 1;
          
          bricks.push({
            x: BRICK_SIDE_OFFSET + col * (brickWidth + BRICK_PADDING),
            y: BRICK_TOP_OFFSET + row * (BRICK_HEIGHT + BRICK_PADDING),
            width: brickWidth,
            height: BRICK_HEIGHT,
            color: BRICK_COLORS[colorIdx].color,
            glowColor: BRICK_COLORS[colorIdx].glow,
            hits: 0,
            maxHits,
            alive: true,
            shakeX: 0,
            shakeY: 0,
          });
        }
      }
    }
    
    // Ensure at least 5 bricks exist (in case of very unlucky RNG)
    while (bricks.length < 5) {
      const row = Math.floor(Math.random() * BRICK_ROWS);
      const col = Math.floor(Math.random() * BRICK_COLS);
      const colorIdx = 0; // Classic brick color
      
      // Check if position is already occupied
      const exists = bricks.some(b => 
        b.x === BRICK_SIDE_OFFSET + col * (brickWidth + BRICK_PADDING) &&
        b.y === BRICK_TOP_OFFSET + row * (BRICK_HEIGHT + BRICK_PADDING)
      );
      
      if (!exists) {
        bricks.push({
          x: BRICK_SIDE_OFFSET + col * (brickWidth + BRICK_PADDING),
          y: BRICK_TOP_OFFSET + row * (BRICK_HEIGHT + BRICK_PADDING),
          width: brickWidth,
          height: BRICK_HEIGHT,
          color: BRICK_COLORS[colorIdx].color,
          glowColor: BRICK_COLORS[colorIdx].glow,
          hits: 0,
          maxHits: 1,
          alive: true,
          shakeX: 0,
          shakeY: 0,
        });
      }
    }
    
    return bricks;
  }, []);

  const initGame = useCallback((lvl: number = 1, keepScore: boolean = false) => {
    const gs = gameStateRef.current;
    if (!gs) return;

    gs.ball = {
      x: CANVAS_WIDTH / 2,
      y: CANVAS_HEIGHT - 60,
      dx: BALL_SPEED * (Math.random() > 0.5 ? 1 : -1),
      dy: -BALL_SPEED,
      radius: BALL_RADIUS,
      speed: BALL_SPEED,
      rotation: 0,
      trail: [],
    };
    gs.paddle = {
      x: CANVAS_WIDTH / 2 - PADDLE_WIDTH / 2,
      y: CANVAS_HEIGHT - 40,
      width: PADDLE_WIDTH,
      height: PADDLE_HEIGHT,
      targetX: CANVAS_WIDTH / 2 - PADDLE_WIDTH / 2,
    };
    gs.bricks = createBricks(lvl);
    gs.particles = [];
    gs.powerUps = [];
    gs.level = lvl;
    gs.combo = 0;
    gs.screenShake = 0;
    gs.paddleWidth = PADDLE_WIDTH;
    gs.ballSpeedMultiplier = 1;
    gs.waitingForClick = true;
    if (!keepScore) {
      gs.score = 0;
      gs.lives = 3;
      gs.gameStarted = false;
      gs.gameOver = false;
      gs.gameWon = false;
      setScore(0);
      setLives(3);
      setGameStarted(false);
      setGameOver(false);
      setGameWon(false);
    }
    setLevel(lvl);
    setCombo(0);
  }, [createBricks]);

  const spawnParticles = useCallback((x: number, y: number, color: string, count: number = 12) => {
    const gs = gameStateRef.current;
    if (!gs) return;
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count + Math.random() * 0.5;
      const speed = 2 + Math.random() * 4;
      gs.particles.push({
        x,
        y,
        dx: Math.cos(angle) * speed,
        dy: Math.sin(angle) * speed,
        radius: 2 + Math.random() * 3,
        color,
        alpha: 1,
        decay: 0.015 + Math.random() * 0.02,
        life: 1,
      });
    }
  }, []);

  const spawnPowerUp = useCallback((x: number, y: number) => {
    const gs = gameStateRef.current;
    if (!gs) return;
    if (Math.random() > 0.15) return; // 15% chance
    
    const types: PowerUp['type'][] = ['wide', 'multi', 'slow'];
    const type = types[Math.floor(Math.random() * types.length)];
    const colors: Record<string, { color: string; glow: string }> = {
      wide: { color: '#00f5d4', glow: '#00f5d480' },
      multi: { color: '#ff006e', glow: '#ff006e80' },
      slow: { color: '#ffbe0b', glow: '#ffbe0b80' },
    };
    
    gs.powerUps.push({
      x,
      y,
      dy: 2,
      type,
      radius: 12,
      color: colors[type].color,
      glowColor: colors[type].glow,
    });
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    gameStateRef.current = {
      ball: {
        x: CANVAS_WIDTH / 2,
        y: CANVAS_HEIGHT - 60,
        dx: BALL_SPEED,
        dy: -BALL_SPEED,
        radius: BALL_RADIUS,
        speed: BALL_SPEED,
        rotation: 0,
        trail: [],
      },
      paddle: {
        x: CANVAS_WIDTH / 2 - PADDLE_WIDTH / 2,
        y: CANVAS_HEIGHT - 40,
        width: PADDLE_WIDTH,
        height: PADDLE_HEIGHT,
        targetX: CANVAS_WIDTH / 2 - PADDLE_WIDTH / 2,
      },
      bricks: createBricks(1),
      particles: [],
      powerUps: [],
      score: 0,
      lives: 3,
      level: 1,
      combo: 0,
      maxCombo: 0,
      gameStarted: false,
      gameOver: false,
      gameWon: false,
      waitingForClick: true,
      screenShake: 0,
      paddleWidth: PADDLE_WIDTH,
      ballSpeedMultiplier: 1,
      mouseX: CANVAS_WIDTH / 2,
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (gameStateRef.current) {
        const rect = canvas.getBoundingClientRect();
        const scaleX = CANVAS_WIDTH / rect.width;
        
        // Use movementX for relative movement when pointer is locked
        if (document.pointerLockElement === canvas) {
          gameStateRef.current.mouseX += e.movementX * scaleX;
        } else {
          // Fallback to absolute positioning if pointer lock is not active
          gameStateRef.current.mouseX = (e.clientX - rect.left) * scaleX;
        }
        
        // Always clamp to canvas bounds
        gameStateRef.current.mouseX = Math.max(0, Math.min(CANVAS_WIDTH, gameStateRef.current.mouseX));
      }
    };

    const handleCanvasClick = (e: MouseEvent) => {
      const gs = gameStateRef.current;
      if (!gs) return;
      
      // Focus canvas and request pointer lock
      canvas.focus();
      
      if (document.pointerLockElement !== canvas) {
        try {
          canvas.requestPointerLock();
        } catch (err) {
          console.warn('Pointer lock request failed:', err);
        }
      }
      
      if (gs.waitingForClick) {
        gs.waitingForClick = false;
        gs.gameStarted = true;
        setGameStarted(true);
      } else if (gs.gameOver || gs.gameWon) {
        initGame(1);
      }
    };

    const handlePointerLockChange = () => {
      // Pointer lock state changed
      if (document.pointerLockElement === canvas) {
        console.log('Pointer lock acquired');
      } else {
        console.log('Pointer lock released');
      }
    };

    const handlePointerLockError = () => {
      console.warn('Pointer lock error');
    };

    // Listen on document to track mouse even when it leaves canvas
    document.addEventListener('mousemove', handleMouseMove);
    canvas.addEventListener('click', handleCanvasClick);
    document.addEventListener('pointerlockchange', handlePointerLockChange);
    document.addEventListener('pointerlockerror', handlePointerLockError);

    let lastTime = 0;
    const gameLoop = (timestamp: number) => {
      const deltaTime = Math.min((timestamp - lastTime) / 16.67, 2);
      lastTime = timestamp;

      const gs = gameStateRef.current;
      if (!gs) return;

      // Clear canvas
      ctx.fillStyle = '#0a0a1a';
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

      // Apply screen shake
      if (gs.screenShake > 0) {
        const shakeX = (Math.random() - 0.5) * gs.screenShake;
        const shakeY = (Math.random() - 0.5) * gs.screenShake;
        ctx.save();
        ctx.translate(shakeX, shakeY);
        gs.screenShake *= 0.9;
        if (gs.screenShake < 0.5) gs.screenShake = 0;
      }

      // Draw background grid
      ctx.strokeStyle = '#ffffff08';
      ctx.lineWidth = 1;
      for (let i = 0; i < CANVAS_WIDTH; i += 40) {
        ctx.beginPath();
        ctx.moveTo(i, 0);
        ctx.lineTo(i, CANVAS_HEIGHT);
        ctx.stroke();
      }
      for (let i = 0; i < CANVAS_HEIGHT; i += 40) {
        ctx.beginPath();
        ctx.moveTo(0, i);
        ctx.lineTo(CANVAS_WIDTH, i);
        ctx.stroke();
      }

      // Update paddle
      gs.paddle.targetX = gs.mouseX - gs.paddleWidth / 2;
      gs.paddle.targetX = Math.max(0, Math.min(CANVAS_WIDTH - gs.paddleWidth, gs.paddle.targetX));
      gs.paddle.x += (gs.paddle.targetX - gs.paddle.x) * 0.15 * deltaTime;

      // Draw paddle as carriage
      const carriageX = gs.paddle.x;
      const carriageY = gs.paddle.y;
      const carriageW = gs.paddleWidth;
      const carriageH = gs.paddle.height;
      const wheelRadius = 10;
      
      // Carriage body (main compartment)
      ctx.shadowColor = '#8B4513';
      ctx.shadowBlur = 15;
      
      const carriageGrad = ctx.createLinearGradient(carriageX, carriageY, carriageX, carriageY + carriageH);
      carriageGrad.addColorStop(0, '#D2691E');
      carriageGrad.addColorStop(0.5, '#8B4513');
      carriageGrad.addColorStop(1, '#654321');
      ctx.fillStyle = carriageGrad;
      ctx.beginPath();
      ctx.roundRect(carriageX + 10, carriageY, carriageW - 20, carriageH - 12, 6);
      ctx.fill();
      
      // Carriage roof/canopy
      ctx.fillStyle = '#654321';
      ctx.beginPath();
      ctx.roundRect(carriageX + 15, carriageY - 4, carriageW - 30, 8, 4);
      ctx.fill();
      
      // Carriage window
      ctx.fillStyle = '#87CEEB';
      ctx.shadowColor = '#87CEEB';
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.roundRect(carriageX + carriageW * 0.3, carriageY + 4, carriageW * 0.4, carriageH * 0.4, 3);
      ctx.fill();
      ctx.shadowBlur = 0;
      
      // Window frame
      ctx.strokeStyle = '#4a2511';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.roundRect(carriageX + carriageW * 0.3, carriageY + 4, carriageW * 0.4, carriageH * 0.4, 3);
      ctx.stroke();
      
      // Decorative trim
      ctx.strokeStyle = '#FFD700';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(carriageX + 12, carriageY + 2, carriageW - 24, carriageH - 16, 4);
      ctx.stroke();
      
      // Wheels
      const wheelY = carriageY + carriageH - 4;
      const leftWheelX = carriageX + 25;
      const rightWheelX = carriageX + carriageW - 25;
      
      // Draw left wheel
      ctx.shadowColor = '#2d1810';
      ctx.shadowBlur = 5;
      ctx.fillStyle = '#2d1810';
      ctx.beginPath();
      ctx.arc(leftWheelX, wheelY, wheelRadius, 0, Math.PI * 2);
      ctx.fill();
      
      ctx.fillStyle = '#4a2511';
      ctx.beginPath();
      ctx.arc(leftWheelX, wheelY, wheelRadius - 2, 0, Math.PI * 2);
      ctx.fill();
      
      // Wheel spokes
      ctx.strokeStyle = '#8B4513';
      ctx.lineWidth = 1.5;
      for (let i = 0; i < 6; i++) {
        const angle = (Math.PI * 2 * i) / 6 + gs.paddle.x * 0.02;
        ctx.beginPath();
        ctx.moveTo(leftWheelX, wheelY);
        ctx.lineTo(leftWheelX + Math.cos(angle) * (wheelRadius - 3), wheelY + Math.sin(angle) * (wheelRadius - 3));
        ctx.stroke();
      }
      
      // Wheel hub
      ctx.fillStyle = '#FFD700';
      ctx.beginPath();
      ctx.arc(leftWheelX, wheelY, 2, 0, Math.PI * 2);
      ctx.fill();
      
      // Draw right wheel
      ctx.fillStyle = '#2d1810';
      ctx.beginPath();
      ctx.arc(rightWheelX, wheelY, wheelRadius, 0, Math.PI * 2);
      ctx.fill();
      
      ctx.fillStyle = '#4a2511';
      ctx.beginPath();
      ctx.arc(rightWheelX, wheelY, wheelRadius - 2, 0, Math.PI * 2);
      ctx.fill();
      
      // Wheel spokes
      ctx.strokeStyle = '#8B4513';
      ctx.lineWidth = 1.5;
      for (let i = 0; i < 6; i++) {
        const angle = (Math.PI * 2 * i) / 6 + gs.paddle.x * 0.02;
        ctx.beginPath();
        ctx.moveTo(rightWheelX, wheelY);
        ctx.lineTo(rightWheelX + Math.cos(angle) * (wheelRadius - 3), wheelY + Math.sin(angle) * (wheelRadius - 3));
        ctx.stroke();
      }
      
      // Wheel hub
      ctx.fillStyle = '#FFD700';
      ctx.beginPath();
      ctx.arc(rightWheelX, wheelY, 2, 0, Math.PI * 2);
      ctx.fill();
      
      ctx.shadowBlur = 0;

      if (gs.gameStarted && !gs.gameOver && !gs.gameWon && !gs.waitingForClick) {
        // Update ball
        const speedMult = gs.ballSpeedMultiplier;
        gs.ball.x += gs.ball.dx * deltaTime * speedMult;
        gs.ball.y += gs.ball.dy * deltaTime * speedMult;
        
        // Update boot rotation (spin based on speed)
        gs.ball.rotation += 0.25 * deltaTime * speedMult;

        // Ball trail
        gs.ball.trail.push({ x: gs.ball.x, y: gs.ball.y, alpha: 1 });
        if (gs.ball.trail.length > 15) gs.ball.trail.shift();
        gs.ball.trail.forEach(t => t.alpha *= 0.9);

        // Wall collisions
        if (gs.ball.x - gs.ball.radius <= 0 || gs.ball.x + gs.ball.radius >= CANVAS_WIDTH) {
          gs.ball.dx = -gs.ball.dx;
          gs.ball.x = Math.max(gs.ball.radius, Math.min(CANVAS_WIDTH - gs.ball.radius, gs.ball.x));
          spawnParticles(gs.ball.x, gs.ball.y, '#ffffff', 5);
        }
        if (gs.ball.y - gs.ball.radius <= 0) {
          // Hit top edge - advance to next level!
          spawnParticles(gs.ball.x, gs.ball.y, '#ffbe0b', 25);
          gs.screenShake = 10;
          
          // Bonus points for reaching the top
          gs.score += 100 * gs.level;
          setScore(gs.score);
          
          // Always advance to the next level (infinite levels)
          initGame(gs.level + 1, true);
        }

        // Paddle collision
        if (
          gs.ball.dy > 0 &&
          gs.ball.y + gs.ball.radius >= gs.paddle.y &&
          gs.ball.y + gs.ball.radius <= gs.paddle.y + gs.paddle.height + 10 &&
          gs.ball.x >= gs.paddle.x &&
          gs.ball.x <= gs.paddle.x + gs.paddleWidth
        ) {
          const hitPos = (gs.ball.x - gs.paddle.x) / gs.paddleWidth;
          const angle = (hitPos - 0.5) * Math.PI * 0.7;
          const speed = Math.sqrt(gs.ball.dx * gs.ball.dx + gs.ball.dy * gs.ball.dy);
          gs.ball.dx = Math.sin(angle) * speed;
          gs.ball.dy = -Math.cos(angle) * speed;
          gs.ball.y = gs.paddle.y - gs.ball.radius;
          gs.combo = 0;
          setCombo(0);
          spawnParticles(gs.ball.x, gs.ball.y, '#00f5d4', 8);
        }

        // Ball out of bounds
        if (gs.ball.y - gs.ball.radius > CANVAS_HEIGHT) {
          gs.lives--;
          setLives(gs.lives);
          if (gs.lives <= 0) {
            gs.gameOver = true;
            setGameOver(true);
            spawnParticles(gs.ball.x, gs.ball.y, '#ff006e', 30);
          } else {
            gs.ball.x = CANVAS_WIDTH / 2;
            gs.ball.y = CANVAS_HEIGHT - 60;
            gs.ball.dx = BALL_SPEED * (Math.random() > 0.5 ? 1 : -1);
            gs.ball.dy = -BALL_SPEED;
            gs.ball.rotation = 0;
            gs.ball.trail = [];
            gs.combo = 0;
            gs.waitingForClick = true;
            setCombo(0);
          }
        }

        // Brick collisions
        gs.bricks.forEach((brick) => {
          if (!brick.alive) return;
          
          if (
            gs.ball.x + gs.ball.radius > brick.x &&
            gs.ball.x - gs.ball.radius < brick.x + brick.width &&
            gs.ball.y + gs.ball.radius > brick.y &&
            gs.ball.y - gs.ball.radius < brick.y + brick.height
          ) {
            // Determine collision side
            const overlapLeft = gs.ball.x + gs.ball.radius - brick.x;
            const overlapRight = brick.x + brick.width - (gs.ball.x - gs.ball.radius);
            const overlapTop = gs.ball.y + gs.ball.radius - brick.y;
            const overlapBottom = brick.y + brick.height - (gs.ball.y - gs.ball.radius);
            
            const minOverlapX = Math.min(overlapLeft, overlapRight);
            const minOverlapY = Math.min(overlapTop, overlapBottom);

            if (minOverlapX < minOverlapY) {
              gs.ball.dx = -gs.ball.dx;
            } else {
              gs.ball.dy = -gs.ball.dy;
            }

            brick.hits++;
            if (brick.hits >= brick.maxHits) {
              brick.alive = false;
              gs.combo++;
              if (gs.combo > gs.maxCombo) gs.maxCombo = gs.combo;
              setCombo(gs.combo);
              const comboMultiplier = Math.min(gs.combo, 10);
              gs.score += 10 * comboMultiplier;
              setScore(gs.score);
              spawnParticles(
                brick.x + brick.width / 2,
                brick.y + brick.height / 2,
                brick.color,
                15 + gs.combo * 2
              );
              spawnPowerUp(brick.x + brick.width / 2, brick.y + brick.height / 2);
              gs.screenShake = 5 + gs.combo;
            } else {
              brick.shakeX = (Math.random() - 0.5) * 6;
              brick.shakeY = (Math.random() - 0.5) * 6;
              spawnParticles(
                brick.x + brick.width / 2,
                brick.y + brick.height / 2,
                brick.color,
                5
              );
            }
          }
        });

        // Note: Level progression now happens when boot hits top edge

        // Update power-ups
        gs.powerUps = gs.powerUps.filter(pu => {
          pu.y += pu.dy * deltaTime;
          
          // Check paddle collision
          if (
            pu.y + pu.radius >= gs.paddle.y &&
            pu.x >= gs.paddle.x &&
            pu.x <= gs.paddle.x + gs.paddleWidth
          ) {
            switch (pu.type) {
              case 'wide':
                gs.paddleWidth = Math.min(200, gs.paddleWidth + 30);
                gs.paddle.width = gs.paddleWidth;
                break;
              case 'slow':
                gs.ballSpeedMultiplier = Math.max(0.5, gs.ballSpeedMultiplier - 0.2);
                break;
              case 'multi':
                gs.score += 50;
                setScore(gs.score);
                break;
            }
            spawnParticles(pu.x, pu.y, pu.color, 10);
            return false;
          }
          
          return pu.y < CANVAS_HEIGHT + 20;
        });
      }

      // Draw bricks (brick wall pattern)
      gs.bricks.forEach((brick) => {
        if (!brick.alive) return;
        
        // Brick shake decay
        brick.shakeX *= 0.85;
        brick.shakeY *= 0.85;
        
        const bx = brick.x + brick.shakeX;
        const by = brick.y + brick.shakeY;
        const damaged = brick.hits > 0;
        
        // Glow
        ctx.shadowColor = brick.glowColor;
        ctx.shadowBlur = damaged ? 5 : 10;
        
        const brickAlpha = damaged ? 0.6 : 1;
        ctx.globalAlpha = brickAlpha;
        
        // Mortar background (the gaps between bricks)
        ctx.fillStyle = '#3a3a3a';
        ctx.beginPath();
        ctx.roundRect(bx, by, brick.width, brick.height, 2);
        ctx.fill();
        
        // Individual bricks within the cell
        const mortarThickness = 2;
        const brickPadding = 1;
        
        // Calculate brick layout (2 bricks per row, offset pattern)
        const brickHeight = (brick.height - mortarThickness * 3) / 2;
        const brickWidth = (brick.width - mortarThickness * 3) / 2;
        
        // Draw individual bricks
        const drawSingleBrick = (x: number, y: number, w: number, h: number, colorIdx: number) => {
          // Brick gradient for 3D effect
          const brickGrad = ctx.createLinearGradient(x, y, x, y + h);
          const baseColor = brick.color;
          brickGrad.addColorStop(0, baseColor);
          brickGrad.addColorStop(0.3, baseColor);
          brickGrad.addColorStop(1, darkenColor(baseColor, 0.3));
          
          ctx.fillStyle = brickGrad;
          ctx.beginPath();
          ctx.roundRect(x, y, w, h, 1);
          ctx.fill();
          
          // Top highlight
          ctx.fillStyle = 'rgba(255,255,255,0.15)';
          ctx.beginPath();
          ctx.roundRect(x + 1, y + 1, w - 2, h * 0.3, 1);
          ctx.fill();
          
          // Texture speckles
          ctx.fillStyle = 'rgba(0,0,0,0.1)';
          for (let i = 0; i < 3; i++) {
            const sx = x + Math.random() * w;
            const sy = y + Math.random() * h;
            ctx.fillRect(sx, sy, 1, 1);
          }
        };
        
        // Row 1: Two full bricks
        drawSingleBrick(
          bx + brickPadding,
          by + brickPadding,
          brickWidth - brickPadding,
          brickHeight,
          0
        );
        drawSingleBrick(
          bx + brickWidth + mortarThickness + brickPadding,
          by + brickPadding,
          brickWidth - brickPadding,
          brickHeight,
          1
        );
        
        // Row 2: Offset pattern (half brick, full brick, half brick)
        const halfBrickWidth = brickWidth / 2;
        drawSingleBrick(
          bx + brickPadding,
          by + brickHeight + mortarThickness * 2 + brickPadding,
          halfBrickWidth - brickPadding,
          brickHeight,
          2
        );
        drawSingleBrick(
          bx + halfBrickWidth + mortarThickness + brickPadding,
          by + brickHeight + mortarThickness * 2 + brickPadding,
          brickWidth * 2 + mortarThickness - brickPadding,
          brickHeight,
          3
        );
        drawSingleBrick(
          bx + halfBrickWidth + brickWidth + mortarThickness * 2 + brickPadding,
          by + brickHeight + mortarThickness * 2 + brickPadding,
          halfBrickWidth - brickPadding,
          brickHeight,
          4
        );
        
        // Crack effect for damaged bricks
        if (damaged) {
          ctx.strokeStyle = 'rgba(0,0,0,0.7)';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(bx + brick.width * 0.3, by);
          ctx.lineTo(bx + brick.width * 0.5, by + brick.height * 0.5);
          ctx.lineTo(bx + brick.width * 0.7, by + brick.height);
          ctx.stroke();
          
          // Additional crack lines
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(bx + brick.width * 0.5, by + brick.height * 0.5);
          ctx.lineTo(bx + brick.width * 0.6, by + brick.height * 0.3);
          ctx.stroke();
        }
        
        ctx.globalAlpha = 1;
        ctx.shadowBlur = 0;
      });

      // Draw power-ups
      gs.powerUps.forEach((pu) => {
        ctx.shadowColor = pu.glowColor;
        ctx.shadowBlur = 15;
        ctx.fillStyle = pu.color;
        ctx.beginPath();
        ctx.arc(pu.x, pu.y, pu.radius, 0, Math.PI * 2);
        ctx.fill();
        
        // Icon
        ctx.fillStyle = '#000';
        ctx.font = 'bold 12px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const icons: Record<string, string> = { wide: '↔', slow: '▼', multi: '★' };
        ctx.fillText(icons[pu.type], pu.x, pu.y);
        ctx.shadowBlur = 0;
      });

      // Draw ball trail (dust trail behind boot)
      gs.ball.trail.forEach((t, i) => {
        const alpha = t.alpha * 0.35;
        const radius = gs.ball.radius * (i / gs.ball.trail.length) * 0.6;
        ctx.fillStyle = `rgba(139, 69, 19, ${alpha})`;
        ctx.beginPath();
        ctx.arc(t.x, t.y, radius, 0, Math.PI * 2);
        ctx.fill();
      });

      // Draw boot (ball)
      if (!gs.gameOver && !gs.gameWon) {
        const rotation = gs.ball.rotation;
        const bootSize = gs.ball.radius * 2.4;
        
        ctx.save();
        ctx.translate(gs.ball.x, gs.ball.y);
        ctx.rotate(rotation);
        
        // Glow effect
        ctx.shadowColor = '#8B4513';
        ctx.shadowBlur = 15;
        
        // Boot sole (bottom - thick)
        ctx.fillStyle = '#2d1810';
        ctx.beginPath();
        ctx.moveTo(-bootSize * 0.8, bootSize * 0.2);
        ctx.lineTo(bootSize * 0.95, bootSize * 0.2);
        ctx.lineTo(bootSize * 1.05, bootSize * 0.1);
        ctx.lineTo(bootSize * 1.0, bootSize * 0.0);
        ctx.lineTo(-bootSize * 0.75, bootSize * 0.0);
        ctx.closePath();
        ctx.fill();
        
        // Sole tread marks
        ctx.strokeStyle = '#1a0f0a';
        ctx.lineWidth = 1;
        for (let i = -0.5; i < 0.9; i += 0.2) {
          ctx.beginPath();
          ctx.moveTo(bootSize * i, bootSize * 0.2);
          ctx.lineTo(bootSize * i, bootSize * 0.1);
          ctx.stroke();
        }
        
        // Boot body (main leather)
        const bootGrad = ctx.createLinearGradient(-bootSize, -bootSize * 0.8, bootSize, bootSize * 0.2);
        bootGrad.addColorStop(0, '#8B4513');
        bootGrad.addColorStop(0.3, '#A0522D');
        bootGrad.addColorStop(0.7, '#8B4513');
        bootGrad.addColorStop(1, '#654321');
        ctx.fillStyle = bootGrad;
        
        // Boot shape - tall shaft with toe
        ctx.beginPath();
        ctx.moveTo(-bootSize * 0.75, bootSize * 0.0);
        // Heel back
        ctx.lineTo(-bootSize * 0.7, -bootSize * 0.1);
        ctx.quadraticCurveTo(-bootSize * 0.75, -bootSize * 0.6, -bootSize * 0.5, -bootSize * 0.8);
        // Top of boot shaft
        ctx.lineTo(-bootSize * 0.1, -bootSize * 0.85);
        ctx.quadraticCurveTo(bootSize * 0.0, -bootSize * 0.8, bootSize * 0.05, -bootSize * 0.7);
        // Front of shaft going down to toe
        ctx.quadraticCurveTo(bootSize * 0.15, -bootSize * 0.4, bootSize * 0.4, -bootSize * 0.2);
        // Toe
        ctx.quadraticCurveTo(bootSize * 0.9, -bootSize * 0.15, bootSize * 1.0, bootSize * 0.0);
        ctx.lineTo(-bootSize * 0.75, bootSize * 0.0);
        ctx.closePath();
        ctx.fill();
        
        // Boot shaft opening (top)
        ctx.fillStyle = '#3d2415';
        ctx.beginPath();
        ctx.ellipse(-bootSize * 0.3, -bootSize * 0.82, bootSize * 0.25, bootSize * 0.06, 0, 0, Math.PI * 2);
        ctx.fill();
        
        // Leather stitching lines
        ctx.strokeStyle = '#5c3317';
        ctx.lineWidth = 1;
        ctx.setLineDash([2, 2]);
        ctx.beginPath();
        ctx.moveTo(-bootSize * 0.6, -bootSize * 0.1);
        ctx.quadraticCurveTo(-bootSize * 0.55, -bootSize * 0.5, -bootSize * 0.35, -bootSize * 0.75);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(-bootSize * 0.1, -bootSize * 0.75);
        ctx.quadraticCurveTo(bootSize * 0.1, -bootSize * 0.5, bootSize * 0.3, -bootSize * 0.25);
        ctx.stroke();
        ctx.setLineDash([]);
        
        // Laces
        ctx.strokeStyle = '#2d1810';
        ctx.lineWidth = 1.5;
        for (let i = 0; i < 4; i++) {
          const ly = -bootSize * 0.3 - i * bootSize * 0.12;
          const lx = -bootSize * 0.15 + i * bootSize * 0.05;
          ctx.beginPath();
          ctx.moveTo(lx - bootSize * 0.08, ly);
          ctx.lineTo(lx + bootSize * 0.08, ly);
          ctx.stroke();
        }
        
        // Toe cap stitching
        ctx.strokeStyle = '#5c3317';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(bootSize * 0.7, -bootSize * 0.05, bootSize * 0.2, Math.PI * 0.8, Math.PI * 1.8);
        ctx.stroke();
        
        // Leather highlight/shine
        ctx.fillStyle = 'rgba(255,220,180,0.2)';
        ctx.beginPath();
        ctx.ellipse(-bootSize * 0.4, -bootSize * 0.5, bootSize * 0.15, bootSize * 0.25, -0.3, 0, Math.PI * 2);
        ctx.fill();
        
        // Heel reinforcement
        ctx.fillStyle = '#654321';
        ctx.beginPath();
        ctx.moveTo(-bootSize * 0.75, bootSize * 0.0);
        ctx.quadraticCurveTo(-bootSize * 0.72, -bootSize * 0.3, -bootSize * 0.6, -bootSize * 0.4);
        ctx.lineTo(-bootSize * 0.5, -bootSize * 0.35);
        ctx.quadraticCurveTo(-bootSize * 0.6, -bootSize * 0.2, -bootSize * 0.65, bootSize * 0.0);
        ctx.closePath();
        ctx.fill();
        
        ctx.shadowBlur = 0;
        ctx.restore();
      }

      // Draw particles
      gs.particles = gs.particles.filter((p) => {
        p.x += p.dx * deltaTime;
        p.y += p.dy * deltaTime;
        p.dy += 0.1 * deltaTime; // gravity
        p.alpha -= p.decay * deltaTime;
        p.radius *= 0.98;
        
        if (p.alpha <= 0) return false;
        
        ctx.globalAlpha = p.alpha;
        ctx.shadowColor = p.color;
        ctx.shadowBlur = 8;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.globalAlpha = 1;
        
        return true;
      });

      // Restore from screen shake
      if (gs.screenShake > 0) {
        ctx.restore();
      }

      // Draw "GO" sign when boot is in top 20% of screen
      if (gs.gameStarted && !gs.gameOver && !gs.gameWon && !gs.waitingForClick) {
        const topThreshold = CANVAS_HEIGHT * 0.2;
        if (gs.ball.y < topThreshold) {
          // Blinking effect using sine wave
          const blinkAlpha = 0.5 + 0.5 * Math.sin(timestamp * 0.008);
          
          ctx.save();
          ctx.globalAlpha = blinkAlpha;
          
          // Octagon parameters
          const octX = CANVAS_WIDTH / 2;
          const octY = 80;
          const octRadius = 50;
          const sides = 8;
          
          // Draw octagon
          ctx.beginPath();
          for (let i = 0; i < sides; i++) {
            const angle = (Math.PI * 2 * i) / sides - Math.PI / 8;
            const x = octX + octRadius * Math.cos(angle);
            const y = octY + octRadius * Math.sin(angle);
            if (i === 0) {
              ctx.moveTo(x, y);
            } else {
              ctx.lineTo(x, y);
            }
          }
          ctx.closePath();
          
          // Fill with red
          ctx.fillStyle = '#ff0000';
          ctx.shadowColor = '#ff0000';
          ctx.shadowBlur = 20;
          ctx.fill();
          
          // Draw border
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 3;
          ctx.stroke();
          
          // Draw "GO" text
          ctx.shadowBlur = 0;
          ctx.fillStyle = '#ffffff';
          ctx.font = 'bold 36px Arial';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('GO', octX, octY);
          
          ctx.restore();
        }
      }

      // Draw UI overlays
      if (!gs.gameStarted && !gs.gameOver && !gs.gameWon && gs.waitingForClick) {
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
        
        ctx.shadowColor = '#3a86ff';
        ctx.shadowBlur = 30;
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 48px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('BOOT BREAKER LIMBO', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 - 40);
        
        ctx.shadowColor = '#00f5d4';
        ctx.shadowBlur = 15;
        ctx.font = '20px Arial';
        ctx.fillStyle = '#00f5d4';
        ctx.fillText('Click to Start', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 20);
        ctx.shadowBlur = 0;
        
        ctx.font = '14px Arial';
        ctx.fillStyle = '#ffffff80';
        ctx.fillText('Click to capture mouse • Move to control paddle', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 50);
        ctx.fillText('Hit the top edge to advance to the next level!', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 75);
        ctx.fillText('Press ESC to release mouse', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 100);
      } else if (gs.gameStarted && gs.waitingForClick && !gs.gameOver && !gs.gameWon) {
        // Show "Click to continue" overlay for level start or after losing a life
        ctx.fillStyle = 'rgba(0,0,0,0.4)';
        ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
        
        ctx.shadowColor = '#ffbe0b';
        ctx.shadowBlur = 20;
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 36px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`Level ${gs.level}`, CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 - 30);
        
        ctx.shadowColor = '#00f5d4';
        ctx.shadowBlur = 15;
        ctx.font = '22px Arial';
        ctx.fillStyle = '#00f5d4';
        ctx.fillText('Click to Continue', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 20);
        ctx.shadowBlur = 0;
      }

      // Show pointer lock indicator during gameplay
      if (gs.gameStarted && !gs.gameOver && !gs.gameWon && !gs.waitingForClick) {
        const isLocked = document.pointerLockElement === canvas;
        ctx.font = '12px Arial';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'top';
        if (isLocked) {
          ctx.fillStyle = '#00ff0080';
          ctx.fillText('🔒 Mouse Captured (ESC to release)', CANVAS_WIDTH - 10, 10);
        } else {
          ctx.fillStyle = '#ff660080';
          ctx.fillText('🖱️ Click to capture mouse', CANVAS_WIDTH - 10, 10);
        }
      }

      if (gs.gameOver) {
        ctx.fillStyle = 'rgba(0,0,0,0.7)';
        ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
        
        ctx.shadowColor = '#ff006e';
        ctx.shadowBlur = 30;
        ctx.fillStyle = '#ff006e';
        ctx.font = 'bold 48px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('GAME OVER', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 - 40);
        
        ctx.shadowColor = '#ffffff';
        ctx.shadowBlur = 10;
        ctx.fillStyle = '#ffffff';
        ctx.font = '24px Arial';
        ctx.fillText(`Final Score: ${gs.score}`, CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 10);
        
        ctx.font = '18px Arial';
        ctx.fillStyle = '#00f5d4';
        ctx.fillText('Click to Restart', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 50);
        ctx.shadowBlur = 0;
      }

      if (gs.gameWon) {
        ctx.fillStyle = 'rgba(0,0,0,0.7)';
        ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
        
        ctx.shadowColor = '#ffbe0b';
        ctx.shadowBlur = 30;
        ctx.fillStyle = '#ffbe0b';
        ctx.font = 'bold 48px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('YOU WIN!', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 - 40);
        
        ctx.shadowColor = '#ffffff';
        ctx.shadowBlur = 10;
        ctx.fillStyle = '#ffffff';
        ctx.font = '24px Arial';
        ctx.fillText(`Final Score: ${gs.score}`, CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 10);
        
        ctx.font = '18px Arial';
        ctx.fillStyle = '#00f5d4';
        ctx.fillText('Click to Play Again', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 50);
        ctx.shadowBlur = 0;
      }

      animationRef.current = requestAnimationFrame(gameLoop);
    };

    animationRef.current = requestAnimationFrame(gameLoop);

    return () => {
      cancelAnimationFrame(animationRef.current);
      document.removeEventListener('mousemove', handleMouseMove);
      canvas.removeEventListener('click', handleCanvasClick);
      document.removeEventListener('pointerlockchange', handlePointerLockChange);
      document.removeEventListener('pointerlockerror', handlePointerLockError);
      if (document.pointerLockElement === canvas) {
        document.exitPointerLock();
      }
    };
  }, [createBricks, initGame, spawnParticles, spawnPowerUp]);

  return (
    <div className="min-h-screen bg-[#050510] flex flex-col items-center justify-center p-4">
      {/* Header */}
      <div className="w-full max-w-[800px] mb-4">
        <div className="flex justify-between items-center px-2">
          <div className="flex items-center gap-4">
            <div className="text-cyan-400 font-mono">
              <span className="text-xs text-gray-500 uppercase tracking-wider">Score</span>
              <p className="text-2xl font-bold">{score.toLocaleString()}</p>
            </div>
            {combo > 1 && (
              <div className="text-pink-500 font-mono animate-pulse">
                <span className="text-xs text-gray-500 uppercase tracking-wider">Combo</span>
                <p className="text-xl font-bold">x{combo}</p>
              </div>
            )}
          </div>
          <div className="text-center">
            <span className="text-xs text-gray-500 uppercase tracking-wider">Level</span>
            <p className="text-2xl font-bold text-purple-400">{level}</p>
          </div>
          <div className="text-right font-mono">
            <span className="text-xs text-gray-500 uppercase tracking-wider">Lives</span>
            <p className="text-2xl font-bold text-red-400">
              {'♥'.repeat(lives)}{'♡'.repeat(Math.max(0, 3 - lives))}
            </p>
          </div>
        </div>
      </div>

      {/* Game Canvas */}
      <div className="relative rounded-xl overflow-hidden border border-gray-800 shadow-2xl shadow-blue-900/20" style={{ cursor: 'none' }}>
        <canvas
          ref={canvasRef}
          width={CANVAS_WIDTH}
          height={CANVAS_HEIGHT}
          className="block max-w-full h-auto"
          style={{ imageRendering: 'auto', cursor: 'none', touchAction: 'none' }}
          tabIndex={0}
        />
      </div>

      {/* Footer info */}
      <div className="w-full max-w-[800px] mt-4 px-2">
        <div className="flex justify-between items-center text-xs text-gray-600">
          <span>🖱️ Mouse to move paddle</span>
          <span>⬆️ Hit the top edge to advance</span>
          <span>⚡ Catch power-ups for bonuses</span>
        </div>
      </div>
    </div>
  );
}

export default App;
