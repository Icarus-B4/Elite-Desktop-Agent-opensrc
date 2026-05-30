const tabsEl = document.getElementById('tabs');
const logText = document.getElementById('logText');
const hintEl = document.getElementById('hint');
const statusPathEl = document.getElementById('statusPath');
const statusSizeEl = document.getElementById('statusSize');
const btnRefresh = document.getElementById('btnRefresh');
const btnCopy = document.getElementById('btnCopy');
const btnBottom = document.getElementById('btnBottom');

let sections = [];
let activeId = 'debug';
let userPinned = false;

function applyHudTheme(themeId) {
  const id = themeId === 1 || themeId === 2 ? themeId : 0;
  document.documentElement.dataset.hudTheme = String(id);
}

function setHint(sec) {
  if (!hintEl || !sec) return;
  const title = sec.tab || sec.label;
  const hint = sec.hint || '';
  hintEl.textContent = hint ? `${title} — ${hint}` : title;
}

function setStatus(sec) {
  if (!sec) return;
  if (statusPathEl) statusPathEl.textContent = sec.path || '—';
  if (statusSizeEl) {
    statusSizeEl.textContent = sec.exists ? `${sec.sizeKb} KB` : 'Datei fehlt';
  }
}

function renderTabs() {
  if (!tabsEl) return;
  tabsEl.innerHTML = '';
  for (const s of sections) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'tab' + (s.id === activeId ? ' active' : '');
    btn.setAttribute('role', 'tab');
    btn.setAttribute('aria-selected', s.id === activeId ? 'true' : 'false');
    btn.dataset.id = s.id;
    btn.textContent = s.tab || s.id;
    btn.title = s.label;
    btn.addEventListener('click', () => {
      activeId = s.id;
      userPinned = false;
      renderTabs();
      showSection(activeId);
    });
    tabsEl.appendChild(btn);
  }
}

function showSection(id) {
  const sec = sections.find((s) => s.id === id);
  if (!sec || !logText) return;
  activeId = id;
  logText.value = sec.content || '';
  setHint(sec);
  setStatus(sec);
  renderTabs();
}

async function loadSections() {
  if (!window.logViewer?.readSections) {
    if (logText) {
      logText.value =
        'Log-API nicht verfügbar (Preload fehlt).\n\nBitte die Elite Desktop App neu starten.';
    }
    return;
  }
  try {
    const data = await window.logViewer.readSections();
    if (data?.hudTheme !== undefined) {
      applyHudTheme(data.hudTheme);
    }
    sections = Array.isArray(data?.sections) ? data.sections : [];

    if (sections.length === 0) {
      if (logText) logText.value = 'Keine Logdateien gefunden.';
      if (tabsEl) tabsEl.innerHTML = '';
      return;
    }

    const stillThere = sections.some((s) => s.id === activeId);
    if (!stillThere) activeId = sections[0].id;

    const sec = sections.find((s) => s.id === activeId);
    const tabsUnchanged =
      tabsEl &&
      tabsEl.children.length === sections.length &&
      [...tabsEl.children].every(
        (el, i) => el.dataset.id === sections[i]?.id,
      );

    if (tabsUnchanged && sec && logText) {
      logText.value = sec.content || '';
      setHint(sec);
      setStatus(sec);
      for (const el of tabsEl.children) {
        el.classList.toggle('active', el.dataset.id === activeId);
        el.setAttribute('aria-selected', el.dataset.id === activeId ? 'true' : 'false');
      }
    } else {
      renderTabs();
      showSection(activeId);
    }
  } catch (err) {
    if (logText) logText.value = `Fehler beim Laden: ${err.message || err}`;
    if (statusPathEl) statusPathEl.textContent = 'Fehler';
    if (statusSizeEl) statusSizeEl.textContent = '';
  }
}

if (!tabsEl || !logText || !btnRefresh) {
  document.body.innerHTML =
    '<p class="error">Log-Fenster konnte nicht initialisiert werden.</p>';
} else {
  logText.addEventListener('scroll', () => {
    const nearBottom =
      logText.scrollHeight - logText.scrollTop - logText.clientHeight < 40;
    userPinned = !nearBottom;
  });

  btnRefresh.addEventListener('click', () => {
    void loadSections();
  });

  btnCopy.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(logText.value);
      if (statusPathEl) {
        const prev = statusPathEl.textContent;
        statusPathEl.textContent = 'In Zwischenablage kopiert';
        setTimeout(() => {
          if (statusPathEl.textContent === 'In Zwischenablage kopiert') {
            const sec = sections.find((s) => s.id === activeId);
            if (sec) statusPathEl.textContent = sec.path;
            else statusPathEl.textContent = prev;
          }
        }, 2000);
      }
    } catch {
      logText.select();
      document.execCommand('copy');
    }
  });

  btnBottom.addEventListener('click', () => {
    logText.scrollTop = logText.scrollHeight;
    userPinned = false;
  });

  setInterval(() => {
    const prevScroll = logText.scrollTop;
    const prevLen = logText.value.length;
    void loadSections().then(() => {
      if (!userPinned && logText.value.length !== prevLen) {
        logText.scrollTop = logText.scrollHeight;
      } else if (userPinned) {
        logText.scrollTop = prevScroll;
      }
    });
  }, 3000);

  void loadSections();
}
