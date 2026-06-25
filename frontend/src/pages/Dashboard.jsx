import React, { useState, useEffect, useRef, useMemo } from 'react';
import logoUrl from '../assets/dark KBM.png';
import { useTheme } from '../ThemeContext';

// Sound system (Web Audio API)
let audioCtx = null;
let motorOsc = null;
let motorGain = null;
let crushNoise = null;
let crushGain = null;
let crushFilter = null;

const Dashboard = () => {
  const { theme } = useTheme();
  const isDarkMode = theme === 'dark';

  // Control State
  const [beltSpeed, setBeltSpeed] = useState(1); // 0 (Stop), 0.5 (Slow), 1 (Normal), 2 (Fast), 3 (Max)
  const [materialType, setMaterialType] = useState('blue-metal'); // blue-metal, granite, gravel
  const [isEStopped, setIsEStopped] = useState(false);
  const [soundOn, setSoundOn] = useState(false);
  const [statistics, setStatistics] = useState({
    throughput: 0,
    totalCrushed: 0,
    motorTemp: 55,
    vibration: 0.15,
  });

  // Pulse effect trigger for the logo
  const [logoPulse, setLogoPulse] = useState(false);
  const [logoPulseColor, setLogoPulseColor] = useState('rgba(37, 99, 235, 0.4)'); // Default blue glow

  const canvasRef = useRef(null);
  const animationFrameId = useRef(null);
  const particlesRef = useRef([]);
  const pulsesRef = useRef([]);
  const telemetryIntervalRef = useRef(null);
  const pileHeightsRef = useRef(new Array(100).fill(0)); // Height map for accumulating pile

  // Color mappings for materials
  const materialColors = useMemo(() => ({
    'blue-metal': ['#475569', '#334155', '#1e293b', '#64748b', '#0f172a'],
    'granite': ['#78716c', '#57534e', '#44403c', '#a8a29e', '#292524'],
    'gravel': ['#7c2d12', '#9a3412', '#c2410c', '#ea580c', '#dd6b20'],
  }), []);

  // Telemetry simulation
  useEffect(() => {
    if (isEStopped || beltSpeed === 0) {
      setStatistics(prev => ({
        ...prev,
        throughput: 0,
        vibration: 0.02,
        motorTemp: Math.max(40, prev.motorTemp - 0.2), // Cool down
      }));
      return;
    }

    telemetryIntervalRef.current = setInterval(() => {
      setStatistics(prev => {
        const targetTemp = 45 + beltSpeed * 12 + (materialType === 'granite' ? 8 : 2);
        const nextTemp = prev.motorTemp + (targetTemp - prev.motorTemp) * 0.05 + (Math.random() - 0.5) * 0.4;
        const nextVib = 0.05 + beltSpeed * 0.15 + (materialType === 'granite' ? 0.08 : 0.02) + (Math.random() - 0.5) * 0.03;
        const nextThroughput = Math.round((beltSpeed * 45 + (materialType === 'granite' ? -5 : 8) + (Math.random() - 0.5) * 4) * 10) / 10;
        
        return {
          throughput: Math.max(0, nextThroughput),
          totalCrushed: prev.totalCrushed + (nextThroughput / 360), // Add incremental tons
          motorTemp: Math.min(110, Math.max(35, nextTemp)),
          vibration: Math.max(0.01, nextVib),
        };
      });
    }, 1000);

    return () => {
      if (telemetryIntervalRef.current) clearInterval(telemetryIntervalRef.current);
    };
  }, [beltSpeed, materialType, isEStopped]);

  // Audio system controls
  const handleSoundToggle = () => {
    if (!soundOn) {
      // Start audio context on user gesture
      try {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (!audioCtx) {
          audioCtx = new AudioContext();

          // 1. Motor hum
          motorOsc = audioCtx.createOscillator();
          motorOsc.type = 'sine';
          motorOsc.frequency.setValueAtTime(50, audioCtx.currentTime);
          
          motorGain = audioCtx.createGain();
          motorGain.gain.setValueAtTime(0.02, audioCtx.currentTime);

          motorOsc.connect(motorGain);
          motorGain.connect(audioCtx.destination);
          motorOsc.start();

          // 2. Grinding noise
          const bufferSize = audioCtx.sampleRate * 2;
          const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
          const data = buffer.getChannelData(0);
          for (let i = 0; i < bufferSize; i++) {
            data[i] = Math.random() * 2 - 1;
          }
          
          crushNoise = audioCtx.createBufferSource();
          crushNoise.buffer = buffer;
          crushNoise.loop = true;

          crushFilter = audioCtx.createBiquadFilter();
          crushFilter.type = 'bandpass';
          crushFilter.frequency.value = 180;
          crushFilter.Q.value = 2.0;

          crushGain = audioCtx.createGain();
          crushGain.gain.setValueAtTime(0.01, audioCtx.currentTime);

          crushNoise.connect(crushFilter);
          crushFilter.connect(crushGain);
          crushGain.connect(audioCtx.destination);
          crushNoise.start();
        } else if (audioCtx.state === 'suspended') {
          audioCtx.resume();
        }
      } catch (err) {
        console.error("Audio failed to initialize", err);
      }
      setSoundOn(true);
    } else {
      if (audioCtx && audioCtx.state === 'running') {
        audioCtx.suspend();
      }
      setSoundOn(false);
    }
  };

  // Sync audio node values with controls
  useEffect(() => {
    if (!soundOn || !audioCtx) return;

    const actualSpeed = isEStopped ? 0 : beltSpeed;
    const targetMotorGain = actualSpeed === 0 ? 0 : 0.01 + actualSpeed * 0.015;
    const targetCrushGain = actualSpeed === 0 ? 0 : 0.005 + actualSpeed * 0.01;
    const targetMotorFreq = 40 + actualSpeed * 10;
    const targetFilterFreq = 120 + actualSpeed * 40 + (materialType === 'granite' ? 50 : 0);

    if (motorGain) motorGain.gain.setTargetAtTime(targetMotorGain, audioCtx.currentTime, 0.1);
    if (motorOsc) motorOsc.frequency.setTargetAtTime(targetMotorFreq, audioCtx.currentTime, 0.2);
    if (crushGain) crushGain.gain.setTargetAtTime(targetCrushGain, audioCtx.currentTime, 0.15);
    if (crushFilter) crushFilter.frequency.setTargetAtTime(targetFilterFreq, audioCtx.currentTime, 0.2);
  }, [beltSpeed, materialType, isEStopped, soundOn]);

  // Cleanup audio nodes on unmount
  useEffect(() => {
    return () => {
      if (audioCtx) {
        audioCtx.close().catch(() => {});
        audioCtx = null;
        motorOsc = null;
        motorGain = null;
        crushNoise = null;
        crushGain = null;
        crushFilter = null;
      }
    };
  }, []);

  // Core Particle System and Animation Loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    // Make canvas display responsive but high resolution
    const dpr = window.devicePixelRatio || 1;
    canvas.width = 750 * dpr;
    canvas.height = 340 * dpr;
    ctx.scale(dpr, dpr);

    const colors = materialColors[materialType];
    let spawnTimer = 0;
    
    // Conveyor line definitions
    const hopperX = 70;
    const hopperY = 30;
    
    const crusherX = 70;
    const crusherY = 120;
    
    const beltStartX = 90;
    const beltEndX = 480;
    const beltY = 220;

    const sensorX = 500;
    const sensorY = 250;

    particlesRef.current = [];
    pulsesRef.current = [];

    const drawCrusherHopper = (context) => {
      // Hopper metal body
      context.fillStyle = '#334155';
      context.beginPath();
      context.moveTo(35, 20);
      context.lineTo(105, 20);
      context.lineTo(85, 80);
      context.lineTo(55, 80);
      context.closePath();
      context.fill();

      // Hopper bolts/rim
      context.strokeStyle = '#475569';
      context.lineWidth = 3;
      context.strokeRect(33, 17, 74, 5);

      // Jaw Crusher main frame
      context.fillStyle = '#1e293b';
      context.fillRect(40, 80, 60, 60);

      // Jaw hydraulic arm / Flywheel
      const time = Date.now() * 0.005 * (isEStopped ? 0 : beltSpeed);
      const angle = time;
      const flyX = 50 + Math.cos(angle) * 8;
      const flyY = 110 + Math.sin(angle) * 8;

      context.strokeStyle = '#64748b';
      context.lineWidth = 4;
      context.beginPath();
      context.moveTo(flyX, flyY);
      context.lineTo(75, 125);
      context.stroke();

      // Rotating Flywheel
      context.fillStyle = '#475569';
      context.beginPath();
      context.arc(50, 110, 18, 0, Math.PI * 2);
      context.fill();
      context.strokeStyle = '#f8fafc';
      context.lineWidth = 2;
      context.beginPath();
      context.arc(50, 110, 18, angle, angle + 0.5);
      context.stroke();
      context.beginPath();
      context.arc(50, 110, 18, angle + Math.PI, angle + Math.PI + 0.5);
      context.stroke();

      // Jaw vibration plate
      const jawOffset = (isEStopped ? 0 : beltSpeed) > 0 ? Math.sin(Date.now() * 0.03) * 3 : 0;
      context.fillStyle = '#0f172a';
      context.fillRect(72 + jawOffset, 85, 8, 40);

      // Danger stripes on crusher body
      context.strokeStyle = '#eab308';
      context.lineWidth = 3;
      context.beginPath();
      context.moveTo(42, 130);
      context.lineTo(52, 140);
      context.moveTo(52, 130);
      context.lineTo(62, 140);
      context.moveTo(62, 130);
      context.lineTo(72, 140);
      context.stroke();
    };

    const drawConveyorBelt = (context) => {
      // Pulley Wheels
      const rot = (Date.now() * 0.008 * (isEStopped ? 0 : beltSpeed)) % (Math.PI * 2);
      
      const drawPulley = (x, y, r) => {
        context.fillStyle = '#334155';
        context.beginPath();
        context.arc(x, y, r, 0, Math.PI * 2);
        context.fill();
        context.strokeStyle = '#94a3b8';
        context.lineWidth = 2;
        context.beginPath();
        context.arc(x, y, r, rot, rot + 0.3);
        context.stroke();
        context.beginPath();
        context.arc(x, y, r, rot + Math.PI, rot + Math.PI + 0.3);
        context.stroke();
      };

      drawPulley(beltStartX + 10, beltY + 10, 12);
      drawPulley(beltEndX - 10, beltY + 10, 12);

      // Support rollers
      for (let rx = beltStartX + 60; rx < beltEndX - 40; rx += 60) {
        drawPulley(rx, beltY + 12, 6);
      }

      // Belt structural frame (truss)
      context.strokeStyle = '#475569';
      context.lineWidth = 3;
      context.beginPath();
      context.moveTo(beltStartX + 5, beltY + 22);
      context.lineTo(beltEndX - 5, beltY + 22);
      context.stroke();

      // Truss diagonal lines
      context.strokeStyle = '#1e293b';
      context.lineWidth = 1.5;
      context.beginPath();
      for (let tx = beltStartX + 20; tx < beltEndX - 20; tx += 30) {
        context.moveTo(tx, beltY + 10);
        context.lineTo(tx + 15, beltY + 22);
        context.moveTo(tx + 15, beltY + 10);
        context.lineTo(tx, beltY + 22);
      }
      context.stroke();

      // Conveyor Rubber Belt itself
      context.strokeStyle = '#0f172a';
      context.lineWidth = 6;
      context.beginPath();
      context.roundRect(beltStartX, beltY, beltEndX - beltStartX, 16, 8);
      context.stroke();

      // Moving belt texture/dashes
      const dashOffset = (Date.now() * 0.05 * (isEStopped ? 0 : beltSpeed)) % 20;
      context.strokeStyle = '#334155';
      context.lineWidth = 2;
      context.setLineDash([6, 14]);
      context.lineDashOffset = -dashOffset;
      context.beginPath();
      context.moveTo(beltStartX + 5, beltY + 3);
      context.lineTo(beltEndX - 5, beltY + 3);
      context.stroke();
      context.setLineDash([]); // Reset
    };

    const drawDischargeHopperAndWire = (context) => {
      // Discharge sensor plate / funnel
      context.fillStyle = '#1e293b';
      context.beginPath();
      context.moveTo(470, 240);
      context.lineTo(520, 240);
      context.lineTo(505, 270);
      context.lineTo(485, 270);
      context.closePath();
      context.fill();

      // Sensor indicator light
      const sensorActive = (isEStopped ? 0 : beltSpeed) > 0 && particlesRef.current.some(p => p.state === 'falling' && p.y > 230);
      context.fillStyle = isEStopped ? '#ef4444' : (sensorActive ? '#3b82f6' : '#1e293b');
      context.beginPath();
      context.arc(495, 240, 4, 0, Math.PI * 2);
      context.fill();
      if (sensorActive && !isEStopped) {
        context.shadowColor = '#3b82f6';
        context.shadowBlur = 8;
        context.fillStyle = 'rgba(59, 130, 246, 0.4)';
        context.beginPath();
        context.arc(495, 240, 8, 0, Math.PI * 2);
        context.fill();
        context.shadowBlur = 0; // Reset
      }

      // Energy transmission wire to logo card
      context.strokeStyle = isEStopped ? '#ef4444' : '#1e293b';
      context.lineWidth = 3;
      context.beginPath();
      context.moveTo(495, 245);
      context.lineTo(495, 285);
      context.lineTo(600, 285);
      context.lineTo(600, 195);
      context.stroke();

      // Render glowing energy pulses traveling to the logo
      if (!isEStopped && (isEStopped ? 0 : beltSpeed) > 0) {
        pulsesRef.current.forEach((pulse, pIdx) => {
          pulse.progress += 0.015 * (beltSpeed * 0.7 + 0.3);
          
          if (pulse.progress >= 1.0) {
            // Pulse hits the logo! Trigger pulse effect
            setLogoPulse(true);
            setTimeout(() => setLogoPulse(false), 150);
            
            // Choose color based on material
            if (materialType === 'granite') {
              setLogoPulseColor('rgba(168, 162, 158, 0.5)'); // Stone grey
            } else if (materialType === 'gravel') {
              setLogoPulseColor('rgba(234, 88, 12, 0.5)'); // Orange
            } else {
              setLogoPulseColor('rgba(59, 130, 246, 0.5)'); // Cyan/Blue
            }

            pulsesRef.current.splice(pIdx, 1);
            return;
          }

          // Calculate current coordinate along wire path
          let px = 495;
          let py = 285;
          const segment1 = 0.25; // proportion of wire going down
          const segment2 = 0.70; // proportion of wire going right

          if (pulse.progress < segment1) {
            const t = pulse.progress / segment1;
            py = 245 + t * 40;
          } else if (pulse.progress < segment2) {
            const t = (pulse.progress - segment1) / (segment2 - segment1);
            py = 285;
            px = 495 + t * 105;
          } else {
            const t = (pulse.progress - segment2) / (1.0 - segment2);
            px = 600;
            py = 285 - t * 90;
          }

          // Draw the electric spark
          context.shadowColor = materialType === 'granite' ? '#a8a29e' : (materialType === 'gravel' ? '#ea580c' : '#3b82f6');
          context.shadowBlur = 6;
          context.fillStyle = '#ffffff';
          context.beginPath();
          context.arc(px, py, 4, 0, Math.PI * 2);
          context.fill();
          context.shadowBlur = 0;
        });
      }
    };

    const drawAccumulationPile = (context) => {
      // Accumulating pile at the discharge point
      context.fillStyle = colors[colors.length - 1];
      context.beginPath();
      context.moveTo(440, 310);
      
      // Draw smooth pile bezier curves
      context.quadraticCurveTo(495, 310 - Math.min(45, pileHeightsRef.current[50]), 550, 310);
      context.closePath();
      context.fill();
    };

    const loop = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const actualSpeed = isEStopped ? 0 : beltSpeed;

      // 1. Spawning system
      if (actualSpeed > 0) {
        spawnTimer += actualSpeed;
        if (spawnTimer >= 15) {
          spawnTimer = 0;
          // Spawn new big rock in hopper
          particlesRef.current.push({
            id: Math.random(),
            x: hopperX + (Math.random() - 0.5) * 35,
            y: 10 + Math.random() * 10,
            vx: (Math.random() - 0.5) * 0.4,
            vy: 0.5 + Math.random() * 0.5,
            size: 15 + Math.random() * 8, // Large rock diameter
            color: colors[Math.floor(Math.random() * colors.length)],
            state: 'hopper',
            rotation: Math.random() * Math.PI,
            rotSpeed: (Math.random() - 0.5) * 0.05,
          });
        }
      }

      // 2. Physics & Draw Particles
      particlesRef.current.forEach((p, idx) => {
        // Apply rotation
        p.rotation += p.rotSpeed * actualSpeed;

        if (p.state === 'hopper') {
          // Gravitate down
          p.x += p.vx * actualSpeed;
          p.y += p.vy * actualSpeed;
          p.vy += 0.08 * actualSpeed;

          // Collide with hopper walls
          const wallLeft = 55 + (p.y - 20) * 0.33;
          const wallRight = 85 - (p.y - 20) * 0.33;
          if (p.x - p.size / 2 < wallLeft) {
            p.x = wallLeft + p.size / 2;
            p.vx = Math.abs(p.vx) * 0.6;
          }
          if (p.x + p.size / 2 > wallRight) {
            p.x = wallRight - p.size / 2;
            p.vx = -Math.abs(p.vx) * 0.6;
          }

          // Transition to crushing
          if (p.y >= crusherY - 20) {
            p.state = 'crushing';
            p.vy = 0.5;
            p.vx = 0;
          }

          // Draw large rocks
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rotation);
          ctx.fillStyle = p.color;
          ctx.beginPath();
          // Draw irregular stone shape
          ctx.moveTo(0, -p.size / 2);
          ctx.lineTo(p.size * 0.4, -p.size * 0.35);
          ctx.lineTo(p.size / 2, p.size * 0.1);
          ctx.lineTo(p.size * 0.25, p.size / 2);
          ctx.lineTo(-p.size * 0.3, p.size * 0.45);
          ctx.lineTo(-p.size / 2, -p.size * 0.15);
          ctx.closePath();
          ctx.fill();
          ctx.restore();
        } 
        else if (p.state === 'crushing') {
          // Slowly squeeze through crusher throat
          p.y += p.vy * actualSpeed;
          
          const squeezeTime = Date.now() * 0.02;
          const vibration = Math.sin(squeezeTime) * 1.5;
          p.x = crusherX + vibration;

          // Split / Break into smaller particles
          if (p.y >= crusherY + 20) {
            const smallParticlesCount = 3 + Math.floor(Math.random() * 3);
            for (let s = 0; s < smallParticlesCount; s++) {
              particlesRef.current.push({
                id: Math.random(),
                x: p.x + (Math.random() - 0.5) * 12,
                y: p.y + 10 + (Math.random() - 0.5) * 5,
                vx: (Math.random() - 0.5) * 1.2,
                vy: 0.8 + Math.random() * 1.2,
                size: 4 + Math.random() * 5, // Split rocks are small
                color: colors[Math.floor(Math.random() * colors.length)],
                state: 'falling_to_belt',
                rotation: Math.random() * Math.PI,
                rotSpeed: (Math.random() - 0.5) * 0.15,
              });
            }
            particlesRef.current.splice(idx, 1);
            return;
          }

          // Draw large squeezing rock
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rotation);
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.arc(0, 0, p.size / 2, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
        else if (p.state === 'falling_to_belt') {
          // Falling onto conveyor belt
          p.x += p.vx * actualSpeed;
          p.y += p.vy * actualSpeed;
          p.vy += 0.08 * actualSpeed;

          // Check landing on belt
          if (p.y >= beltY) {
            p.y = beltY - p.size / 2;
            p.state = 'conveyor';
            p.vy = 0;
            p.vx = actualSpeed * 1.8; // belt conveyor speed scale
          }

          // Draw falling small particle
          ctx.fillStyle = p.color;
          ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
        }
        else if (p.state === 'conveyor') {
          // Ride the belt
          p.vx = actualSpeed * 1.8;
          p.x += p.vx;

          // Drop off at end of belt
          if (p.x >= beltEndX - 10) {
            p.state = 'falling';
            p.vy = 0.5; // initial downwards push
            p.vx = actualSpeed * 1.2; // horizontal momentum
          }

          // Draw particle riding belt
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rotation);
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.rect(-p.size / 2, -p.size / 2, p.size, p.size);
          ctx.fill();
          ctx.restore();
        }
        else if (p.state === 'falling') {
          // Falling off belt (projectile motion)
          p.x += p.vx;
          p.y += p.vy;
          p.vy += 0.2; // gravity pull

          // Collides with sensor plate
          if (p.y >= sensorY && p.x >= 470 && p.x <= 520) {
            // Spawn a telemetry pulse if it's the first time hitting the sensor
            if (!p.sensorTriggered) {
              p.sensorTriggered = true;
              if (pulsesRef.current.length < 8) { // cap concurrent pulses
                pulsesRef.current.push({ progress: 0 });
              }
            }
          }

          // Hits ground pile
          if (p.y >= 300) {
            p.state = 'landed';
            p.life = 60; // frames to fade away
            pileHeightsRef.current[50] = Math.min(80, pileHeightsRef.current[50] + 0.1);
          }

          // Draw projectile
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rotation);
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.moveTo(-p.size / 2, 0);
          ctx.lineTo(0, -p.size / 2);
          ctx.lineTo(p.size / 2, 0);
          ctx.lineTo(0, p.size / 2);
          ctx.closePath();
          ctx.fill();
          ctx.restore();
        }
        else if (p.state === 'landed') {
          p.life -= 1;
          if (p.life <= 0) {
            particlesRef.current.splice(idx, 1);
            return;
          }

          // Render fading particle on the pile
          ctx.save();
          ctx.globalAlpha = p.life / 60;
          ctx.translate(p.x, p.y);
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.arc(0, 0, p.size / 2, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
      });

      // 3. Static Elements drawing
      drawAccumulationPile(ctx);
      drawConveyorBelt(ctx);
      drawCrusherHopper(ctx);
      drawDischargeHopperAndWire(ctx);

      animationFrameId.current = requestAnimationFrame(loop);
    };

    loop();

    return () => {
      if (animationFrameId.current) cancelAnimationFrame(animationFrameId.current);
    };
  }, [beltSpeed, materialType, isEStopped, materialColors]);

  // Handle emergency stop trigger
  const triggerEStop = () => {
    setIsEStopped(prev => {
      const nextVal = !prev;
      if (nextVal) {
        setBeltSpeed(0);
      } else {
        setBeltSpeed(1); // Resume normal on reset
      }
      return nextVal;
    });
  };

  // Vibration Oscillosope Wave Canvas rendering
  const vibeCanvasRef = useRef(null);
  useEffect(() => {
    const vibeCanvas = vibeCanvasRef.current;
    if (!vibeCanvas) return;
    const ctx = vibeCanvas.getContext('2d');
    vibeCanvas.width = 300;
    vibeCanvas.height = 70;

    let time = 0;
    let waveFrame;

    const drawWave = () => {
      ctx.fillStyle = '#020617';
      ctx.fillRect(0, 0, vibeCanvas.width, vibeCanvas.height);

      // Grid lines
      ctx.strokeStyle = '#1e293b';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let gy = 10; gy < vibeCanvas.height; gy += 15) {
        ctx.moveTo(0, gy);
        ctx.lineTo(vibeCanvas.width, gy);
      }
      ctx.stroke();

      // Draw sine wave with noise based on statistics.vibration
      ctx.strokeStyle = isEStopped ? '#ef4444' : '#10b981';
      ctx.lineWidth = 2;
      ctx.beginPath();
      
      const speedScale = isEStopped ? 0.05 : (beltSpeed * 0.15 + 0.05);
      const amp = isEStopped ? 2 : (10 + beltSpeed * 8 + (materialType === 'granite' ? 5 : 0));
      
      ctx.moveTo(0, vibeCanvas.height / 2);
      for (let x = 0; x < vibeCanvas.width; x++) {
        const noise = (Math.random() - 0.5) * (isEStopped ? 0.5 : (beltSpeed * 4));
        const y = vibeCanvas.height / 2 + Math.sin(x * 0.08 - time) * amp + noise;
        ctx.lineTo(x, y);
      }
      ctx.stroke();

      time += speedScale;
      waveFrame = requestAnimationFrame(drawWave);
    };

    drawWave();

    return () => {
      if (waveFrame) cancelAnimationFrame(waveFrame);
    };
  }, [beltSpeed, isEStopped, materialType]);

  return (
    <div className="space-y-6 w-full pb-8">
      {/* Control Room Title */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100 flex items-center gap-3">
            <span className="inline-block w-3.5 h-3.5 bg-blue-600 rounded-full animate-ping"></span>
            Crusher Control Console
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Realtime mechanical diagnostics & conveyor monitoring
          </p>
        </div>

        {/* System Health Status Pill */}
        <div className={`px-4 py-1.5 rounded-full border text-xs font-semibold uppercase tracking-wider shadow-sm flex items-center gap-2 ${
          isEStopped 
            ? 'bg-red-500/10 border-red-500/30 text-red-500 animate-pulse' 
            : (beltSpeed === 0 
                ? 'bg-amber-500/10 border-amber-500/30 text-amber-500' 
                : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-500'
              )
        }`}>
          <span className={`w-2 h-2 rounded-full ${
            isEStopped 
              ? 'bg-red-500' 
              : (beltSpeed === 0 ? 'bg-amber-500' : 'bg-emerald-500')
          }`}></span>
          {isEStopped ? 'EMERGENCY SHUTDOWN ACTIVE' : (beltSpeed === 0 ? 'SYSTEM IDLE' : 'CONVEYOR OPERATIONAL')}
        </div>
      </div>

      {/* Main Grid Layout */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        
        {/* Left Column: Visual Viewport */}
        <div className="xl:col-span-2 flex flex-col bg-slate-900 border border-slate-800 rounded-2xl shadow-xl overflow-hidden min-h-[440px]">
          {/* Header Panel */}
          <div className="bg-slate-950 px-5 py-3 border-b border-slate-800 flex justify-between items-center text-xs font-mono text-slate-400">
            <div className="flex items-center gap-4">
              <span>🖥️ CAMERA FEED: CONVEYOR_01</span>
              <span>GPS: 11.018° N, 76.955° E</span>
            </div>
            <div className="flex items-center gap-2">
              <span className={`w-2.5 h-2.5 rounded-full ${isEStopped ? 'bg-red-500 animate-ping' : 'bg-green-500'}`}></span>
              <span>LIVE FEED</span>
            </div>
          </div>

          {/* Viewport Container */}
          <div className="relative flex-1 bg-slate-950/60 p-4 flex items-center justify-center min-h-[350px]">
            
            {/* The Main Simulation Canvas */}
            <canvas 
              ref={canvasRef} 
              className="w-full max-w-[750px] aspect-[75/34] block z-10" 
            />

            {/* Glowing reveal frame at the end containing KBM Logo */}
            <div className="absolute right-5 md:right-8 top-1/2 -translate-y-1/2 z-20">
              <div 
                className="relative p-5 rounded-2xl backdrop-blur-md transition-all duration-300 border bg-slate-900/70 shadow-[0_0_20px_rgba(15,23,42,0.6)] flex flex-col items-center justify-center text-center w-[160px] md:w-[190px]"
                style={{
                  borderColor: isEStopped 
                    ? '#ef4444' 
                    : (logoPulse ? logoPulseColor.replace('0.4', '0.9') : 'rgba(30, 41, 59, 0.6)'),
                  boxShadow: isEStopped 
                    ? '0 0 25px rgba(239, 68, 68, 0.25)' 
                    : (logoPulse ? `0 0 35px ${logoPulseColor}` : 'none'),
                  transform: logoPulse ? 'scale(1.05)' : 'scale(1)',
                }}
              >
                {/* Neon Tube Border Light Effect */}
                <div className={`absolute inset-0 rounded-2xl border-2 pointer-events-none opacity-40 transition-opacity duration-300 ${
                  isEStopped ? 'border-red-500 animate-pulse' : 'border-blue-500'
                }`} />

                {/* The Animated Logo Image */}
                <div className="relative w-24 h-24 md:w-32 md:h-32 mb-2 flex items-center justify-center rounded-xl bg-slate-950 p-3 overflow-hidden group">
                  <img 
                    src={logoUrl} 
                    alt="Krishna Blue Metals" 
                    className={`h-full w-full object-contain transition-all duration-500 ${
                      isEStopped 
                        ? 'opacity-40 grayscale blur-[1px]' 
                        : 'opacity-100 group-hover:scale-110'
                    }`} 
                  />
                  {/* Shimmer Glare overlay */}
                  <div className={`absolute inset-0 bg-gradient-to-tr from-transparent via-white/10 to-transparent -translate-x-full transition-transform duration-1000 ${
                    logoPulse && !isEStopped ? 'translate-x-full' : ''
                  }`} />
                </div>

                <div className="text-slate-200 font-bold tracking-wide text-xs uppercase select-none">
                  KBM Crusher
                </div>
                <div className="text-[10px] text-slate-500 font-mono select-none">
                  INTEGRATED
                </div>
              </div>
            </div>

            {/* Emergency Alarm Flash Screen Overlay */}
            {isEStopped && (
              <div className="absolute inset-0 bg-red-600/10 border border-red-500/40 pointer-events-none animate-pulse z-0" />
            )}
          </div>
        </div>

        {/* Right Column: Control Panel & Telemetry */}
        <div className="flex flex-col gap-6">
          
          {/* Diagnostic Telemetry Dashboard */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-400 border-b border-slate-800 pb-2">
              System Telemetry
            </h3>

            {/* Diagnostic Dials */}
            <div className="grid grid-cols-2 gap-4">
              {/* Dial 1: Throughput */}
              <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-3 text-center">
                <div className="text-slate-500 text-[10px] font-bold uppercase tracking-wider mb-1">
                  Throughput Rate
                </div>
                <div className="text-2xl font-bold font-mono text-blue-400">
                  {statistics.throughput} <span className="text-xs text-slate-500">t/h</span>
                </div>
              </div>

              {/* Dial 2: Total Crushed */}
              <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-3 text-center">
                <div className="text-slate-500 text-[10px] font-bold uppercase tracking-wider mb-1">
                  Session Yield
                </div>
                <div className="text-2xl font-bold font-mono text-emerald-400">
                  {statistics.totalCrushed.toFixed(2)} <span className="text-xs text-slate-500">tons</span>
                </div>
              </div>

              {/* Dial 3: Temperature */}
              <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-3 text-center">
                <div className="text-slate-500 text-[10px] font-bold uppercase tracking-wider mb-1 flex items-center justify-center gap-1">
                  Motor Temp
                  {statistics.motorTemp > 90 && (
                    <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-ping"></span>
                  )}
                </div>
                <div className={`text-2xl font-bold font-mono ${
                  statistics.motorTemp > 90 
                    ? 'text-red-500 animate-bounce' 
                    : (statistics.motorTemp > 75 ? 'text-amber-500' : 'text-slate-300')
                }`}>
                  {Math.round(statistics.motorTemp)}°C
                </div>
              </div>

              {/* Dial 4: Sound Toggle */}
              <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-3 flex flex-col justify-center items-center">
                <div className="text-slate-500 text-[10px] font-bold uppercase tracking-wider mb-1">
                  Acoustic Feedback
                </div>
                <button 
                  onClick={handleSoundToggle}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold w-full max-w-[100px] transition-colors border ${
                    soundOn 
                      ? 'bg-blue-600 border-blue-500 text-white hover:bg-blue-700' 
                      : 'bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-700'
                  }`}
                >
                  {soundOn ? '🔊 ACTIVE' : '🔇 MUTED'}
                </button>
              </div>
            </div>

            {/* Vibration Waveform Canvas */}
            <div className="space-y-1.5">
              <div className="text-slate-500 text-[10px] font-bold uppercase tracking-wider flex justify-between">
                <span>Vibe Sensor Oscillo</span>
                <span className="font-mono">{statistics.vibration.toFixed(3)} mm/s</span>
              </div>
              <div className="h-16 rounded-xl border border-slate-800 overflow-hidden relative">
                <canvas ref={vibeCanvasRef} className="w-full h-full block" />
              </div>
            </div>
          </div>

          {/* Mechanical Controls Panel */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-400 border-b border-slate-800 pb-2">
              Conveyor Settings
            </h3>

            {/* Material Selector */}
            <div className="space-y-2">
              <label className="block text-slate-500 text-[10px] font-bold uppercase tracking-wider">
                Raw Ore Input
              </label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { id: 'blue-metal', label: 'Blue Metal', color: 'border-slate-600 bg-slate-800/40 text-slate-300' },
                  { id: 'granite', label: 'Granite Ore', color: 'border-stone-600 bg-stone-900/40 text-stone-300' },
                  { id: 'gravel', label: 'River Stone', color: 'border-orange-800 bg-orange-950/20 text-orange-400' },
                ].map((item) => (
                  <button
                    key={item.id}
                    disabled={isEStopped}
                    onClick={() => setMaterialType(item.id)}
                    className={`p-2.5 rounded-xl border text-xs font-semibold transition-all duration-200 ${
                      materialType === item.id 
                        ? 'border-blue-500 bg-blue-600/10 text-blue-400 shadow-[0_0_10px_rgba(59,130,246,0.1)]' 
                        : 'border-slate-800 bg-slate-950/40 hover:border-slate-700 text-slate-400 hover:text-slate-200'
                    } disabled:opacity-30 disabled:cursor-not-allowed`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Speed selection */}
            <div className="space-y-2">
              <label className="block text-slate-500 text-[10px] font-bold uppercase tracking-wider">
                Conveyor Belt Speed
              </label>
              <div className="grid grid-cols-5 gap-1.5">
                {[
                  { value: 0, label: 'OFF' },
                  { value: 0.5, label: '0.5x' },
                  { value: 1, label: '1.0x' },
                  { value: 2, label: '2.0x' },
                  { value: 3, label: 'MAX' },
                ].map((s) => (
                  <button
                    key={s.value}
                    disabled={isEStopped}
                    onClick={() => setBeltSpeed(s.value)}
                    className={`py-1.5 rounded-lg border text-xs font-mono font-bold transition-all duration-150 ${
                      beltSpeed === s.value && !isEStopped
                        ? 'border-blue-500 bg-blue-600/10 text-blue-400' 
                        : 'border-slate-800 bg-slate-950/40 hover:border-slate-700 text-slate-400'
                    } disabled:opacity-30 disabled:cursor-not-allowed`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Emergency E-Stop Button */}
            <div className="pt-2">
              <button 
                onClick={triggerEStop}
                className={`w-full py-4 rounded-xl border font-bold text-sm tracking-wider uppercase transition-all duration-300 select-none ${
                  isEStopped 
                    ? 'bg-emerald-600 border-emerald-500 text-white hover:bg-emerald-700 hover:scale-[1.01] shadow-[0_0_20px_rgba(16,185,129,0.3)] animate-pulse' 
                    : 'bg-red-600 border-red-500 text-white hover:bg-red-700 hover:scale-[1.01] shadow-[0_0_20px_rgba(239,68,68,0.35)]'
                }`}
              >
                {isEStopped ? '🔄 Reset Safety Relays' : '🛑 Emergency E-STOP'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
