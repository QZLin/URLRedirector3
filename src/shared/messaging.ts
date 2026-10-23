/**
 * Runtime messaging between the backgrounds script and the extension pages.
 */

export interface ExtensionMessage {
  method: string;
  args?: unknown;
}

/** Send a message and wait for the answer. */
export function sendMessage(message: ExtensionMessage): Promise<unknown> {
  return browser.runtime.sendMessage(message);
}

/** Send a message without caring whether anybody listens. */
export function notify(message: ExtensionMessage): void {
  void browser.runtime.sendMessage(message).catch(() => {
    // No extension page is open.
  });
}
