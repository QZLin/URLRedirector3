/**
 * OneDrive storage of the settings file, using the Microsoft Graph API.
 *
 * See https://learn.microsoft.com/en-us/onedrive/developer/rest-api/
 */

const CLIENT_ID = "380231ba-6b4d-44ae-a1bf-8daa67c0e15a";
const GRAPH_URL = "https://graph.microsoft.com/v1.0";
const REDIRECT_URL = "https://urlredirector.github.io/auth_onedrive.html";
const SCOPE = "files.readwrite";
const RESPONSE_TYPE = "token";

function dumpQueryString(params: Record<string, string>): string {
  return Object.entries(params)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join("&");
}

const AUTH_URL = `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${dumpQueryString({
  client_id: CLIENT_ID,
  response_type: RESPONSE_TYPE,
  scope: SCOPE,
  redirect_url: REDIRECT_URL,
})}`;

interface TokenResponse {
  access_token?: string;
  token_type?: string;
  expires_in?: number;
  scope?: string;
  user_id?: string;
}

function loadQueryString(queryString: string): Record<string, string | undefined> {
  const params: Record<string, string | undefined> = {};
  for (const pair of queryString.split("&")) {
    const separator = pair.indexOf("=");
    if (separator < 0) {
      params[decodeURIComponent(pair)] = undefined;
    } else {
      params[decodeURIComponent(pair.slice(0, separator))] = decodeURIComponent(
        pair.slice(separator + 1),
      );
    }
  }
  return params;
}

export class OneDrive {
  access_token?: string;
  token_type?: string;
  expires_in = 0;
  scope?: string;
  user_id?: string;
  issued_at = new Date(0);

  #tabId: number | null = null;
  #onAuthorized: ((authorized: boolean) => void) | null = null;

  constructor() {
    browser.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
      this.#handleTabUpdated(tabId, changeInfo, tab);
    });
    browser.tabs.onRemoved.addListener((tabId) => {
      if (tabId === this.#tabId && this.#onAuthorized) {
        this.#settleAuthorization(false);
      }
    });
  }

  #handleTabUpdated(
    tabId: number,
    changeInfo: browser.tabs._OnUpdatedChangeInfo,
    tab: browser.tabs.Tab,
  ): void {
    const url = tab.url;
    if (!url || !url.startsWith(REDIRECT_URL) || changeInfo.status !== "loading") {
      return;
    }
    const token = loadQueryString(url.slice(REDIRECT_URL.length + 1)) as TokenResponse;
    this.access_token = token.access_token;
    this.token_type = token.token_type;
    this.expires_in = Number(token.expires_in ?? 0);
    this.scope = token.scope;
    this.user_id = token.user_id;
    this.issued_at = new Date();
    this.#settleAuthorization(this.#isAuthorized());
    void browser.tabs.remove(tabId);
  }

  #settleAuthorization(authorized: boolean): void {
    const callback = this.#onAuthorized;
    this.#onAuthorized = null;
    this.#tabId = null;
    callback?.(authorized);
  }

  #isAuthorized(): boolean {
    if (!this.access_token) {
      return false;
    }
    const seconds = (Date.now() - this.issued_at.getTime()) / 1000;
    return seconds <= this.expires_in - 10;
  }

  async #authorize(): Promise<boolean> {
    if (this.#onAuthorized) {
      return false;
    }
    return new Promise<boolean>((resolve) => {
      this.#onAuthorized = resolve;
      void browser.tabs
        .create({ active: true, url: AUTH_URL })
        .then((tab) => {
          this.#tabId = tab.id ?? null;
        })
        .catch(() => this.#settleAuthorization(false));
    });
  }

  async #ensureAuthorized(): Promise<void> {
    if (this.#isAuthorized()) {
      return;
    }
    if (!(await this.#authorize())) {
      throw new Error("Canceled");
    }
  }

  async upload(path: string, data: string): Promise<unknown> {
    await this.#ensureAuthorized();
    const response = await fetch(
      `${GRAPH_URL}/drive/special/approot:/${encodeURIComponent(path)}:/content`,
      {
        method: "PUT",
        headers: {
          Authorization: `bearer ${this.access_token}`,
          "Content-Type": "application/json",
        },
        body: data,
      },
    );
    if (!response.ok) {
      throw new Error(`OneDrive upload failed: HTTP ${response.status}`);
    }
    return response.json();
  }

  async download(path: string): Promise<string> {
    await this.#ensureAuthorized();
    const response = await fetch(
      `${GRAPH_URL}/drive/special/approot:/${encodeURIComponent(path)}:/content`,
      { headers: { Authorization: `bearer ${this.access_token}` } },
    );
    if (!response.ok) {
      throw new Error(`OneDrive download failed: HTTP ${response.status}`);
    }
    return response.text();
  }
}

export const onedrive = new OneDrive();
