/**
 * Small DOM helpers replacing the parts of jQuery/Bootstrap JS the extension
 * used: element building, modals, collapsible sections and fading.
 *
 * Only Bootstrap's stylesheet is shipped, so these helpers provide the few
 * behaviours its JavaScript would otherwise add.
 */

export interface ElementOptions {
  className?: string;
  text?: string;
  title?: string;
  href?: string;
  value?: string;
  checked?: boolean;
  disabled?: boolean;
  attributes?: Record<string, string>;
  style?: Record<string, string>;
  on?: Partial<Record<keyof HTMLElementEventMap, (event: Event) => void>>;
}

/** Create an element, apply options and append children. */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  options: ElementOptions = {},
  children: (Node | string)[] = [],
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  if (options.className) {
    element.className = options.className;
  }
  if (options.text !== undefined) {
    element.textContent = options.text;
  }
  if (options.title) {
    element.title = options.title;
  }
  if (options.href !== undefined && element.tagName === "A") {
    (element as HTMLAnchorElement).href = options.href;
  }
  if (options.value !== undefined && "value" in element) {
    (element as HTMLInputElement).value = options.value;
  }
  if (options.checked !== undefined && element.tagName === "INPUT") {
    (element as HTMLInputElement).checked = options.checked;
  }
  if (options.disabled !== undefined && "disabled" in element) {
    (element as HTMLButtonElement).disabled = options.disabled;
  }
  for (const [name, value] of Object.entries(options.attributes ?? {})) {
    element.setAttribute(name, value);
  }
  for (const [property, value] of Object.entries(options.style ?? {})) {
    element.style.setProperty(property, value);
  }
  for (const [type, listener] of Object.entries(options.on ?? {})) {
    element.addEventListener(type, listener as EventListener);
  }
  element.append(...children);
  return element;
}

/** Shorthand for `document.querySelector`. */
export function find<T extends Element = HTMLElement>(selector: string): T | null {
  return document.querySelector<T>(selector);
}

/** Shorthand for `document.querySelector`, throwing when the markup is missing. */
export function must<T extends Element = HTMLElement>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) {
    throw new Error(`Missing element: ${selector}`);
  }
  return element;
}

function setBackdrop(visible: boolean): void {
  let backdrop = document.querySelector<HTMLElement>(".modal-backdrop");
  if (visible) {
    if (!backdrop) {
      backdrop = h("div", { className: "modal-backdrop fade in" });
      document.body.append(backdrop);
    }
    return;
  }
  backdrop?.remove();
}

/** Show a Bootstrap modal without the Bootstrap JavaScript. */
export function showModal(modal: HTMLElement): void {
  modal.style.display = "block";
  modal.classList.add("in");
  modal.setAttribute("aria-hidden", "false");
  document.body.classList.add("modal-open");
  setBackdrop(true);
}

/** Hide a Bootstrap modal without the Bootstrap JavaScript. */
export function hideModal(modal: HTMLElement): void {
  modal.style.display = "none";
  modal.classList.remove("in");
  modal.setAttribute("aria-hidden", "true");
  if (!document.querySelector(".modal.in")) {
    document.body.classList.remove("modal-open");
    setBackdrop(false);
  }
}

/** Expand or collapse a Bootstrap `.collapse` section. */
export function setCollapsed(element: HTMLElement, collapsed: boolean): void {
  element.classList.toggle("in", !collapsed);
  element.style.display = collapsed ? "none" : "block";
}

/**
 * Fade an element out and hide it.
 *
 * @returns a function that cancels the pending hide.
 */
export function fadeOut(element: HTMLElement, duration = 800): () => void {
  element.style.transition = `opacity ${duration}ms linear`;
  element.style.opacity = "1";
  // Force a reflow so the transition starts from the current opacity.
  void element.offsetHeight;
  element.style.opacity = "0";
  const timer = window.setTimeout(() => {
    element.style.display = "none";
    element.style.opacity = "1";
  }, duration);
  return () => window.clearTimeout(timer);
}

/** Show an element and cancel any pending fade out. */
export function show(element: HTMLElement): void {
  element.style.display = "";
  element.style.opacity = "1";
}

/** Wire `[data-dismiss="modal"]` buttons and backdrop clicks to their modal. */
export function initModals(): void {
  document.addEventListener("click", (event) => {
    const target = event.target as HTMLElement | null;
    const dismiss = target?.closest<HTMLElement>("[data-dismiss='modal']");
    if (dismiss) {
      const modal = dismiss.closest<HTMLElement>(".modal");
      if (modal) {
        hideModal(modal);
      }
      return;
    }
    if (target?.classList.contains("modal")) {
      hideModal(target);
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") {
      return;
    }
    const modal = document.querySelector<HTMLElement>(".modal.in");
    if (modal) {
      hideModal(modal);
    }
  });
}
