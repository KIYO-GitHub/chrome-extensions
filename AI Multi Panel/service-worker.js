/**
 * AI Multi Panel — Service Worker v2.5.0
 */

let hubWindowId = null;

chrome.action.onClicked.addListener(async () => {
  if (hubWindowId !== null) {
    try {
      const win = await chrome.windows.get(hubWindowId);
      if (win) { await chrome.windows.update(hubWindowId, { focused: true }); return; }
    } catch (_) { hubWindowId = null; }
  }

  const mainUrl = chrome.runtime.getURL('main.html');
  const { width: screenW, height: screenH } = await getScreenInfo();
  const winWidth  = Math.min(Math.round(screenW * 0.92), 2400);
  const winHeight = Math.min(Math.round(screenH * 0.92), 1400);

  const win = await chrome.windows.create({
    url: mainUrl, type: 'popup',
    width: winWidth, height: winHeight,
    left: Math.round((screenW - winWidth) / 2),
    top:  Math.round((screenH - winHeight) / 2),
  });
  hubWindowId = win.id;
});

chrome.windows.onRemoved.addListener((id) => { if (id === hubWindowId) hubWindowId = null; });

async function getScreenInfo() {
  try {
    const wins = await chrome.windows.getAll({ populate: false });
    const w = wins.find(w => w.focused) || wins[0];
    if (w) return { width: w.width + (w.left||0), height: w.height + (w.top||0) };
  } catch (_) {}
  return { width: 1920, height: 1080 };
}

chrome.runtime.onInstalled.addListener(() => console.log('[AI Multi Panel v2.5.0] 起動'));
