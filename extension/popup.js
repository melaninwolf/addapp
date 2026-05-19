// ── AddApp Extension Popup ────────────────────────────────────────────────────

const $ = id => document.getElementById(id)

let selectedDur = 25
let focusInterval = null
let tasks = []

// ── Init ──────────────────────────────────────────────────────────────────────
async function init() {
  const { session } = await msg('GET_SESSION')
  if (session?.user) {
    showMain()
  } else {
    showAuth()
  }
}

function showAuth() {
  $('screen-auth').style.display = 'block'
  $('screen-main').style.display = 'none'
}

async function showMain() {
  $('screen-auth').style.display = 'none'
  $('screen-main').style.display = 'block'
  await refreshFocus()
  await loadTasks()
}

// ── Messaging ─────────────────────────────────────────────────────────────────
function msg(type, data = {}) {
  return new Promise(resolve =>
    chrome.runtime.sendMessage({ type, ...data }, resolve)
  )
}

// ── Auth ──────────────────────────────────────────────────────────────────────
$('auth-submit').addEventListener('click', async () => {
  const email    = $('auth-email').value.trim()
  const password = $('auth-password').value
  if (!email || !password) return

  $('auth-submit').textContent = 'Signing in…'
  $('auth-submit').disabled = true
  $('auth-error').style.display = 'none'

  const result = await msg('SIGN_IN', { email, password })

  if (result?.ok) {
    showMain()
  } else {
    $('auth-error').textContent = result?.error || 'Sign-in failed'
    $('auth-error').style.display = 'block'
    $('auth-submit').textContent = 'Sign in'
    $('auth-submit').disabled = false
  }
})

$('auth-password').addEventListener('keydown', e => {
  if (e.key === 'Enter') $('auth-submit').click()
})

$('btn-signout').addEventListener('click', async () => {
  await msg('SIGN_OUT')
  showAuth()
})

// ── Duration selector ─────────────────────────────────────────────────────────
document.querySelectorAll('.dur-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.dur-btn').forEach(b => b.classList.remove('active'))
    btn.classList.add('active')
    selectedDur = parseInt(btn.dataset.min)
  })
})

// ── Focus session ─────────────────────────────────────────────────────────────
$('btn-start-focus').addEventListener('click', async () => {
  const label = $('focus-label').value.trim() || 'Focus Session'
  $('btn-start-focus').textContent = 'Starting…'
  $('btn-start-focus').disabled = true

  const result = await msg('START_FOCUS', { label, durationMins: selectedDur })

  if (result?.data) {
    await refreshFocus()
  }
  $('btn-start-focus').textContent = '🎯 Start focus'
  $('btn-start-focus').disabled = false
})

$('btn-stop-focus').addEventListener('click', async () => {
  $('btn-stop-focus').textContent = 'Ending…'
  $('btn-stop-focus').disabled = true
  await msg('STOP_FOCUS')
  clearInterval(focusInterval)
  focusInterval = null
  $('focus-active').style.display = 'none'
  $('focus-idle').style.display   = 'flex'
  $('btn-stop-focus').textContent = '■ End session'
  $('btn-stop-focus').disabled = false
})

async function refreshFocus() {
  const { focus } = await msg('GET_FOCUS')
  if (focus) {
    showFocusActive(focus)
  } else {
    $('focus-active').style.display = 'none'
    $('focus-idle').style.display   = 'flex'
  }
}

function showFocusActive(focus) {
  $('focus-idle').style.display   = 'none'
  $('focus-active').style.display = 'flex'
  $('focus-active-label').textContent = focus.label

  clearInterval(focusInterval)
  focusInterval = setInterval(() => updateFocusTick(focus), 1000)
  updateFocusTick(focus)
}

function updateFocusTick(focus) {
  const totalMs   = focus.durationMins * 60 * 1000
  const remaining = Math.max(0, focus.endsAt - Date.now())
  const elapsed   = totalMs - remaining
  const pct       = Math.min(100, (elapsed / totalMs) * 100)

  const mins = Math.floor(remaining / 60000)
  const secs = Math.floor((remaining % 60000) / 1000)
  $('focus-timer').textContent = `${String(mins).padStart(2,'0')}:${String(secs).padStart(2,'0')}`
  $('focus-progress-fill').style.width = `${pct}%`

  if (remaining <= 0) {
    clearInterval(focusInterval)
    $('focus-active').style.display = 'none'
    $('focus-idle').style.display   = 'flex'
  }
}

// ── Tasks ─────────────────────────────────────────────────────────────────────
async function loadTasks() {
  $('task-list').innerHTML = '<div class="task-loading">Loading…</div>'
  const result = await msg('GET_TASKS')
  tasks = result?.tasks || []
  renderTasks()
}

function renderTasks() {
  const list = $('task-list')
  $('task-count').textContent = tasks.length > 0 ? tasks.length : ''

  if (tasks.length === 0) {
    list.innerHTML = '<div class="task-empty">All clear! No open tasks.</div>'
    return
  }

  list.innerHTML = ''
  tasks.forEach(task => {
    const item  = document.createElement('div')
    item.className = 'task-item'
    item.dataset.id = task.id

    const dot   = document.createElement('div')
    dot.className = `priority-dot ${task.priority || 'medium'}`

    const check = document.createElement('div')
    check.className = 'task-check'
    check.title = 'Mark done'

    const title = document.createElement('div')
    title.className = 'task-title'
    title.textContent = task.title

    check.addEventListener('click', async e => {
      e.stopPropagation()
      check.classList.add('done')
      title.classList.add('done')
      await msg('COMPLETE_TASK', { taskId: task.id })
      setTimeout(() => {
        item.style.opacity = '0'
        item.style.transition = 'opacity 0.3s'
        setTimeout(() => item.remove(), 300)
        tasks = tasks.filter(t => t.id !== task.id)
        $('task-count').textContent = tasks.length > 0 ? tasks.length : ''
      }, 400)
    })

    item.append(dot, check, title)
    list.appendChild(item)
  })
}

// ── Quick task capture ────────────────────────────────────────────────────────
async function addTask() {
  const input = $('new-task-input')
  const title = input.value.trim()
  if (!title) return

  input.value = ''
  const result = await msg('ADD_TASK', { title })
  if (result?.ok) {
    await loadTasks()
  }
}

$('btn-add-task').addEventListener('click', addTask)
$('new-task-input').addEventListener('keydown', e => {
  if (e.key === 'Enter') addTask()
})

// ── Boot ──────────────────────────────────────────────────────────────────────
init()
