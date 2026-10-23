import { beforeEach, describe, expect, it, vi } from "vitest";

type Listener<T> = (value: T, extra?: unknown) => unknown;

const listeners = {
  alarm: [] as Listener<{ name: string }>[],
  message: [] as Listener<{ method: string; args?: unknown }>[],
  storageChanged: [] as Listener<unknown>[],
  beforeRequest: [] as Listener<Record<string, unknown>>[],
};

const localData: Record<string, unknown> = {};
const syncData: Record<string, unknown> = {};

function storageArea(data: Record<string, unknown>) {
  return {
    async get(key: string) {
      return { [key]: data[key] };
    },
    async set(items: Record<string, unknown>) {
      Object.assign(data, items);
      for (const listener of listeners.storageChanged) {
        listener({}, "local");
      }
    },
  };
}

const createAlarm = vi.fn();
const sendMessage = vi.fn(async () => undefined);
const fetchMock = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  for (const key of Object.keys(localData)) {
    delete localData[key];
  }
  localData.storage = {
    enable: true,
    customRules: [{ origin: "example\\.com", target: "example.org", enable: true }],
  };

  (globalThis as Record<string, unknown>).browser = {
    alarms: {
      onAlarm: { addListener: (fn: Listener<{ name: string }>) => listeners.alarm.push(fn) },
      create: createAlarm,
    },
    runtime: {
      onMessage: {
        addListener: (fn: Listener<{ method: string; args?: unknown }>) =>
          listeners.message.push(fn),
      },
      sendMessage,
    },
    storage: {
      local: storageArea(localData),
      sync: storageArea(syncData),
      onChanged: { addListener: (fn: Listener<unknown>) => listeners.storageChanged.push(fn) },
    },
    webRequest: {
      onBeforeRequest: {
        addListener: (fn: Listener<Record<string, unknown>>) => listeners.beforeRequest.push(fn),
      },
    },
  };
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});

async function loadBackground() {
  listeners.alarm.length = 0;
  listeners.message.length = 0;
  listeners.storageChanged.length = 0;
  listeners.beforeRequest.length = 0;
  vi.resetModules();
  await import("../src/background/index");
}

describe("background", () => {
  it("redirects matching requests", async () => {
    await loadBackground();
    const handler = listeners.beforeRequest[0]!;

    await expect(
      handler({ url: "https://www.example.com/page", method: "GET", type: "main_frame" }),
    ).resolves.toEqual({ redirectUrl: "https://www.example.org/page" });
  });

  it("leaves unmatched requests alone", async () => {
    await loadBackground();
    const handler = listeners.beforeRequest[0]!;

    await expect(
      handler({ url: "https://unrelated.test/", method: "GET", type: "main_frame" }),
    ).resolves.toEqual({});
  });

  it("does nothing while redirecting is disabled", async () => {
    localData.storage = {
      enable: false,
      customRules: [{ origin: "example\\.com", target: "x", enable: true }],
    };
    await loadBackground();
    const handler = listeners.beforeRequest[0]!;

    await expect(
      handler({ url: "https://www.example.com/", method: "GET", type: "main_frame" }),
    ).resolves.toEqual({});
  });

  it("answers the download state", async () => {
    await loadBackground();
    await expect(listeners.message[0]!({ method: "isDownloading" })).resolves.toBe(false);
  });

  it("refreshes automatic subscriptions on the alarm", async () => {
    localData.storage = {
      enable: true,
      onlineURLs: [
        { url: "https://rules.example/rules.json", enable: true, auto: true, rules: [] },
      ],
    };
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ version: "1.0", rules: [{ origin: "a", target: "b" }] }),
    });

    await loadBackground();
    const alarm = listeners.alarm[0];
    expect(alarm).toBeDefined();
    alarm!({ name: "download" });

    await vi.waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith("https://rules.example/rules.json"),
    );
    await vi.waitFor(() =>
      expect(
        (localData.storage as { onlineURLs: { rules: unknown[] }[] }).onlineURLs[0]!.rules,
      ).toHaveLength(1),
    );
    expect(sendMessage).toHaveBeenCalledWith({ method: "downloaded" });
  });

  it("reports unreachable subscriptions as download errors", async () => {
    localData.storage = {
      enable: true,
      onlineURLs: [
        { url: "https://rules.example/missing.json", enable: true, auto: true, rules: [] },
      ],
    };
    fetchMock.mockResolvedValue({ ok: false, status: 404, text: async () => "" });

    await loadBackground();
    listeners.alarm[0]!({ name: "download" });

    await vi.waitFor(() =>
      expect(sendMessage).toHaveBeenCalledWith({
        method: "downloadError",
        args: ["https://rules.example/missing.json"],
      }),
    );
  });
});
