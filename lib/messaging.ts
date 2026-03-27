import type { ChromeMessage } from './types';

export function sendMessage(message: ChromeMessage): Promise<any> {
  return chrome.runtime.sendMessage(message);
}

export function sendToTab(tabId: number, message: ChromeMessage): Promise<any> {
  return chrome.tabs.sendMessage(tabId, message);
}

export function onMessage(
  callback: (
    message: ChromeMessage,
    sender: chrome.runtime.MessageSender,
    sendResponse: (response?: any) => void,
  ) => boolean | void,
) {
  chrome.runtime.onMessage.addListener(callback);
}
