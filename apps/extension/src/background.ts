export interface Payload {
  html: string;
  url: string;
  selection: string;
}

export async function grab(tabId: number): Promise<Payload | null> {
  const [res] = await chrome.scripting.executeScript({
    target: { tabId },
    func: () => ({
      html: document.documentElement.outerHTML,
      url: location.href,
      selection: window.getSelection()?.toString() ?? "",
    }),
  });
  return (res?.result as Payload | undefined) ?? null;
}

export async function open(payload: Payload): Promise<void> {
  await chrome.storage.session.set({ mdzPayload: payload });
  await chrome.tabs.create({ url: chrome.runtime.getURL("tabs/preview.html") });
}

async function fromActiveTab(): Promise<void> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id === undefined) return;
  const payload = await grab(tab.id);
  if (payload) await open(payload);
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "mdz-page",
    title: "Copy page as Markdown",
    contexts: ["page", "frame"],
  });
  chrome.contextMenus.create({
    id: "mdz-sel",
    title: "Copy selection as Markdown",
    contexts: ["selection"],
  });
});

chrome.contextMenus.onClicked.addListener(async (_info, tab) => {
  if (tab?.id === undefined) return;
  const payload = await grab(tab.id);
  if (payload) await open(payload);
});

chrome.commands.onCommand.addListener(async (command) => {
  if (command === "mdz-copy-page" || command === "mdz-copy-selection") {
    await fromActiveTab();
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== "mdz:grab") return;
  const tabId = sender.tab?.id;
  if (tabId === undefined) {
    sendResponse(null);
    return true;
  }
  void grab(tabId).then(sendResponse);
  return true;
});
