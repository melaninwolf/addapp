*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

:root {
  --bg: #0D0D0F;
  --bg2: #141417;
  --bg3: #1C1C21;
  --border: #2A2A32;
  --border2: #3A3A45;
  --text: #F0EFF8;
  --text2: #8A89A0;
  --text3: #55546A;
  --accent: #8B7EFF;
  --accent2: #6355E8;
  --accent-glow: rgba(139,126,255,0.15);
  --amber: #F5A623;
  --amber-bg: rgba(245,166,35,0.1);
  --green: #3ECFA0;
  --green-bg: rgba(62,207,160,0.1);
  --red: #FF6B6B;
  --red-bg: rgba(255,107,107,0.1);
  --font: 'Syne', sans-serif;
  --mono: 'DM Mono', monospace;
  --radius: 12px;
  --radius-sm: 8px;
  --radius-lg: 16px;
  --radius-xl: 24px;
}

html { font-size: 16px; }

body {
  font-family: var(--font);
  background: var(--bg);
  color: var(--text);
  min-height: 100vh;
  -webkit-font-smoothing: antialiased;
}

button { font-family: var(--font); cursor: pointer; }
input, select, textarea { font-family: var(--font); }

::-webkit-scrollbar { width: 4px; }
::-webkit-scrollbar-track { background: var(--bg); }
::-webkit-scrollbar-thumb { background: var(--border2); border-radius: 99px; }
