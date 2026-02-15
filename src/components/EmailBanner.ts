const DISMISS_KEY = "em-email-banner-dismissed";
const DISMISS_DAYS = 7;

export class EmailBanner {
  private element: HTMLElement | null = null;

  constructor(parentId: string) {
    if (this.isDismissed()) return;
    this.render(parentId);
  }

  private isDismissed(): boolean {
    try {
      const dismissed = localStorage.getItem(DISMISS_KEY);
      if (!dismissed) return false;
      const dismissedAt = parseInt(dismissed, 10);
      const daysSince = (Date.now() - dismissedAt) / (1000 * 60 * 60 * 24);
      return daysSince < DISMISS_DAYS;
    } catch {
      return false;
    }
  }

  private dismiss(): void {
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {
      /* localStorage unavailable */
    }
    this.element?.remove();
  }

  private async submit(email: string): Promise<boolean> {
    try {
      const params = new URLSearchParams(window.location.search);
      const res = await fetch("/api/capture-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          source: params.get("utm_source") || "direct",
          campaign: params.get("utm_campaign") || "",
        }),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  private render(parentId: string): void {
    const parent = document.getElementById(parentId);
    if (!parent) return;

    this.element = document.createElement("div");
    this.element.className = "email-banner";
    this.element.innerHTML = `
      <div class="email-banner-inner">
        <span class="email-banner-text">Get weekly energy intelligence briefings</span>
        <form class="email-banner-form">
          <input type="email" placeholder="you@company.com" required class="email-banner-input" />
          <button type="submit" class="email-banner-submit">Subscribe</button>
        </form>
        <button class="email-banner-close" aria-label="Dismiss">&times;</button>
      </div>
    `;

    // Close button
    const closeBtn = this.element.querySelector(".email-banner-close");
    closeBtn?.addEventListener("click", () => this.dismiss());

    // Form submit
    const form = this.element.querySelector("form") as HTMLFormElement;
    const input = this.element.querySelector("input") as HTMLInputElement;
    const submitBtn = this.element.querySelector(
      ".email-banner-submit",
    ) as HTMLButtonElement;

    form?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const email = input.value.trim();
      if (!email) return;

      submitBtn.textContent = "...";
      submitBtn.disabled = true;

      const ok = await this.submit(email);
      if (ok) {
        if (this.element) {
          this.element.querySelector(".email-banner-inner")!.innerHTML =
            '<span class="email-banner-text" style="color: var(--green);">Subscribed. Watch your inbox.</span>';
          setTimeout(() => this.dismiss(), 3000);
        }
      } else {
        submitBtn.textContent = "Retry";
        submitBtn.disabled = false;
      }
    });

    // Insert before the header (first child of #app)
    parent.insertBefore(this.element, parent.firstChild);
  }
}
