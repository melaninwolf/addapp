// ── AddApp Content Script ─────────────────────────────────────────────────────
// Injected into every page. Handles:
//   1. Focus badge — floating timer shown while a focus session is active
//   2. Distraction blocker — overlay when visiting a distracting site during focus
//   3. Text selection → quick task (tooltip on selection)

;(function () {
  'use strict'

  // ── State ────────────────────────────────────────────────────────────────────
  let focusState   = null
  let badgeEl      = null
  let blockerEl    = null
  let selTipEl     = null
  let tickInterval = null

  // ── Focus badge ──────────────────────────────────────────────────────────────
  function createBadge() {
    if (badgeEl) return
    badgeEl = document.createElement('div')
    badgeEl.id = 'addapp-focus-badge'
    badgeEl.innerHTML = `
      <span id="addapp-badge-icon">🎯</span>
      <span id="addapp-badge-timer">--:--</span>
      <button id="addapp-badge-stop" title="End focus session">■</button>
    `
    document.body.appendChild(badgeEl)
    makeDraggable(badgeEl)

    document.getElementById('addapp-badge-stop').addEventListener('click', e => {
      e.stopPropagation()
      chrome.runtime.sendMessage({ type: 'STOP_FOCUS' })
      removeBadge()
    })
  }

  function removeBadge() {
    clearInterval(tickInterval)
    tickInterval = null
    if (badgeEl) { badgeEl.remove(); badgeEl = null }
  }

  function updateBadgeTick() {
    if (!focusState || !badgeEl) return
    const remaining = Math.max(0, focusState.endsAt - Date.now())
    const mins = Math.floor(remaining / 60000)
    const secs = Math.floor((remaining % 60000) / 1000)
    const el = document.getElementById('addapp-badge-timer')
    if (el) el.textContent = `${String(mins).padStart(2,'0')}:${String(secs).padStart(2,'0')}`
    if (remaining <= 0) removeBadge()
  }

  function showFocusBadge(state) {
    focusState = state
    createBadge()
    clearInterval(tickInterval)
    tickInterval = setInterval(updateBadgeTick, 1000)
    updateBadgeTick()
  }

  // ── Distraction blocker ───────────────────────────────────────────────────────
  function showBlocker(domain, appName, focusLabel) {
    if (blockerEl) return
    blockerEl = document.createElement('div')
    blockerEl.id = 'addapp-blocker'
    blockerEl.innerHTML = `
      <div id="addapp-blocker-card">
        <div id="addapp-blocker-emoji">🚫</div>
        <h1>Distraction detected</h1>
        <p>You opened <strong>${appName}</strong> while in a focus session.</p>
        <p class="addapp-focus-label">🎯 ${focusLabel}</p>
        <div id="addapp-blocker-btns">
          <button id="addapp-blocker-back" class="addapp-btn-primary">← Go back</button>
          <button id="addapp-blocker-allow" class="addapp-btn-ghost">Allow this once</button>
        </div>
        <p class="addapp-blocker-sub">You got this. Stay focused.</p>
      </div>
    `
    document.body.appendChild(blockerEl)

    document.getElementById('addapp-blocker-back').addEventListener('click', () => {
      history.back()
    })
    document.getElementById('addapp-blocker-allow').addEventListener('click', () => {
      blockerEl.remove()
      blockerEl = null
    })
  }

  // ── Text selection → task tip ─────────────────────────────────────────────────
  function createSelTip() {
    if (selTipEl) return
    selTipEl = document.createElement('button')
    selTipEl.id = 'addapp-sel-tip'
    selTipEl.textContent = '📋 Save as task'
    document.body.appendChild(selTipEl)

    selTipEl.addEventListener('click', e => {
      e.preventDefault()
      const text = window.getSelection()?.toString().trim()
      if (!text) { hideSelTip(); return }
      chrome.runtime.sendMessage({ type: 'ADD_TASK', title: text.slice(0, 120) }, res => {
        selTipEl.textContent = res?.ok ? '✅ Saved!' : '⚠️ Sign in first'
        setTimeout(() => { hideSelTip() }, 1200)
      })
    })
  }

  function showSelTip(x, y) {
    createSelTip()
    // Position above selection, keep within viewport
    const vw = window.innerWidth
    const left = Math.min(x, vw - 160)
    selTipEl.style.left = `${left + window.scrollX}px`
    selTipEl.style.top  = `${y + window.scrollY - 36}px`
    selTipEl.style.display = 'block'
    selTipEl.textContent = '📋 Save as task'
  }

  function hideSelTip() {
    if (selTipEl) selTipEl.style.display = 'none'
  }

  document.addEventListener('mouseup', e => {
    setTimeout(() => {
      const sel = window.getSelection()?.toString().trim()
      if (sel && sel.length > 3 && sel.length < 300) {
        const range = window.getSelection().getRangeAt(0).getBoundingClientRect()
        showSelTip(range.left + range.width / 2 - 60, range.top)
      } else {
        hideSelTip()
      }
    }, 50)
  })

  document.addEventListener('mousedown', e => {
    if (selTipEl && e.target !== selTipEl) hideSelTip()
  })

  // ── Draggable helper ──────────────────────────────────────────────────────────
  function makeDraggable(el) {
    let startX, startY, startLeft, startTop
    el.addEventListener('mousedown', e => {
      if (e.target.tagName === 'BUTTON') return
      startX    = e.clientX
      startY    = e.clientY
      const rect = el.getBoundingClientRect()
      startLeft = rect.left
      startTop  = rect.top

      function onMove(e) {
        const dx = e.clientX - startX
        const dy = e.clientY - startY
        el.style.left   = `${startLeft + dx}px`
        el.style.top    = `${startTop  + dy}px`
        el.style.right  = 'auto'
        el.style.bottom = 'auto'
      }
      function onUp() {
        document.removeEventListener('mousemove', onMove)
        document.removeEventListener('mouseup',   onUp)
      }
      document.addEventListener('mousemove', onMove)
      document.addEventListener('mouseup',   onUp)
    })
  }

  // ── Message listener ──────────────────────────────────────────────────────────
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === 'FOCUS_STATE') {
      if (msg.focus) {
        showFocusBadge(msg.focus)
      } else {
        focusState = null
        removeBadge()
      }
    }

    if (msg.type === 'DISTRACTION_BLOCK') {
      showBlocker(msg.domain, msg.appName, msg.focus)
    }
  })

  // ── On load: request current focus state ──────────────────────────────────────
  chrome.runtime.sendMessage({ type: 'GET_FOCUS' }, res => {
    if (res?.focus) showFocusBadge(res.focus)
  })

})()
